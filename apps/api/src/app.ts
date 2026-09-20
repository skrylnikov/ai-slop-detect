import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import type pg from "pg";
import type { Label, PublicVote, Summary, VoteKind } from "./contracts.js";
import { decodeCursor, encodeCursor, isVoteKind, parseArticleId, summary, validateComment } from "./domain.js";
import { createDb, now, type Db } from "./db.js";
import { decrypt, encrypt, hashToken, randomToken } from "./security.js";

type Env = {
  githubClientId: string | undefined;
  githubClientSecret: string | undefined;
  redirectUris: Set<string>;
  publicApiOrigin: string;
  encryptionKey: string | undefined;
  operatorToken: string | undefined;
};

type Authenticated = { userId: string; sessionId: string };
type RequestWithAuth = FastifyRequest & { auth: Authenticated | null };

const bad = (message: string) => ({ error: message });

function envConfig(): Env {
  return {
    githubClientId: process.env.GITHUB_CLIENT_ID,
    githubClientSecret: process.env.GITHUB_CLIENT_SECRET,
    redirectUris: new Set((process.env.OAUTH_REDIRECT_URIS ?? "").split(",").map((value) => value.trim()).filter(Boolean)),
    publicApiOrigin: process.env.PUBLIC_API_ORIGIN ?? "http://127.0.0.1:4310",
    encryptionKey: process.env.OAUTH_ENCRYPTION_KEY,
    operatorToken: process.env.OPERATOR_TOKEN,
  };
}

function bearer(request: FastifyRequest): string | null {
  const value = request.headers.authorization;
  return value?.startsWith("Bearer ") ? value.slice(7) : null;
}

async function optionalAuth(db: Db, request: RequestWithAuth): Promise<Authenticated | null> {
  const token = bearer(request);
  if (!token) return null;
  const result = await db.query<{ user_id: string; session_id: string }>(
    `SELECT s."userId" AS user_id, s.id AS session_id
       FROM "session" s JOIN "user" u ON u.id = s."userId"
      WHERE s."tokenHash" = $1 AND s."revokedAt" IS NULL AND s."expiresAt" > $2 AND u."blockedAt" IS NULL`,
    [hashToken(token), now()],
  );
  const auth = result.rows[0] ? { userId: result.rows[0].user_id, sessionId: result.rows[0].session_id } : null;
  request.auth = auth;
  return auth;
}

async function requireAuth(db: Db, request: RequestWithAuth, reply: { code: (status: number) => { send: (body: unknown) => unknown } }): Promise<Authenticated | null> {
  const auth = await optionalAuth(db, request);
  if (!auth) {
    reply.code(401).send(bad("authentication required"));
    return null;
  }
  return auth;
}

async function countsFor(db: Db, articleIds: number[]): Promise<Map<number, Summary>> {
  if (!articleIds.length) return new Map();
  const result = await db.query<{ article_id: number; kind: VoteKind; count: string }>(
    `SELECT v."articleId" AS article_id, v.kind, count(*)::text AS count
       FROM vote v JOIN "user" u ON u.id = v."userId"
      WHERE v."articleId" = ANY($1::int[]) AND u."blockedAt" IS NULL
      GROUP BY v."articleId", v.kind`,
    [articleIds],
  );
  const totals = new Map(articleIds.map((id) => [id, { human: 0, partial: 0, ai: 0 }]));
  for (const row of result.rows) {
    const counts = totals.get(row.article_id);
    if (counts) counts[row.kind] = Number(row.count);
  }
  return new Map([...totals].map(([id, counts]) => [id, summary(counts)]));
}

function publicVote(row: { id: string; kind: VoteKind; comment: string | null; updated_at: string; login: string; display_name: string }): PublicVote {
  return {
    id: row.id,
    kind: row.kind,
    comment: row.comment,
    updatedAt: row.updated_at,
    user: { login: row.login, displayName: row.display_name, profileUrl: `https://github.com/${encodeURIComponent(row.login)}` },
  };
}

