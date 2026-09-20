import pg from "pg";

const { Pool } = pg;
export type Db = pg.Pool | pg.PoolClient;

export function createDb(connectionString = process.env.DATABASE_URL): pg.Pool {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  return new Pool({ connectionString, max: 10 });
}

export function now(): string {
  return new Date().toISOString();
}
