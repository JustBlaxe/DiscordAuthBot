import { Database } from "bun:sqlite";
import { config } from "../../config";
import { log } from "./logger";
import { encrypt, decrypt, isEncryptionConfigured } from "./crypto";

export const db = new Database(config.database.path);

export interface User {
  discord_id: string;
  access_token: string;
  refresh_token: string;
  verified: number;
  ip_address: string;
  fingerprint: string;
  user_agent: string;
  screen_resolution: string;
  timezone: string;
  hardware_concurrency: number;
}

export function initDatabase() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      discord_id TEXT PRIMARY KEY,
      access_token TEXT,
      refresh_token TEXT,
      verified INTEGER DEFAULT 0,
      ip_address TEXT,
      fingerprint TEXT,
      user_agent TEXT,
      screen_resolution TEXT,
      timezone TEXT,
      hardware_concurrency INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS verification_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id TEXT,
      discord_username TEXT,
      ip_address TEXT,
      fingerprint TEXT,
      user_agent TEXT,
      screen_resolution TEXT,
      timezone TEXT,
      hardware_concurrency INTEGER,
      vpn_detected INTEGER DEFAULT 0,
      vpn_isp TEXT,
      blocked INTEGER DEFAULT 0,
      block_reason TEXT,
      blocked_by_discord_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS blacklist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      value TEXT NOT NULL UNIQUE,
      reason TEXT,
      added_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
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
      completed INTEGER DEFAULT 0,
      expires_at INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run("DELETE FROM sessions WHERE expires_at < ?", [Date.now()]);
  db.run("CREATE INDEX IF NOT EXISTS idx_users_ip ON users(ip_address)");
  db.run("CREATE INDEX IF NOT EXISTS idx_users_fingerprint ON users(fingerprint)");
  db.run("CREATE INDEX IF NOT EXISTS idx_attempts_discord_id ON verification_attempts(discord_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_attempts_created_at ON verification_attempts(created_at)");
  db.run("CREATE INDEX IF NOT EXISTS idx_blacklist_value ON blacklist(value)");
  db.run("CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)");

  db.run(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL,
      reset_at INTEGER NOT NULL
    )
  `);
  db.run("CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON rate_limits(reset_at)");

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
  completed: number;
  expires_at: number;
}

export function createSession(data: {
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
}): void {
  const encryptedAccess = isEncryptionConfigured() ? encrypt(data.accessToken) : data.accessToken;
  const encryptedRefresh = isEncryptionConfigured() ? encrypt(data.refreshToken) : data.refreshToken;

  db.run(
    `INSERT INTO sessions (id, user_id, username, avatar, access_token, refresh_token, csrf_token, ip_address, user_agent, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.id, data.userId, data.username, data.avatar, encryptedAccess, encryptedRefresh, data.csrfToken, data.ip, data.userAgent, data.expiresAt]
  );
}

