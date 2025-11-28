import { ActivityType } from "discord.js";

const required = [
  "DISCORD_TOKEN",
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "GUILD_ID",
  "CHANNEL_VERIFY",
  "CHANNEL_LOGS",
  "ROLE_MEMBER",
  "ROLE_ADMIN",
  "VPNAPI_KEY",
  "DATABASE_URL",
] as const;

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

export const config = {
  discord: {
    token: process.env.DISCORD_TOKEN!,
    clientId: process.env.DISCORD_CLIENT_ID!,
    clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    guildId: process.env.GUILD_ID!,
    redirectUri: process.env.REDIRECT_URI || "http://localhost:3000/callback",
  },

  channels: {
    verify: process.env.CHANNEL_VERIFY!,
    logs: process.env.CHANNEL_LOGS!,
  },

  roles: {
    member: process.env.ROLE_MEMBER!,
    admin: process.env.ROLE_ADMIN!,
  },

  database: {
    url: process.env.DATABASE_URL!,
  },

  server: {
    port: parseInt(process.env.PORT || "3000"),
    corsOrigin: process.env.CORS_ORIGIN || null,
  },

  vpnapi: {
    apiKey: process.env.VPNAPI_KEY!,
  },

  verification: {
    pullbackOnly: process.env.PULLBACK_ONLY === "true",
    checkVpn: process.env.CHECK_VPN !== "false",
    checkFingerprint: process.env.CHECK_FINGERPRINT !== "false",
    checkIpDuplicate: process.env.CHECK_IP_DUPLICATE !== "false",
    sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || "300000"),
  },

  security: {
    minAccountAge: parseInt(process.env.MIN_ACCOUNT_AGE || "7"),
    rateLimit: {
      maxAttempts: parseInt(process.env.RATE_LIMIT_MAX || "5"),
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || "60000"),
    },
    autoKick: {
      enabled: process.env.AUTO_KICK !== "false",
      maxFailures: parseInt(process.env.AUTO_KICK_MAX_FAILURES || "3"),
    },
    blockedCountries: process.env.BLOCKED_COUNTRIES?.split(",").filter(Boolean) || [],
  },

  embed: {
    title: "Verification Required",
    description: "Click the button below to verify your account.",
    buttonLabel: "Click To Start Verification",
  },

  status: {
    type: ActivityType.Watching as ActivityType,
    text: "Verification",
  },

  theme: {
    color: 0x2b2d31,
    success: 0x57f287,
    error: 0xed4245,
    banner: "",
  },
};

export const toHex = (n: number) => "#" + n.toString(16).padStart(6, "0");