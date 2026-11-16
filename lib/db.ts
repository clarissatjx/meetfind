import { Pool } from "pg";
import { createHash, randomBytes } from "node:crypto";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __pgReady: Promise<void> | undefined;
}

function pool(): Pool {
  if (!globalThis.__pgPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const local = /localhost|127\.0\.0\.1/.test(url);
    globalThis.__pgPool = new Pool({
      connectionString: url,
      max: 5,
      ssl: local || /sslmode=disable/.test(url) ? undefined : { rejectUnauthorized: false },
    });
  }
  return globalThis.__pgPool;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS groups(
  id text PRIMARY KEY, name text NOT NULL,
  start_date text NOT NULL, end_date text NOT NULL,
  day_start text NOT NULL, day_end text NOT NULL,
  slot_min int NOT NULL, tz text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS members(
  id text PRIMARY KEY, group_id text NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name text NOT NULL, token_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS members_group ON members(group_id);
CREATE TABLE IF NOT EXISTS member_sources(
  member_id text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  source text NOT NULL, synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(member_id, source));
CREATE TABLE IF NOT EXISTS busy(
  member_id text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  source text NOT NULL, start_ts timestamptz NOT NULL, end_ts timestamptz NOT NULL);
CREATE INDEX IF NOT EXISTS busy_member ON busy(member_id);
CREATE TABLE IF NOT EXISTS oauth_states(
  nonce text PRIMARY KEY, group_id text NOT NULL, member_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now());
`;

export async function db(): Promise<Pool> {
  const p = pool();
  if (!globalThis.__pgReady) {
    globalThis.__pgReady = p.query(SCHEMA).then(() => undefined);
    globalThis.__pgReady.catch(() => (globalThis.__pgReady = undefined));
  }
  await globalThis.__pgReady;
  return p;
}

export const newId = (n = 6) => randomBytes(n).toString("base64url");
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
