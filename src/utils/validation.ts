export const IP_V4_REGEX = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
export const IP_V6_REGEX = /^(?:[a-fA-F0-9]{1,4}:){7}[a-fA-F0-9]{1,4}$|^::(?:[a-fA-F0-9]{1,4}:){0,6}[a-fA-F0-9]{1,4}$|^(?:[a-fA-F0-9]{1,4}:){1,7}:$|^(?:[a-fA-F0-9]{1,4}:){0,6}::(?:[a-fA-F0-9]{1,4}:){0,5}[a-fA-F0-9]{1,4}$/;
export const DISCORD_ID_REGEX = /^\d{17,20}$/;

export function isValidIp(ip: string): boolean {
  return IP_V4_REGEX.test(ip) || IP_V6_REGEX.test(ip);
}

export function isValidDiscordId(id: string): boolean {
  return DISCORD_ID_REGEX.test(id);
}
