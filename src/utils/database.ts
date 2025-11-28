import postgres from "postgres";
import { config } from "../../config";
import { log } from "./logger";
import { encrypt, decrypt, isEncryptionConfigured } from "./crypto";

export const sql = postgres(config.database.url, {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10,
  onnotice: () => { },
});

export interface User {
  discord_id: string;
  access_token: string;
  refresh_token: string;
  verified: boolean;
  ip_address: string;
  fingerprint: string;
  user_agent: string;
  screen_resolution: string;
  timezone: string;
  hardware_concurrency: number;
}

export async function initDatabase() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      discord_id TEXT PRIMARY KEY,
      access_token TEXT,
      refresh_token TEXT,
      verified BOOLEAN DEFAULT FALSE,
      ip_address TEXT,
      fingerprint TEXT,
      user_agent TEXT,
      screen_resolution TEXT,
      timezone TEXT,
      hardware_concurrency INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS verification_attempts (
      id SERIAL PRIMARY KEY,
      discord_id TEXT,
      discord_username TEXT,
      ip_address TEXT,
      fingerprint TEXT,
      user_agent TEXT,
      screen_resolution TEXT,
      timezone TEXT,
      hardware_concurrency INTEGER,
      vpn_detected BOOLEAN DEFAULT FALSE,
      vpn_isp TEXT,
      blocked BOOLEAN DEFAULT FALSE,
      block_reason TEXT,
      blocked_by_discord_id TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'verified' AND data_type = 'integer'
      ) THEN
        ALTER TABLE users ALTER COLUMN verified TYPE BOOLEAN USING verified::int::boolean;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'verification_attempts' AND column_name = 'blocked' AND data_type = 'integer'
      ) THEN
        ALTER TABLE verification_attempts ALTER COLUMN blocked TYPE BOOLEAN USING blocked::int::boolean;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'verification_attempts' AND column_name = 'vpn_detected' AND data_type = 'integer'
      ) THEN
        ALTER TABLE verification_attempts ALTER COLUMN vpn_detected TYPE BOOLEAN USING vpn_detected::int::boolean;
      END IF;
    END $$;
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS blacklist (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      value TEXT NOT NULL UNIQUE,
      reason TEXT,
      added_by TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      avatar TEXT,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      csrf_token TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      user_agent TEXT NOT NULL,
      completed BOOLEAN DEFAULT FALSE,
      expires_at BIGINT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'sessions' AND column_name = 'completed' AND data_type = 'integer'
      ) THEN
        ALTER TABLE sessions ALTER COLUMN completed TYPE BOOLEAN USING completed::int::boolean;
      END IF;
    END $$;
  `;

  await sql`DELETE FROM sessions WHERE expires_at < ${Date.now()}`;
  await sql`CREATE INDEX IF NOT EXISTS idx_users_ip ON users(ip_address)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_users_fingerprint ON users(fingerprint)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_attempts_discord_id ON verification_attempts(discord_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_attempts_created_at ON verification_attempts(created_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_blacklist_value ON blacklist(value)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)`;

  await sql`
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL,
      reset_at BIGINT NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON rate_limits(reset_at)`;

  if (!isEncryptionConfigured()) {
    log.error("ENCRYPTION_KEY not configured - tokens will not be encrypted!");
  }

  log.ok("Database initialized");
}

export interface Session {
  id: string;
  user_id: string;
  username: string;
  avatar: string | null;
  access_token: string;
  refresh_token: string;
  csrf_token: string;
  ip_address: string;
  user_agent: string;
  completed: boolean;
  expires_at: number;
}

export async function createSession(data: {
  id: string;
  userId: string;
  username: string;
  avatar: string | null;
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  ip: string;
  userAgent: string;
  expiresAt: number;
}): Promise<void> {
  const encryptedAccess = isEncryptionConfigured() ? encrypt(data.accessToken) : data.accessToken;
  const encryptedRefresh = isEncryptionConfigured() ? encrypt(data.refreshToken) : data.refreshToken;

  await sql`
    INSERT INTO sessions (id, user_id, username, avatar, access_token, refresh_token, csrf_token, ip_address, user_agent, expires_at)
    VALUES (${data.id}, ${data.userId}, ${data.username}, ${data.avatar}, ${encryptedAccess}, ${encryptedRefresh}, ${data.csrfToken}, ${data.ip}, ${data.userAgent}, ${data.expiresAt})
  `;
}

export async function getSession(id: string): Promise<Session | null> {
  const [session] = await sql<Session[]>`SELECT * FROM sessions WHERE id = ${id}`;
  if (!session) return null;

  if (isEncryptionConfigured() && session.access_token.includes(":")) {
    try {
      session.access_token = decrypt(session.access_token);
      session.refresh_token = decrypt(session.refresh_token);
    } catch (err) {
      log.warn(`Failed to decrypt session tokens: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  return session;
}

