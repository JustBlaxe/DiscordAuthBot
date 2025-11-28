import { config, toHex } from "../../config";
import { log } from "./logger";
import { exchangeCode, getUser, getUserById, getAvatarUrl, addRole, getAccountAgeDays, kickMember } from "./oauth";
import { checkVpn } from "./iphub";
import {
  findUserByIp,
  findUserByFingerprint,
  createOrUpdateUser,
  logVerificationAttempt,
  isBlacklisted,
  getFailureCount,
  createSession,
  getSession,
  markSessionCompletedAtomic,
  deleteSession,
  cleanupExpiredSessions,
  isRateLimited,
  cleanupExpiredRateLimits,
  healthCheck,
} from "./database";
import { logVerified, logBlocked, sendDMWarning } from "./discord";
import { isValidIp } from "./validation";
import { timingSafeEqual } from "crypto";

const MAX_STRING_LENGTH = 500;
const MAX_FINGERPRINT_LENGTH = 128;
const MAX_SESSION_ID_LENGTH = 36;
const MAX_BODY_SIZE = 4096;
const SESSION_CLEANUP_INTERVAL_MS = 60 * 1000;
const RATE_LIMIT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const SESSION_DELETE_DELAY_MS = 1000;

let sessionCleanupInterval: ReturnType<typeof setInterval> | null = null;
let rateLimitCleanupInterval: ReturnType<typeof setInterval> | null = null;
let server: ReturnType<typeof Bun.serve> | null = null;

export const BlockReason = {
  BLACKLISTED: "Blacklisted",
  ACCOUNT_TOO_NEW: (age: number, min: number) => `Account too new (${age}d < ${min}d)`,
  VPN_DETECTED: "VPN/Proxy detected",
  COUNTRY_BLOCKED: (country: string) => `Country blocked (${country})`,
  IP_ALREADY_VERIFIED: "IP already verified",
  DEVICE_ALREADY_VERIFIED: "Device already verified",
} as const;

function validateInput(body: Record<string, unknown>): boolean {
  const { sid, csrf, fp, sr, tz, ua } = body;
  if (typeof sid !== "string" || sid.length > MAX_SESSION_ID_LENGTH) return false;
  if (typeof csrf !== "string" || csrf.length > MAX_SESSION_ID_LENGTH) return false;
  if (typeof fp !== "string" || fp.length > MAX_FINGERPRINT_LENGTH) return false;
  if (typeof sr !== "string" || sr.length > MAX_STRING_LENGTH) return false;
  if (typeof tz !== "string" || tz.length > MAX_STRING_LENGTH) return false;
  if (typeof ua !== "string" || ua.length > MAX_STRING_LENGTH) return false;
  if (body.hc !== undefined && typeof body.hc !== "number") return false;
  return true;
}

function getClientIp(req: Request, socketAddr: { address: string } | null): string {
  if (process.env.TRUST_PROXY === "true") {
    const cfIp = req.headers.get("cf-connecting-ip");
    if (cfIp && isValidIp(cfIp)) return cfIp;

    const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0].trim();
    if (forwarded && isValidIp(forwarded)) return forwarded;

    const realIp = req.headers.get("x-real-ip");
    if (realIp && isValidIp(realIp)) return realIp;
  }
  if (socketAddr?.address && isValidIp(socketAddr.address)) {
    return socketAddr.address;
  }

  return "unknown";
}

async function checkRateLimit(ip: string, userId?: string): Promise<boolean> {
  const key = userId ? `${ip}:${userId}` : ip;
  return isRateLimited(key, config.security.rateLimit.maxAttempts, config.security.rateLimit.windowMs);
}

const successHex = toHex(config.theme.success);
const errorHex = toHex(config.theme.error);

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    const maxLen = Math.max(bufA.length, bufB.length);
    const paddedA = Buffer.alloc(maxLen);
    const paddedB = Buffer.alloc(maxLen);
    bufA.copy(paddedA);
    bufB.copy(paddedB);
    timingSafeEqual(paddedA, paddedB);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

