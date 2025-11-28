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
    path: process.env.DB_PATH || "authbot.db",
  },

  server: {
    port: parseInt(process.env.PORT || "3000"),
    corsOrigin: process.env.CORS_ORIGIN || null,
  },

  vpnapi: {
    apiKey: process.env.VPNAPI_KEY!,
  },

  verification: {
    pullbackOnly: false,
    checkVpn: true,
    checkFingerprint: true,
    checkIpDuplicate: true,
    sessionTimeout: 5 * 60 * 1000,
  },

  security: {
    minAccountAge: 7,
    rateLimit: { maxAttempts: 5, windowMs: 60 * 1000 },
    autoKick: { enabled: true, maxFailures: 3 },
    blockedCountries: [] as string[], // ["RU", "CN", "IR"]
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