export async function markSessionCompleted(id: string): Promise<void> {
  await sql`UPDATE sessions SET completed = TRUE WHERE id = ${id}`;
}

export async function markSessionCompletedAtomic(id: string): Promise<boolean> {
  const result = await sql`
    UPDATE sessions SET completed = TRUE WHERE id = ${id} AND completed = FALSE
  `;
  return result.count > 0;
}

export async function deleteSession(id: string): Promise<void> {
  await sql`DELETE FROM sessions WHERE id = ${id}`;
}

export async function cleanupExpiredSessions(): Promise<void> {
  await sql`DELETE FROM sessions WHERE expires_at < ${Date.now()}`;
}

export async function findUserByIp(ip: string): Promise<User | null> {
  const [user] = await sql<User[]>`SELECT * FROM users WHERE ip_address = ${ip} AND verified = TRUE`;
  return user || null;
}

export async function findUserByFingerprint(fingerprint: string): Promise<User | null> {
  const [user] = await sql<User[]>`SELECT * FROM users WHERE fingerprint = ${fingerprint} AND verified = TRUE`;
  return user || null;
}

export async function findUserById(discordId: string): Promise<User | null> {
  const [user] = await sql<User[]>`SELECT * FROM users WHERE discord_id = ${discordId}`;
  return user || null;
}

export async function getAllVerifiedUsers(): Promise<User[]> {
  const users = await sql<User[]>`SELECT * FROM users WHERE verified = TRUE`;

  if (isEncryptionConfigured()) {
    for (const user of users) {
      if (user.access_token?.includes(":")) {
        try {
          user.access_token = decrypt(user.access_token);
          user.refresh_token = decrypt(user.refresh_token);
        } catch (err) {
          log.warn(`Failed to decrypt tokens for user ${user.discord_id}: ${err instanceof Error ? err.message : "unknown"}`);
        }
      }
    }
  }

  return users;
}

export async function createOrUpdateUser(data: {
  discordId: string;
  accessToken: string;
  refreshToken: string;
  ip: string;
  fingerprint: string;
  userAgent: string;
  screenResolution: string;
  timezone: string;
  hardwareConcurrency: number;
}) {
  const encryptedAccess = isEncryptionConfigured() ? encrypt(data.accessToken) : data.accessToken;
  const encryptedRefresh = isEncryptionConfigured() ? encrypt(data.refreshToken) : data.refreshToken;

  await sql`
    INSERT INTO users (discord_id, access_token, refresh_token, verified, ip_address, fingerprint, user_agent, screen_resolution, timezone, hardware_concurrency)
    VALUES (${data.discordId}, ${encryptedAccess}, ${encryptedRefresh}, TRUE, ${data.ip}, ${data.fingerprint}, ${data.userAgent}, ${data.screenResolution}, ${data.timezone}, ${data.hardwareConcurrency})
    ON CONFLICT(discord_id) DO UPDATE SET
      access_token = EXCLUDED.access_token,
      refresh_token = EXCLUDED.refresh_token,
      verified = TRUE,
      ip_address = EXCLUDED.ip_address,
      fingerprint = EXCLUDED.fingerprint,
      user_agent = EXCLUDED.user_agent,
      screen_resolution = EXCLUDED.screen_resolution,
      timezone = EXCLUDED.timezone,
      hardware_concurrency = EXCLUDED.hardware_concurrency
  `;
}

export async function logVerificationAttempt(data: {
  discordId: string;
  discordUsername: string;
  ip: string;
  fingerprint: string;
  userAgent: string;
  screenResolution: string;
  timezone: string;
  hardwareConcurrency: number;
  vpnDetected: boolean;
  vpnIsp?: string;
  blocked: boolean;
  blockReason?: string;
  blockedByDiscordId?: string;
}) {
  await sql`
    INSERT INTO verification_attempts (discord_id, discord_username, ip_address, fingerprint, user_agent, screen_resolution, timezone, hardware_concurrency, vpn_detected, vpn_isp, blocked, block_reason, blocked_by_discord_id)
    VALUES (${data.discordId}, ${data.discordUsername}, ${data.ip}, ${data.fingerprint}, ${data.userAgent}, ${data.screenResolution}, ${data.timezone}, ${data.hardwareConcurrency}, ${data.vpnDetected}, ${data.vpnIsp ?? null}, ${data.blocked}, ${data.blockReason ?? null}, ${data.blockedByDiscordId ?? null})
  `;
}