const html = (sessionId: string, csrfToken: string, username: string, avatar: string) => {
  const cacheBust = Date.now();
  return `<!DOCTYPE html>
<html>
<head>
  <title>Verification</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#0a0a0a;color:#fff;font-family:-apple-system,system-ui,sans-serif;min-height:100vh;display:flex;justify-content:center;align-items:center}
    .box{background:#111;border:1px solid #222;border-radius:12px;padding:40px;text-align:center;width:340px}
    .avatar{width:80px;height:80px;border-radius:50%;margin-bottom:16px}
    .name{font-size:18px;font-weight:500;margin-bottom:4px}
    .sub{color:#666;font-size:14px;margin-bottom:24px}
    .spinner{width:24px;height:24px;border:2px solid #222;border-top-color:#fff;border-radius:50%;animation:spin .6s linear infinite;margin:0 auto 16px}
    @keyframes spin{to{transform:rotate(360deg)}}
    .status{font-size:14px;color:#888}
    .ok{color:${successHex}}
    .err{color:${errorHex}}
    .blocked-user{margin-top:20px;padding-top:20px;border-top:1px solid #222}
    .blocked-user img{width:48px;height:48px;border-radius:50%;margin-bottom:8px}
    .blocked-user .label{color:#666;font-size:12px;margin-bottom:8px}
    .blocked-user .bname{font-size:14px}
  </style>
</head>
<body>
  <div class="box">
    <img class="avatar" src="${escapeHtml(avatar)}" alt="">
    <div class="name">${escapeHtml(username)}</div>
    <div class="sub">Verifying your account</div>
    <div class="spinner" id="sp"></div>
    <div class="status" id="st">Please wait...</div>
    <div class="blocked-user" id="bu" style="display:none">
      <div class="label">Already verified as</div>
      <img id="ba" src="" alt="">
      <div class="bname" id="bn"></div>
    </div>
  </div>
  <div id="cfg" data-sid="${sessionId}" data-csrf="${csrfToken}" style="display:none"></div>
  <script src="/verify.js?v=${cacheBust}"></script>
</body>
</html>`;
};

const verifyJs = await Bun.file("public/verify.js").text();