export function getSession(id: string): Session | null {
  const session = db.query<Session, [string]>("SELECT * FROM sessions WHERE id = ?").get(id);
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

export function markSessionCompleted(id: string): void {
  db.run("UPDATE sessions SET completed = 1 WHERE id = ?", [id]);
}

export function markSessionCompletedAtomic(id: string): boolean {
  const result = db.run(
    "UPDATE sessions SET completed = 1 WHERE id = ? AND completed = 0",
    [id]
  );
  return result.changes > 0;
}

export function deleteSession(id: string): void {
  db.run("DELETE FROM sessions WHERE id = ?", [id]);
}

export function cleanupExpiredSessions(): void {
  db.run("DELETE FROM sessions WHERE expires_at < ?", [Date.now()]);
}

export function findUserByIp(ip: string): User | null {
  return db.query<User, [string]>("SELECT * FROM users WHERE ip_address = ? AND verified = 1").get(ip);
}

export function findUserByFingerprint(fingerprint: string): User | null {
  return db.query<User, [string]>("SELECT * FROM users WHERE fingerprint = ? AND verified = 1").get(fingerprint);
}

export function findUserById(discordId: string): User | null {
  return db.query<User, [string]>("SELECT * FROM users WHERE discord_id = ?").get(discordId);
}

export function getAllVerifiedUsers(): User[] {
  const users = db.query<User, []>("SELECT * FROM users WHERE verified = 1").all();

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

export function createOrUpdateUser(data: {
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

  db.run(
    `INSERT INTO users (discord_id, access_token, refresh_token, verified, ip_address, fingerprint, user_agent, screen_resolution, timezone, hardware_concurrency)
     VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(discord_id) DO UPDATE SET
       access_token = excluded.access_token,
       refresh_token = excluded.refresh_token,
       verified = 1,
       ip_address = excluded.ip_address,
       fingerprint = excluded.fingerprint,
       user_agent = excluded.user_agent,
       screen_resolution = excluded.screen_resolution,
       timezone = excluded.timezone,
       hardware_concurrency = excluded.hardware_concurrency`,
    [
      data.discordId,
      encryptedAccess,
      encryptedRefresh,
      data.ip,
      data.fingerprint,
      data.userAgent,
      data.screenResolution,
      data.timezone,
      data.hardwareConcurrency,
    ]
  );
}

export function logVerificationAttempt(data: {
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
  db.run(
    `INSERT INTO verification_attempts (discord_id, discord_username, ip_address, fingerprint, user_agent, screen_resolution, timezone, hardware_concurrency, vpn_detected, vpn_isp, blocked, block_reason, blocked_by_discord_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.discordId,
      data.discordUsername,
      data.ip,
      data.fingerprint,
      data.userAgent,
      data.screenResolution,
      data.timezone,
      data.hardwareConcurrency,
      data.vpnDetected ? 1 : 0,
      data.vpnIsp ?? null,
      data.blocked ? 1 : 0,
      data.blockReason ?? null,
      data.blockedByDiscordId ?? null,
    ]
  );
}

export function getStats() {
  const total = db.query<{ count: number }, []>("SELECT COUNT(*) as count FROM users WHERE verified = 1").get();
  const attempts = db.query<{ count: number }, []>("SELECT COUNT(*) as count FROM verification_attempts").get();
  const blocked = db.query<{ count: number }, []>("SELECT COUNT(*) as count FROM verification_attempts WHERE blocked = 1").get();
  const vpn = db.query<{ count: number }, []>("SELECT COUNT(*) as count FROM verification_attempts WHERE vpn_detected = 1").get();

  return {
    verified: total?.count ?? 0,
    attempts: attempts?.count ?? 0,
    blocked: blocked?.count ?? 0,
    vpn: vpn?.count ?? 0,
  };
}

export function getDailyStats(days: number = 7) {
  const result = db
    .query<{ day: string; verified: number; blocked: number }, [number]>(
      `SELECT
        date(created_at) as day,
        SUM(CASE WHEN blocked = 0 THEN 1 ELSE 0 END) as verified,
        SUM(CASE WHEN blocked = 1 THEN 1 ELSE 0 END) as blocked
      FROM verification_attempts
      WHERE created_at >= date('now', '-' || ? || ' days')
      GROUP BY date(created_at)
      ORDER BY day ASC`
    )
    .all(days);

  const stats: { day: string; verified: number; blocked: number }[] = [];
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dayStr = d.toISOString().split("T")[0];
    const existing = result.find((r) => r.day === dayStr);
    stats.push({
      day: dayStr,
      verified: existing?.verified ?? 0,
      blocked: existing?.blocked ?? 0,
    });
  }

  return stats;
}

export function addToBlacklist(type: "user" | "ip", value: string, reason: string, addedBy: string) {
  db.run("INSERT OR REPLACE INTO blacklist (type, value, reason, added_by) VALUES (?, ?, ?, ?)", [type, value, reason, addedBy]);
}

export function removeFromBlacklist(value: string): boolean {
  const exists = db.query<{ value: string }, [string]>("SELECT value FROM blacklist WHERE value = ?").get(value);
  if (!exists) return false;
  db.run("DELETE FROM blacklist WHERE value = ?", [value]);
  return true;
}

export function isBlacklisted(discordId: string, ip: string): { blocked: boolean; reason?: string } {
  const user = db.query<{ reason: string }, [string]>("SELECT reason FROM blacklist WHERE type = 'user' AND value = ?").get(discordId);
  if (user) return { blocked: true, reason: user.reason };

  const ipEntry = db.query<{ reason: string }, [string]>("SELECT reason FROM blacklist WHERE type = 'ip' AND value = ?").get(ip);
  if (ipEntry) return { blocked: true, reason: ipEntry.reason };

  return { blocked: false };
}

export function getBlacklist() {
  return db.query<{ type: string; value: string; reason: string; added_by: string; created_at: string }, []>(
    "SELECT type, value, reason, added_by, created_at FROM blacklist ORDER BY created_at DESC"
  ).all();
}

export function getRecentAttempts(limit: number = 20) {
  return db.query<{
    discord_id: string;
    discord_username: string;
    ip_address: string;
    blocked: number;
    block_reason: string | null;
    created_at: string;
  }, [number]>(
    "SELECT discord_id, discord_username, ip_address, blocked, block_reason, created_at FROM verification_attempts ORDER BY created_at DESC LIMIT ?"
  ).all(limit);
}

export function getFailureCount(discordId: string): number {
  const result = db.query<{ count: number }, [string]>(
    "SELECT COUNT(*) as count FROM verification_attempts WHERE discord_id = ? AND blocked = 1"
  ).get(discordId);
  return result?.count ?? 0;
}

export function isRateLimited(key: string, maxAttempts: number, windowMs: number): boolean {
  const now = Date.now();
  const existing = db.query<{ count: number; reset_at: number }, [string]>(
    "SELECT count, reset_at FROM rate_limits WHERE key = ?"
  ).get(key);

  if (!existing || existing.reset_at < now) {
    db.run(
      "INSERT OR REPLACE INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)",
      [key, now + windowMs]
    );
    return false;
  }

  const newCount = existing.count + 1;
  db.run("UPDATE rate_limits SET count = ? WHERE key = ?", [newCount, key]);
  return newCount > maxAttempts;
}

export function cleanupExpiredRateLimits(): void {
  db.run("DELETE FROM rate_limits WHERE reset_at < ?", [Date.now()]);
}