export async function getStats() {
  const [total] = await sql<[{ count: string }]>`SELECT COUNT(*) as count FROM users WHERE verified = TRUE`;
  const [attempts] = await sql<[{ count: string }]>`SELECT COUNT(*) as count FROM verification_attempts`;
  const [blocked] = await sql<[{ count: string }]>`SELECT COUNT(*) as count FROM verification_attempts WHERE blocked = TRUE`;
  const [vpn] = await sql<[{ count: string }]>`SELECT COUNT(*) as count FROM verification_attempts WHERE vpn_detected = TRUE`;

  return {
    verified: parseInt(total?.count ?? "0"),
    attempts: parseInt(attempts?.count ?? "0"),
    blocked: parseInt(blocked?.count ?? "0"),
    vpn: parseInt(vpn?.count ?? "0"),
  };
}

export async function getDailyStats(days: number = 7) {
  const result = await sql<{ day: string; verified: string; blocked: string }[]>`
    SELECT
      TO_CHAR(created_at, 'YYYY-MM-DD') as day,
      SUM(CASE WHEN blocked = FALSE THEN 1 ELSE 0 END) as verified,
      SUM(CASE WHEN blocked = TRUE THEN 1 ELSE 0 END) as blocked
    FROM verification_attempts
    WHERE created_at >= CURRENT_DATE - ${days}
    GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD')
    ORDER BY day ASC
  `;

  const stats: { day: string; verified: number; blocked: number }[] = [];
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dayStr = d.toISOString().split("T")[0];
    const existing = result.find((r) => r.day === dayStr);
    stats.push({
      day: dayStr,
      verified: parseInt(existing?.verified ?? "0"),
      blocked: parseInt(existing?.blocked ?? "0"),
    });
  }

  return stats;
}

export async function addToBlacklist(type: "user" | "ip", value: string, reason: string, addedBy: string) {
  await sql`
    INSERT INTO blacklist (type, value, reason, added_by)
    VALUES (${type}, ${value}, ${reason}, ${addedBy})
    ON CONFLICT(value) DO UPDATE SET
      type = EXCLUDED.type,
      reason = EXCLUDED.reason,
      added_by = EXCLUDED.added_by
  `;
}

export async function removeFromBlacklist(value: string): Promise<boolean> {
  const [exists] = await sql<[{ value: string }?]>`SELECT value FROM blacklist WHERE value = ${value}`;
  if (!exists) return false;
  await sql`DELETE FROM blacklist WHERE value = ${value}`;
  return true;
}

export async function isBlacklisted(discordId: string, ip: string): Promise<{ blocked: boolean; reason?: string }> {
  const [user] = await sql<[{ reason: string }?]>`SELECT reason FROM blacklist WHERE type = 'user' AND value = ${discordId}`;
  if (user) return { blocked: true, reason: user.reason };

  const [ipEntry] = await sql<[{ reason: string }?]>`SELECT reason FROM blacklist WHERE type = 'ip' AND value = ${ip}`;
  if (ipEntry) return { blocked: true, reason: ipEntry.reason };

  return { blocked: false };
}

export async function getBlacklist() {
  return await sql<{ type: string; value: string; reason: string; added_by: string; created_at: string }[]>`
    SELECT type, value, reason, added_by, created_at FROM blacklist ORDER BY created_at DESC
  `;
}

export async function getRecentAttempts(limit: number = 20) {
  return await sql<{
    discord_id: string;
    discord_username: string;
    ip_address: string;
    blocked: number;
    block_reason: string | null;
    created_at: string;
  }[]>`
    SELECT discord_id, discord_username, ip_address, blocked, block_reason, created_at FROM verification_attempts ORDER BY created_at DESC LIMIT ${limit}
  `;
}

export async function getFailureCount(discordId: string): Promise<number> {
  const [result] = await sql<[{ count: string }]>`
    SELECT COUNT(*) as count FROM verification_attempts WHERE discord_id = ${discordId} AND blocked = 1
  `;
  return parseInt(result?.count ?? "0");
}

export async function isRateLimited(key: string, maxAttempts: number, windowMs: number): Promise<boolean> {
  const now = Date.now();
  const [existing] = await sql<[{ count: number; reset_at: string }?]>`
    SELECT count, reset_at FROM rate_limits WHERE key = ${key}
  `;

  if (!existing || parseInt(existing.reset_at) < now) {
    await sql`
      INSERT INTO rate_limits (key, count, reset_at)
      VALUES (${key}, 1, ${now + windowMs})
      ON CONFLICT(key) DO UPDATE SET count = 1, reset_at = EXCLUDED.reset_at
    `;
    return false;
  }

  const newCount = existing.count + 1;
  await sql`UPDATE rate_limits SET count = ${newCount} WHERE key = ${key}`;
  return newCount > maxAttempts;
}

export async function cleanupExpiredRateLimits(): Promise<void> {
  await sql`DELETE FROM rate_limits WHERE reset_at < ${Date.now()}`;
}

export async function healthCheck(): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    await sql`SELECT 1`;
    return { ok: true, latencyMs: Date.now() - start };
  } catch {
    return { ok: false, latencyMs: Date.now() - start };
  }
}