async function githubProfile(config: Env, code: string, verifier: string, redirectUri: string, state: string): Promise<{ id: number; login: string; name?: string | null } | null> {
  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify({ client_id: config.githubClientId, client_secret: config.githubClientSecret, code, code_verifier: verifier, redirect_uri: redirectUri, state }) });
  const token = (await tokenResponse.json()) as { access_token?: string };
  if (!token.access_token) return null;
  const profileResponse = await fetch("https://api.github.com/user", { headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token.access_token}`, "user-agent": "ai-slop-labels" } });
  if (!profileResponse.ok) return null;
  const profile = (await profileResponse.json()) as { id?: number; login?: string; name?: string | null };
  return profile.id && profile.login ? { id: profile.id, login: profile.login, name: profile.name ?? null } : null;
}

export function buildApp(options: { db?: pg.Pool; env?: Env } = {}): FastifyInstance {
  const db = options.db ?? createDb();
  const config = options.env ?? envConfig();
  const app = Fastify({ logger: { redact: ["req.headers.authorization", "req.body.code", "req.body.verifier"] }, bodyLimit: 64 * 1024 });
  const writeLimits = new Map<string, { count: number; resetAt: number }>();

  app.register(cors, { origin: true, methods: ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"] });
  app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  app.addHook("onRequest", async (request, reply) => {
    const path = request.url.split("?", 1)[0] ?? "";
    if (!((request.method === "PUT" || request.method === "DELETE") && path.startsWith("/api/articles/") && path.endsWith("/vote"))) return;
    // ponytail: process-local write limiter; use shared storage when the API is scaled horizontally.
    const key = bearer(request) ?? request.ip;
    const current = writeLimits.get(key);
    const nowMs = Date.now();
    if (!current || current.resetAt <= nowMs) writeLimits.set(key, { count: 1, resetAt: nowMs + 60_000 });
    else if (current.count >= 10) return reply.header("retry-after", Math.ceil((current.resetAt - nowMs) / 1000)).code(429).send(bad("too many writes"));
    else current.count += 1;
  });
  app.addHook("onClose", async () => { if (!options.db) await db.end(); });

  app.get("/health", async () => ({ ok: true }));

  app.post<{ Body: { articleIds?: unknown[] } }>("/api/articles/summary", async (request, reply) => {
    const rawIds = Array.isArray(request.body?.articleIds) ? request.body.articleIds : [];
    const parsedIds = rawIds.map(parseArticleId);
    if (rawIds.length > 100 || parsedIds.some((id): id is null => id === null)) return reply.code(400).send(bad("articleIds must contain up to 100 positive integers"));
    const ids = [...new Set(parsedIds)] as number[];
    const summaries = await countsFor(db, ids);
    return Object.fromEntries(ids.map((id) => [id, summaries.get(id)]));
  });

  app.get<{ Params: { articleId: string }; Querystring: { cursor?: string; limit?: string } }>("/api/articles/:articleId/votes", async (request, reply) => {
    const articleId = parseArticleId(request.params.articleId);
    if (!articleId) return reply.code(400).send(bad("invalid article id"));
    const limit = Math.min(Math.max(Number(request.query.limit ?? 50) || 50, 1), 50);
    const cursor = request.query.cursor ? decodeCursor(request.query.cursor) : null;
    if (request.query.cursor && !cursor) return reply.code(400).send(bad("invalid cursor"));
    const params: unknown[] = [articleId, limit + 1];
    const cursorSql = cursor ? `AND (v."updatedAt", v.id) < ($3, $4)` : "";
    if (cursor) params.push(cursor.updatedAt, cursor.id);
    const result = await db.query<{ id: string; kind: VoteKind; comment: string | null; updated_at: string; login: string; display_name: string }>(
      `SELECT v.id, v.kind, CASE WHEN v."commentHiddenAt" IS NULL THEN v.comment ELSE NULL END AS comment,
              v."updatedAt" AS updated_at, u.login, u."displayName" AS display_name
         FROM vote v JOIN "user" u ON u.id = v."userId"
        WHERE v."articleId" = $1 AND u."blockedAt" IS NULL ${cursorSql}
        ORDER BY v."updatedAt" DESC, v.id DESC LIMIT $2`, params,
    );
    const hasNext = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);
    return { votes: rows.map(publicVote), nextCursor: hasNext && rows.at(-1) ? encodeCursor(rows.at(-1)!.updated_at, rows.at(-1)!.id) : null };
  });

  app.get<{ Params: { articleId: string } }>("/api/articles/:articleId/vote", async (request, reply) => {
    const articleId = parseArticleId(request.params.articleId);
    const auth = await optionalAuth(db, request as RequestWithAuth);
    if (!articleId || !auth) return articleId ? null : reply.code(400).send(bad("invalid article id"));
    const result = await db.query<{ id: string; kind: VoteKind; comment: string | null; updated_at: string }>(
      `SELECT id, kind, comment, "updatedAt" AS updated_at FROM vote WHERE "articleId" = $1 AND "userId" = $2`, [articleId, auth.userId],
    );
    return result.rows[0] ?? null;
  });

  app.get("/api/me", async (request, reply) => {
    const auth = await optionalAuth(db, request as RequestWithAuth);
    if (!auth) return reply.code(401).send(bad("authentication required"));
    const result = await db.query<{ id: string; login: string; display_name: string }>("SELECT id, login, \"displayName\" AS display_name FROM \"user\" WHERE id = $1", [auth.userId]);
    return result.rows[0] ? { id: result.rows[0].id, login: result.rows[0].login, displayName: result.rows[0].display_name } : reply.code(401).send(bad("authentication required"));
  });

  app.put<{ Params: { articleId: string }; Body: { kind?: unknown; comment?: unknown } }>("/api/articles/:articleId/vote", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    const articleId = parseArticleId(request.params.articleId);
    if (!articleId || !isVoteKind(request.body?.kind)) return reply.code(400).send(bad("invalid article id or vote kind"));
    const comment = validateComment(request.body.comment);
    if (comment === undefined) return reply.code(400).send(bad("comment must be plain text up to 2000 characters"));
    const auth = await requireAuth(db, request as RequestWithAuth, reply);
    if (!auth) return;
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(`INSERT INTO vote (id, "articleId", "userId", kind, comment, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$6)
        ON CONFLICT ("articleId","userId") DO UPDATE SET kind=EXCLUDED.kind, comment=EXCLUDED.comment, "updatedAt"=EXCLUDED."updatedAt"`, [randomToken(16), articleId, auth.userId, request.body.kind, comment ?? null, now()]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    const summaries = await countsFor(db, [articleId]);
    return { summary: summaries.get(articleId) };
  });

  app.delete<{ Params: { articleId: string } }>("/api/articles/:articleId/vote", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    const articleId = parseArticleId(request.params.articleId);
    if (!articleId) return reply.code(400).send(bad("invalid article id"));
    const auth = await requireAuth(db, request as RequestWithAuth, reply);
    if (!auth) return;
    await db.query("DELETE FROM vote WHERE \"articleId\" = $1 AND \"userId\" = $2", [articleId, auth.userId]);
    const summaries = await countsFor(db, [articleId]);
    return { summary: summaries.get(articleId) };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const auth = await optionalAuth(db, request as RequestWithAuth);
    if (auth) await db.query("UPDATE \"session\" SET \"revokedAt\" = $1 WHERE id = $2", [now(), auth.sessionId]);
    return { ok: true };
  });

  app.post<{ Body: { redirectUri?: unknown; challenge?: unknown; verifier?: unknown } }>("/api/auth/github/start", async (request, reply) => {
    const redirectUri = typeof request.body?.redirectUri === "string" ? request.body.redirectUri : "";
    const challenge = typeof request.body?.challenge === "string" ? request.body.challenge : "";
    const clientVerifier = typeof request.body?.verifier === "string" ? request.body.verifier : "";
    if (!config.githubClientId || !config.githubClientSecret || !config.redirectUris.has(redirectUri) || !challenge || !clientVerifier) return reply.code(400).send(bad("OAuth is not configured"));
    const state = randomToken(24);
    const verifier = randomToken(32);
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    await db.query(`INSERT INTO "oAuthTransaction" (id,state,"verifierCiphertext","redirectUri","clientChallenge","expiresAt","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7)`, [randomToken(16), state, encrypt(`${verifier}.${clientVerifier}`, config.encryptionKey), redirectUri, challenge, expiresAt, now()]);
    const params = new URLSearchParams({ client_id: config.githubClientId, redirect_uri: redirectUri, scope: "read:user", state });
    return { url: `https://github.com/login/oauth/authorize?${params}` };
  });

  app.get<{ Querystring: { code?: string; state?: string } }>("/api/auth/github/callback", async (request, reply) => {
    const { code, state } = request.query;
    if (!code || !state || !config.githubClientId || !config.githubClientSecret) return reply.code(400).send(bad("invalid OAuth callback"));
    const transaction = await db.query<{ id: string; verifier_ciphertext: string; redirect_uri: string; client_challenge: string; expires_at: string }>("SELECT id, \"verifierCiphertext\" AS verifier_ciphertext, \"redirectUri\" AS redirect_uri, \"clientChallenge\" AS client_challenge, \"expiresAt\" AS expires_at FROM \"oAuthTransaction\" WHERE state=$1", [state]);
    const row = transaction.rows[0];
    if (!row || row.expires_at <= now()) return reply.code(400).send(bad("expired OAuth state"));
    const [verifier, clientVerifier] = decrypt(row.verifier_ciphertext, config.encryptionKey).split(".");
    if (!verifier || !clientVerifier) return reply.code(400).send(bad("invalid OAuth transaction"));
    const profile = await githubProfile(config, code, verifier, row.redirect_uri, state);
    if (!profile) return reply.code(502).send(bad("GitHub token or profile request failed"));
    const exchangeCode = randomToken(32);
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const user = await client.query<{ id: string }>(`INSERT INTO "user" (id,"githubId",login,"displayName","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$5)
        ON CONFLICT ("githubId") DO UPDATE SET login=EXCLUDED.login, "displayName"=EXCLUDED."displayName", "updatedAt"=EXCLUDED."updatedAt" RETURNING id`, [randomToken(16), String(profile.id), profile.login, profile.name || profile.login, now()]);
      await client.query(`INSERT INTO "oAuthExchange" (id,code,"transactionId","userId","verifierHash","expiresAt","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7)`, [randomToken(16), exchangeCode, row.id, user.rows[0]!.id, hashToken(clientVerifier), new Date(Date.now() + 60_000).toISOString(), now()]);
      await client.query("DELETE FROM \"oAuthTransaction\" WHERE id = $1", [row.id]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    return reply.redirect(`${row.redirect_uri}?code=${encodeURIComponent(exchangeCode)}&state=${encodeURIComponent(row.client_challenge)}`);
  });

  app.post<{ Body: { code?: unknown; state?: unknown; verifier?: unknown } }>("/api/auth/github/exchange", async (request, reply) => {
    const code = typeof request.body?.code === "string" ? request.body.code : "";
    const state = typeof request.body?.state === "string" ? request.body.state : "";
    const clientVerifier = typeof request.body?.verifier === "string" ? request.body.verifier : "";
    if (!code || !state || !clientVerifier || !config.githubClientId || !config.githubClientSecret || !config.encryptionKey) return reply.code(400).send(bad("invalid OAuth exchange"));
    const transaction = await db.query<{ id: string; verifier_ciphertext: string; redirect_uri: string; expires_at: string }>("SELECT id, \"verifierCiphertext\" AS verifier_ciphertext, \"redirectUri\" AS redirect_uri, \"expiresAt\" AS expires_at FROM \"oAuthTransaction\" WHERE state=$1", [state]);
    const row = transaction.rows[0];
    if (!row || row.expires_at <= now()) return reply.code(400).send(bad("expired OAuth state"));
    const [verifier, expectedClientVerifier] = decrypt(row.verifier_ciphertext, config.encryptionKey).split(".");
    if (!verifier || expectedClientVerifier !== clientVerifier) return reply.code(400).send(bad("invalid OAuth verifier"));
    const profile = await githubProfile(config, code, verifier, row.redirect_uri, state);
    if (!profile) return reply.code(502).send(bad("GitHub token or profile request failed"));
    const token = randomToken(32);
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const user = await client.query<{ id: string }>(`INSERT INTO "user" (id,"githubId",login,"displayName","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$5)
        ON CONFLICT ("githubId") DO UPDATE SET login=EXCLUDED.login, "displayName"=EXCLUDED."displayName", "updatedAt"=EXCLUDED."updatedAt" RETURNING id`, [randomToken(16), String(profile.id), profile.login, profile.name || profile.login, now()]);
      await client.query("DELETE FROM \"oAuthTransaction\" WHERE id=$1", [row.id]);
      await client.query("INSERT INTO \"session\" (id,\"tokenHash\",\"userId\",\"expiresAt\",\"createdAt\") VALUES ($1,$2,$3,$4,$5)", [randomToken(16), hashToken(token), user.rows[0]!.id, new Date(Date.now() + 30 * 86400_000).toISOString(), now()]);
      await client.query("COMMIT");
      return { token };
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  });

  app.post<{ Body: { code?: unknown; verifier?: unknown } }>("/api/auth/exchange", async (request, reply) => {
    const code = typeof request.body?.code === "string" ? request.body.code : "";
    const verifier = typeof request.body?.verifier === "string" ? request.body.verifier : "";
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<{ id: string; user_id: string; verifier_hash: string; expires_at: string; consumed_at: string | null }>("SELECT id,\"userId\" AS user_id,\"verifierHash\" AS verifier_hash,\"expiresAt\" AS expires_at,\"consumedAt\" AS consumed_at FROM \"oAuthExchange\" WHERE code=$1 FOR UPDATE", [code]);
      const exchange = result.rows[0];
      if (!exchange || exchange.consumed_at || exchange.expires_at <= now() || hashToken(verifier) !== exchange.verifier_hash) { await client.query("ROLLBACK"); return reply.code(400).send(bad("invalid OAuth exchange")); }
      const user = await client.query<{ id: string }>("SELECT id FROM \"user\" WHERE id=$1 AND \"blockedAt\" IS NULL", [exchange.user_id]);
      const userId = user.rows[0]?.id;
      if (!userId) { await client.query("ROLLBACK"); return reply.code(400).send(bad("OAuth user not found")); }
      const token = randomToken(32);
      await client.query("UPDATE \"oAuthExchange\" SET \"consumedAt\"=$1 WHERE id=$2", [now(), exchange.id]);
      await client.query("INSERT INTO \"session\" (id,\"tokenHash\",\"userId\",\"expiresAt\",\"createdAt\") VALUES ($1,$2,$3,$4,$5)", [randomToken(16), hashToken(token), userId, new Date(Date.now() + 30 * 86400_000).toISOString(), now()]);
      await client.query("COMMIT");
      return { token };
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  });

  app.post<{ Params: { voteId: string }; Body: { token?: unknown } }>("/api/operator/votes/:voteId/hide-comment", async (request, reply) => {
    if (!config.operatorToken || request.headers["x-operator-token"] !== config.operatorToken) return reply.code(403).send(bad("operator access required"));
    await db.query("UPDATE vote SET \"commentHiddenAt\"=$1 WHERE id=$2", [now(), request.params.voteId]);
    return { ok: true };
  });

  app.post<{ Params: { userId: string } }>("/api/operator/users/:userId/block", async (request, reply) => {
    if (!config.operatorToken || request.headers["x-operator-token"] !== config.operatorToken) return reply.code(403).send(bad("operator access required"));
    await db.query("UPDATE \"user\" SET \"blockedAt\"=$1, \"updatedAt\"=$1 WHERE id=$2", [now(), request.params.userId]);
    await db.query("UPDATE \"session\" SET \"revokedAt\"=$1 WHERE \"userId\"=$2 AND \"revokedAt\" IS NULL", [now(), request.params.userId]);
    return { ok: true };
  });

  return app;
}
