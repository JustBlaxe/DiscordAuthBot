import { config } from "../../config";

const API = "https://discord.com/api/v10";

export async function exchangeCode(code: string) {
  const res = await fetch(`${API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.discord.clientId,
      client_secret: config.discord.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: config.discord.redirectUri,
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    console.error("Discord OAuth error response:", res.status, error);
    throw new Error(`Failed to exchange code (${res.status}): ${error}`);
  }
  return res.json() as Promise<{ access_token: string; refresh_token: string }>;
}

export async function getUser(accessToken: string) {
  const res = await fetch(`${API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) throw new Error("Failed to get user");
  return res.json() as Promise<{ id: string; username: string; avatar: string | null }>;
}

export async function getUserById(userId: string) {
  const res = await fetch(`${API}/users/${userId}`, {
    headers: { Authorization: `Bot ${config.discord.token}` },
  });

  if (!res.ok) return null;
  return res.json() as Promise<{ id: string; username: string; avatar: string | null }>;
}

export function getAvatarUrl(userId: string, avatar: string | null) {
  if (!avatar) {
    const index = Number(BigInt(userId) % 5n);
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  }
  return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png`;
}

export async function addGuildMember(userId: string, accessToken: string) {
  const res = await fetch(`${API}/guilds/${config.discord.guildId}/members/${userId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${config.discord.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ access_token: accessToken, roles: [config.roles.member] }),
  });

  return res.ok || res.status === 204;
}

export async function addRole(userId: string, roleId: string) {
  const res = await fetch(`${API}/guilds/${config.discord.guildId}/members/${userId}/roles/${roleId}`, {
    method: "PUT",
    headers: { Authorization: `Bot ${config.discord.token}` },
  });

  return res.ok || res.status === 204;
}

export function getOAuthUrl() {
  const params = new URLSearchParams({
    client_id: config.discord.clientId,
    redirect_uri: config.discord.redirectUri,
    response_type: "code",
    scope: "identify guilds.join",
  });
  return `https://discord.com/oauth2/authorize?${params}`;
}

export function getAccountAgeDays(userId: string): number {
  const snowflake = BigInt(userId);
  const timestamp = Number((snowflake >> 22n) + 1420070400000n);
  const created = new Date(timestamp);
  const now = new Date();
  return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
}

export async function kickMember(userId: string, reason: string) {
  const res = await fetch(`${API}/guilds/${config.discord.guildId}/members/${userId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bot ${config.discord.token}`,
      "X-Audit-Log-Reason": reason,
    },
  });
  return res.ok || res.status === 204;
}
