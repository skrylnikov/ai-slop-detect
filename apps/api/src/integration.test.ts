import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { createDb, now } from "./db.js";
import { encrypt, hashToken, randomToken } from "./security.js";

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("API with PostgreSQL", () => {
  let db: pg.Pool;
  let app: ReturnType<typeof buildApp>;
  const operatorToken = "operator-test-token";
  const user = { id: "integration-user", githubId: "github-integration-user", login: "integration", displayName: "Integration User" };
  const otherUser = { id: "integration-other", githubId: "github-integration-other", login: "other", displayName: "Other User" };
  const token = "integration-session-token";
  const expiredToken = "integration-expired-token";

  async function insertUser(value: typeof user): Promise<void> {
    await db.query(
      `INSERT INTO "user" (id,"githubId",login,"displayName","createdAt","updatedAt") VALUES ($1,$2,$3,$4,now(),now())`,
      [value.id, value.githubId, value.login, value.displayName],
    );
  }

  async function insertSession(value: string, userId: string, expiresAt: string): Promise<void> {
    await db.query(
      `INSERT INTO "session" (id,"tokenHash","userId","expiresAt","createdAt") VALUES ($1,$2,$3,$4,now())`,
      [randomToken(16), hashToken(value), userId, expiresAt],
    );
  }

  beforeAll(async () => {
    db = createDb(databaseUrl);
    await db.query(`TRUNCATE "vote", "session", "oAuthExchange", "oAuthTransaction", "user" CASCADE`);
    await insertUser(user);
    await insertUser(otherUser);
    await insertSession(token, user.id, new Date(Date.now() + 60_000).toISOString());
    await insertSession(expiredToken, user.id, new Date(Date.now() - 60_000).toISOString());
    app = buildApp({
      db,
      env: {
        githubClientId: undefined,
        githubClientSecret: undefined,
        redirectUris: new Set(),
        publicApiOrigin: "http://127.0.0.1:4310",
        encryptionKey: undefined,
        operatorToken,
      },
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await db.end();
  });

  it("applies migration and enforces one current vote per user/article", async () => {
    const first = await app.inject({
      method: "PUT",
      url: "/api/articles/101/vote",
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: "human" },
    });
    expect(first.statusCode).toBe(200);

    const replacements = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        app.inject({
          method: "PUT",
          url: "/api/articles/101/vote",
          headers: { authorization: `Bearer ${token}` },
          payload: { kind: index % 2 ? "ai" : "partial", comment: `attempt ${index}` },
        }),
      ),
    );
    expect(replacements.every((response) => response.statusCode === 200)).toBe(true);
    const stored = await db.query<{ count: string; kind: string }>(
      `SELECT count(*)::text AS count, max(kind::text) AS kind FROM vote WHERE "articleId" = 101 AND "userId" = $1`,
      [user.id],
    );
    expect(stored.rows[0]).toMatchObject({ count: "1" });
    expect(["partial", "ai"]).toContain(stored.rows[0]?.kind);

    const invalid = await app.inject({
      method: "PUT",
      url: "/api/articles/101/vote",
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: "unknown", comment: "kept" },
    });
    expect(invalid.statusCode).toBe(400);
    const tooLong = await app.inject({
      method: "PUT",
      url: "/api/articles/101/vote",
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: "ai", comment: "x".repeat(2001) },
    });
    expect(tooLong.statusCode).toBe(400);
  });

  it("returns summaries, public pages, own vote and idempotent delete", async () => {
    const other = await app.inject({
      method: "PUT",
      url: "/api/articles/101/vote",
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: "partial", comment: "<b>plain text</b>" },
    });
    expect(other.statusCode).toBe(200);
    await db.query(
      `INSERT INTO vote (id,"articleId","userId",kind,comment,"createdAt","updatedAt") VALUES ($1,101,$2,'human',$3,now(),now() + interval '1 second')`,
      [randomToken(16), otherUser.id, "other comment"],
    );

    const batch = await app.inject({ method: "POST", url: "/api/articles/summary", payload: { articleIds: [101, 999] } });
    expect(batch.statusCode).toBe(200);
    expect(batch.json()).toMatchObject({ 101: { human: 1, partial: 1, ai: 0, total: 2, label: "yellow" }, 999: { total: 0, label: "grey" } });
    const duplicateBatch = await app.inject({ method: "POST", url: "/api/articles/summary", payload: { articleIds: [101, 101] } });
    expect(duplicateBatch.statusCode).toBe(200);
    expect(duplicateBatch.json()).toMatchObject({ 101: { total: 2, label: "yellow" } });

    const page = await app.inject({ method: "GET", url: "/api/articles/101/votes?limit=1" });
    expect(page.statusCode).toBe(200);
    expect(page.json().votes).toHaveLength(1);
    expect(page.json().votes[0]).not.toHaveProperty("tokenHash");
    expect(page.json().nextCursor).toBeTruthy();
    const next = await app.inject({ method: "GET", url: `/api/articles/101/votes?limit=1&cursor=${page.json().nextCursor}` });
    expect(next.statusCode).toBe(200);
    expect(next.json().votes).toHaveLength(1);

    const own = await app.inject({ method: "GET", url: "/api/articles/101/vote", headers: { authorization: `Bearer ${token}` } });
    expect(own.statusCode).toBe(200);
    expect(own.json()).toMatchObject({ kind: "partial", comment: "<b>plain text</b>" });
    const deleteHeaders = { authorization: `Bearer ${token}` };
    expect((await app.inject({ method: "DELETE", url: "/api/articles/101/vote", headers: deleteHeaders })).statusCode).toBe(200);
    expect((await app.inject({ method: "DELETE", url: "/api/articles/101/vote", headers: deleteHeaders })).statusCode).toBe(200);
  });

  it("rejects expired sessions and applies protected moderation", async () => {
    expect((await app.inject({ method: "GET", url: "/api/me" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/me", headers: { authorization: `Bearer ${expiredToken}` } })).statusCode).toBe(401);

    await db.query(
      `INSERT INTO vote (id,"articleId","userId",kind,comment,"createdAt","updatedAt") VALUES ($1,202,$2,'ai',$3,now(),now())`,
      [randomToken(16), otherUser.id, "hide me"],
    );
    const vote = await db.query<{ id: string }>(`SELECT id FROM vote WHERE "articleId"=202 AND "userId"=$1`, [otherUser.id]);
    expect((await app.inject({ method: "POST", url: `/api/operator/votes/${vote.rows[0]?.id}/hide-comment` })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: `/api/operator/votes/${vote.rows[0]?.id}/hide-comment`, headers: { "x-operator-token": operatorToken } })).statusCode).toBe(200);
    const hidden = await app.inject({ method: "GET", url: "/api/articles/202/votes" });
    expect(hidden.json().votes[0]).toMatchObject({ comment: null });

    expect((await app.inject({ method: "POST", url: `/api/operator/users/${otherUser.id}/block`, headers: { "x-operator-token": operatorToken } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/api/articles/summary", payload: { articleIds: [202] } })).json()[202]).toMatchObject({ total: 0, label: "grey" });

    await db.query(
      `INSERT INTO "user" (id,"githubId",login,"displayName","createdAt","updatedAt") VALUES ($1,$2,$3,$4,now(),now()) ON CONFLICT ("githubId") DO UPDATE SET login=EXCLUDED.login,"displayName"=EXCLUDED."displayName"`,
      ["integration-relogin", user.githubId, "integration-renamed", "Renamed User"],
    );
    const sameUser = await db.query<{ count: string; login: string }>(`SELECT count(*)::text AS count, max(login) AS login FROM "user" WHERE "githubId"=$1`, [user.githubId]);
    expect(sameUser.rows[0]).toEqual({ count: "1", login: "integration-renamed" });

    expect((await app.inject({ method: "POST", url: "/api/auth/logout", headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/me", headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(401);
  });

  it("returns retry metadata after the write limit", async () => {
    const limitedApp = buildApp({ db });
    await limitedApp.ready();
    const limitToken = "integration-rate-limit-token";
    await insertSession(limitToken, user.id, new Date(Date.now() + 60_000).toISOString());
    const responses = await Promise.all(
      Array.from({ length: 11 }, (_, index) =>
        limitedApp.inject({
          method: "PUT",
          url: "/api/articles/300/vote",
          headers: { authorization: `Bearer ${limitToken}` },
          payload: { kind: "human" },
        }),
      ),
    );
    expect(responses.some((response) => response.statusCode === 429 && response.headers["retry-after"])).toBe(true);
    await limitedApp.close();
  });

  it("rejects invalid and expired OAuth data and consumes exchanges once", async () => {
    const oauthApp = buildApp({
      db,
      env: {
        githubClientId: "client-id",
        githubClientSecret: "client-secret",
        redirectUris: new Set(["moz-extension://extension-id/callback"]),
        publicApiOrigin: "http://127.0.0.1:4310",
        encryptionKey: undefined,
        operatorToken: undefined,
      },
    });
    await oauthApp.ready();

    expect((await oauthApp.inject({
      method: "POST",
      url: "/api/auth/github/start",
      payload: { redirectUri: "https://attacker.test/callback", challenge: "client-challenge", verifier: "client-verifier" },
    })).statusCode).toBe(400);

    const start = await oauthApp.inject({
      method: "POST",
      url: "/api/auth/github/start",
      payload: { redirectUri: "moz-extension://extension-id/callback", challenge: "client-challenge", verifier: "client-verifier" },
    });
    expect(start.statusCode).toBe(200);
    expect(start.json().url).not.toContain("client-verifier");
    const state = new URL(start.json().url).searchParams.get("state");
    expect((await oauthApp.inject({ method: "GET", url: "/api/auth/github/callback?code=code&state=wrong" })).statusCode).toBe(400);

    const expiredState = randomToken(24);
    await db.query(
      `INSERT INTO "oAuthTransaction" (id,state,"verifierCiphertext","redirectUri","clientChallenge","expiresAt","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [randomToken(16), expiredState, encrypt("server-verifier.client-verifier", undefined), "moz-extension://extension-id/callback", "client-challenge", new Date(Date.now() - 1_000).toISOString(), now()],
    );
    expect((await oauthApp.inject({ method: "GET", url: `/api/auth/github/callback?code=code&state=${expiredState}` })).statusCode).toBe(400);

    await insertUser({ id: "oauth-user", githubId: "github-oauth-user", login: "oauth", displayName: "OAuth User" });
    await db.query(
      `INSERT INTO "oAuthExchange" (id,code,"transactionId","userId","verifierHash","expiresAt","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [randomToken(16), "exchange-code", randomToken(16), "oauth-user", hashToken("client-verifier"), new Date(Date.now() + 60_000).toISOString(), now()],
    );
    expect((await oauthApp.inject({ method: "POST", url: "/api/auth/exchange", payload: { code: "exchange-code", verifier: "wrong" } })).statusCode).toBe(400);
    const exchanged = await oauthApp.inject({ method: "POST", url: "/api/auth/exchange", payload: { code: "exchange-code", verifier: "client-verifier" } });
    expect(exchanged.statusCode).toBe(200);
    expect(exchanged.json().token).toBeTruthy();
    expect(JSON.stringify(exchanged.json())).not.toContain("client-verifier");
    expect((await oauthApp.inject({ method: "POST", url: "/api/auth/exchange", payload: { code: "exchange-code", verifier: "client-verifier" } })).statusCode).toBe(400);

    await oauthApp.close();
    expect(state).toBeTruthy();
  });
});