export function startServer() {
  sessionCleanupInterval = setInterval(cleanupExpiredSessions, SESSION_CLEANUP_INTERVAL_MS);
  rateLimitCleanupInterval = setInterval(cleanupExpiredRateLimits, RATE_LIMIT_CLEANUP_INTERVAL_MS);

  server = Bun.serve({
    port: config.server.port,
    async fetch(req, server) {
      const url = new URL(req.url);
      const socketAddr = server.requestIP(req);
      const ip = getClientIp(req, socketAddr);
      const userAgent = req.headers.get("user-agent") || "unknown";
      const corsOrigin = config.server.corsOrigin || new URL(config.discord.redirectUri).origin;
      const securityHeaders = {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      };
      const corsHeaders = {
        ...securityHeaders,
        "Access-Control-Allow-Origin": corsOrigin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };

      if (url.pathname === "/complete" && req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      if (url.pathname === "/verify.js" && req.method === "GET") {
        return new Response(verifyJs, {
          headers: { ...securityHeaders, "Content-Type": "application/javascript", "Cache-Control": "public, max-age=3600" },
        });
      }

      if (url.pathname === "/health" && req.method === "GET") {
        const db = await healthCheck();
        const status = db.ok ? 200 : 503;
        return Response.json(
          {
            status: db.ok ? "healthy" : "unhealthy",
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            checks: {
              database: { ok: db.ok, latencyMs: db.latencyMs },
            },
          },
          { status, headers: securityHeaders }
        );
      }

      if (url.pathname === "/callback" && req.method === "GET") {
        if (await checkRateLimit(ip)) {
          return new Response("Too many requests", { status: 429, headers: securityHeaders });
        }

        const code = url.searchParams.get("code");
        if (!code) return new Response("Missing code", { status: 400, headers: securityHeaders });

        try {
          const tokens = await exchangeCode(code);
          const user = await getUser(tokens.access_token);
          const sessionId = crypto.randomUUID();
          const csrfToken = crypto.randomUUID();
          const avatar = getAvatarUrl(user.id, user.avatar);

          await createSession({
            id: sessionId,
            userId: user.id,
            username: user.username,
            avatar: user.avatar,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            csrfToken,
            ip,
            userAgent,
            expiresAt: Date.now() + config.verification.sessionTimeout,
          });

          return new Response(html(sessionId, csrfToken, user.username, avatar), {
            headers: {
              ...securityHeaders,
              "Content-Type": "text/html",
              "Content-Security-Policy": "default-src 'self'; style-src 'unsafe-inline'; img-src https://cdn.discordapp.com",
            },
          });
        } catch (err) {
          log.error(`OAuth exchange failed: ${err instanceof Error ? err.message : "Unknown error"}`);
          return new Response("Auth failed", { status: 500, headers: securityHeaders });
        }
      }

      if (url.pathname === "/complete" && req.method === "POST") {
        const contentLength = req.headers.get("content-length");
        if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
          return Response.json({ success: false, message: "Request too large" }, { status: 413, headers: corsHeaders });
        }

        try {
          const body = await req.json();

          if (!validateInput(body)) {
            log.error(`Invalid input received: ${JSON.stringify({ sid: typeof body.sid, csrf: typeof body.csrf, fp: typeof body.fp, sr: typeof body.sr, tz: typeof body.tz, ua: typeof body.ua, hc: typeof body.hc })}`);
            return Response.json({ success: false, message: "Invalid input" }, { headers: corsHeaders });
          }

          const { sid, csrf, fp, sr, tz, hc, ua } = body;

          const session = await getSession(sid);
          if (!session || session.expires_at < Date.now()) {
            if (session) await deleteSession(sid);
            return Response.json({ success: false, message: "Session expired" }, { headers: corsHeaders });
          }

          if (typeof csrf !== "string" || !safeCompare(csrf, session.csrf_token)) {
            return Response.json({ success: false, message: "Invalid request" }, { headers: corsHeaders });
          }

          if (!(await markSessionCompletedAtomic(sid))) {
            return Response.json({ success: false, message: "Already processed" }, { headers: corsHeaders });
          }
          setTimeout(() => deleteSession(sid), SESSION_DELETE_DELAY_MS);

          if (await checkRateLimit(session.ip_address, session.user_id)) {
            return Response.json({ success: false, message: "Too many attempts" }, { headers: corsHeaders });
          }

          let blocked = false;
          let blockReason = "";
          let blockedBy = "";
          let blockedByUser: { username: string; avatar: string } | null = null;
          let vpnDetected = false;
          let vpnIsp = "";

          const blacklist = await isBlacklisted(session.user_id, session.ip_address);
          if (blacklist.blocked) {
            blocked = true;
            blockReason = blacklist.reason || BlockReason.BLACKLISTED;
          }

          if (!config.verification.pullbackOnly) {
            if (!blocked && config.security.minAccountAge > 0) {
              const age = getAccountAgeDays(session.user_id);
              if (age < config.security.minAccountAge) {
                blocked = true;
                blockReason = BlockReason.ACCOUNT_TOO_NEW(age, config.security.minAccountAge);
              }
            }

            if (!blocked && config.verification.checkVpn) {
              const vpn = await checkVpn(session.ip_address);
              if (vpn.isVpn) {
                blocked = true;
                blockReason = BlockReason.VPN_DETECTED;
                vpnDetected = true;
                vpnIsp = vpn.isp;
              }
              if (!blocked && config.security.blockedCountries.length > 0) {
                if (config.security.blockedCountries.includes(vpn.countryCode)) {
                  blocked = true;
                  blockReason = BlockReason.COUNTRY_BLOCKED(vpn.country);
                }
              }
            }

            if (!blocked && config.verification.checkIpDuplicate) {
              const existing = await findUserByIp(session.ip_address);
              if (existing && existing.discord_id !== session.user_id) {
                blocked = true;
                blockReason = BlockReason.IP_ALREADY_VERIFIED;
                blockedBy = existing.discord_id;
                const u = await getUserById(existing.discord_id);
                if (u) blockedByUser = { username: u.username, avatar: getAvatarUrl(u.id, u.avatar) };
              }
            }

            if (!blocked && config.verification.checkFingerprint) {
              const existing = await findUserByFingerprint(fp);
              if (existing && existing.discord_id !== session.user_id) {
                blocked = true;
                blockReason = BlockReason.DEVICE_ALREADY_VERIFIED;
                blockedBy = existing.discord_id;
                const u = await getUserById(existing.discord_id);
                if (u) blockedByUser = { username: u.username, avatar: getAvatarUrl(u.id, u.avatar) };
              }
            }
          }

          await logVerificationAttempt({
            discordId: session.user_id,
            discordUsername: session.username,
            ip: session.ip_address,
            fingerprint: fp,
            userAgent: ua,
            screenResolution: sr,
            timezone: tz,
            hardwareConcurrency: hc,
            vpnDetected,
            vpnIsp,
            blocked,
            blockReason,
            blockedByDiscordId: blockedBy,
          });

          if (blocked) {
            log.blocked(session.username, blockReason);
            await logBlocked({
              username: session.username,
              id: session.user_id,
              ip: session.ip_address,
              reason: blockReason,
              vpnDetected,
              vpnIsp,
              blockedById: blockedBy || undefined,
            });

            if (config.security.autoKick.enabled) {
              const failures = await getFailureCount(session.user_id);
              const maxFailures = config.security.autoKick.maxFailures;

              if (failures < maxFailures) {
                await sendDMWarning(session.user_id, failures, maxFailures);
                log.info(`Sent warning to ${session.username}: ${failures}/${maxFailures} failures`);
              }

              if (failures >= maxFailures) {
                await kickMember(session.user_id, `Failed verification ${failures} times`);
                log.info(`Auto-kicked ${session.username} after ${failures} failures`);
              }
            }

            return Response.json({ success: false, message: blockReason, blockedBy: blockedByUser }, { headers: corsHeaders });
          }

          await createOrUpdateUser({
            discordId: session.user_id,
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
            ip: session.ip_address,
            fingerprint: fp,
            userAgent: ua,
            screenResolution: sr,
            timezone: tz,
            hardwareConcurrency: hc,
          });

          await addRole(session.user_id, config.roles.member);
          log.verified(session.username, session.ip_address);
          await logVerified(session.username, session.user_id, session.ip_address, sr, tz);

          return Response.json({ success: true, message: "Verified" }, { headers: corsHeaders });
        } catch (err) {
          log.error(`Verification failed: ${err instanceof Error ? err.message : "Unknown error"}`);
          return Response.json({ success: false, message: "Failed" }, { headers: corsHeaders });
        }
      }

      return new Response("Not found", { status: 404, headers: securityHeaders });
    },
  });

  log.ok(`Server on port ${config.server.port}`);

  const shutdown = () => {
    log.info("Shutting down server...");
    if (sessionCleanupInterval) clearInterval(sessionCleanupInterval);
    if (rateLimitCleanupInterval) clearInterval(rateLimitCleanupInterval);
    if (server) server.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

export function stopServer() {
  if (sessionCleanupInterval) {
    clearInterval(sessionCleanupInterval);
    sessionCleanupInterval = null;
  }
  if (rateLimitCleanupInterval) {
    clearInterval(rateLimitCleanupInterval);
    rateLimitCleanupInterval = null;
  }
  if (server) {
    server.stop();
    server = null;
  }
  log.info("Server stopped");
}
