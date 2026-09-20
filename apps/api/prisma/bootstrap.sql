DO $$ BEGIN
  CREATE TYPE "VoteKind" AS ENUM ('human', 'partial', 'ai');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "user" (
  id text PRIMARY KEY,
  "githubId" text NOT NULL UNIQUE,
  login text NOT NULL,
  "displayName" text NOT NULL,
  "blockedAt" timestamptz,
  "createdAt" timestamptz NOT NULL,
  "updatedAt" timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS "session" (
  id text PRIMARY KEY,
  "tokenHash" text NOT NULL UNIQUE,
  "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "expiresAt" timestamptz NOT NULL,
  "revokedAt" timestamptz,
  "createdAt" timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS "Session_userId_expiresAt_idx" ON "session" ("userId", "expiresAt");

CREATE TABLE IF NOT EXISTS "oAuthTransaction" (
  id text PRIMARY KEY,
  state text NOT NULL UNIQUE,
  "verifierCiphertext" text NOT NULL,
  "redirectUri" text NOT NULL,
  "clientChallenge" text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS "oAuthExchange" (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  "transactionId" text NOT NULL UNIQUE,
  "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "verifierHash" text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "consumedAt" timestamptz,
  "createdAt" timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS "vote" (
  id text PRIMARY KEY,
  "articleId" integer NOT NULL,
  "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  kind "VoteKind" NOT NULL,
  comment text,
  "commentHiddenAt" timestamptz,
  "createdAt" timestamptz NOT NULL,
  "updatedAt" timestamptz NOT NULL,
  UNIQUE ("articleId", "userId")
);

CREATE INDEX IF NOT EXISTS "Vote_articleId_updatedAt_id_idx" ON "vote" ("articleId", "updatedAt", id);
