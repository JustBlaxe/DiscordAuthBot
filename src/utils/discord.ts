import { Client, TextChannel } from "discord.js";
import { config } from "../../config";
import { createEmbed } from "./embed";
import { log } from "./logger";

let client: Client | null = null;

export function setClient(c: Client) {
  client = c;
}

export async function sendDMWarning(userId: string, failures: number, maxFailures: number): Promise<boolean> {
  if (!client) return false;

  try {
    const user = await client.users.fetch(userId);
    const embed = createEmbed({
      title: "Verification Warning",
      fields: [
        { name: "Failed Attempts", value: `${failures}/${maxFailures}`, inline: true },
        { name: "Warning", value: `You have ${maxFailures - failures} attempt(s) remaining before automatic removal from the server.`, inline: false },
      ],
    });
    embed.setColor(config.theme.error);

    await user.send({ embeds: [embed] });
    return true;
  } catch (err) {
    log.warn(`Failed to send DM warning to ${userId}: ${err instanceof Error ? err.message : "Unknown error"}`);
    return false;
  }
}

async function sendLog(data: {
  title: string;
  fields: { name: string; value: string; inline?: boolean }[];
  color?: number;
}) {
  if (!client) return;

  try {
    const channel = (await client.channels.fetch(config.channels.logs)) as TextChannel;
    if (!channel) return;

    const embed = createEmbed({ title: data.title, fields: data.fields });
    if (data.color) embed.setColor(data.color);

    await channel.send({ embeds: [embed] });
  } catch (err) {
    log.warn(`Failed to send log: ${err instanceof Error ? err.message : "Unknown error"}`);
  }
}

export async function logVerified(username: string, id: string, ip: string, screen: string, timezone: string) {
  await sendLog({
    title: "User Verified",
    fields: [
      { name: "User", value: `${username} (<@${id}>)`, inline: true },
      { name: "IP", value: ip, inline: true },
      { name: "Screen", value: screen, inline: true },
      { name: "Timezone", value: timezone, inline: true },
    ],
    color: config.theme.success,
  });
}

export async function logBlocked(data: {
  username: string;
  id: string;
  ip: string;
  reason: string;
  vpnDetected?: boolean;
  vpnIsp?: string;
  blockedById?: string;
}) {
  const fields: { name: string; value: string; inline?: boolean }[] = [
    { name: "User", value: `${data.username} (<@${data.id}>)`, inline: true },
    { name: "IP", value: data.ip, inline: true },
    { name: "Reason", value: data.reason, inline: true },
  ];

  if (data.vpnDetected && data.vpnIsp) {
    fields.push({ name: "VPN/Proxy", value: "Yes", inline: true });
    fields.push({ name: "ISP", value: data.vpnIsp, inline: true });
  }

  if (data.blockedById) {
    fields.push({ name: "Existing Account", value: `<@${data.blockedById}>`, inline: true });
  }

  await sendLog({ title: "Verification Blocked", fields, color: config.theme.error });
}
