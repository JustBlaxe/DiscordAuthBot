import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember, MessageFlags, AttachmentBuilder } from "discord.js";
import { config } from "../../config";
import { findUserById, getAllVerifiedUsers, getStats, getDailyStats, getRecentAttempts, addToBlacklist, removeFromBlacklist, getBlacklist } from "../utils/database";
import { addGuildMember } from "../utils/oauth";
import { createEmbed } from "../utils/embed";
import { log } from "../utils/logger";
import { createStatsGraph, createPullbackGraph } from "../utils/graph";
import { isValidIp, isValidDiscordId } from "../utils/validation";

export const commands = [
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("View all available commands"),

  new SlashCommandBuilder()
    .setName("check")
    .setDescription("Check user verification status")
    .addUserOption((opt) => opt.setName("user").setDescription("User to check").setRequired(true)),

  new SlashCommandBuilder()
    .setName("stats")
    .setDescription("View verification statistics"),

  new SlashCommandBuilder()
    .setName("pullback")
    .setDescription("Re-add verified members who left the server"),

  new SlashCommandBuilder()
    .setName("audit")
    .setDescription("View recent verification attempts"),

  new SlashCommandBuilder()
    .setName("blacklist")
    .setDescription("Manage blacklist")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Add to blacklist")
        .addStringOption((opt) => opt.setName("type").setDescription("Type").setRequired(true).addChoices({ name: "User", value: "user" }, { name: "IP", value: "ip" }))
        .addStringOption((opt) => opt.setName("value").setDescription("User ID or IP").setRequired(true))
        .addStringOption((opt) => opt.setName("reason").setDescription("Reason").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove from blacklist")
        .addStringOption((opt) => opt.setName("value").setDescription("User ID or IP").setRequired(true))
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("View blacklist")),
];

function isAdmin(member: GuildMember): boolean {
  return member.roles.cache.has(config.roles.admin);
}

async function handleHelp(interaction: ChatInputCommandInteraction) {
  const embed = createEmbed({
    title: "Available Commands",
    fields: [
      { name: "/help", value: "View all available commands", inline: false },
      { name: "/check <user>", value: "Check user verification status", inline: false },
      { name: "/stats", value: "View verification statistics", inline: false },
      { name: "/pullback", value: "Re-add verified members who left the server", inline: false },
      { name: "/audit", value: "View recent verification attempts", inline: false },
      { name: "/blacklist add <type> <value> <reason>", value: "Add user or IP to blacklist", inline: false },
      { name: "/blacklist remove <value>", value: "Remove from blacklist", inline: false },
      { name: "/blacklist list", value: "View blacklist", inline: false },
    ],
  });

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  const member = interaction.member;
  if (!member || !(member instanceof GuildMember)) {
    await interaction.reply({ content: "This command can only be used in a server", flags: MessageFlags.Ephemeral });
    return;
  }

  if (!isAdmin(member)) {
    await interaction.reply({ content: "No permission", flags: MessageFlags.Ephemeral });
    return;
  }

  try {
    switch (interaction.commandName) {
      case "help":
        await handleHelp(interaction);
        break;
      case "check":
        await handleCheck(interaction);
        break;
      case "stats":
        await handleStats(interaction);
        break;
      case "pullback":
        await handlePullback(interaction);
        break;
      case "audit":
        await handleAudit(interaction);
        break;
      case "blacklist":
        await handleBlacklist(interaction);
        break;
      default:
        await interaction.reply({ content: "Unknown command", flags: MessageFlags.Ephemeral });
    }
  } catch (err) {
    log.error(`Command ${interaction.commandName} failed: ${err instanceof Error ? err.message : "unknown error"}`);
    const content = "An error occurred while processing this command";
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content, ephemeral: true });
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  }
}

async function handleCheck(interaction: ChatInputCommandInteraction) {
  const user = interaction.options.getUser("user", true);
  const data = findUserById(user.id);

  if (!data) {
    await interaction.reply({ content: "User not found", flags: MessageFlags.Ephemeral });
    return;
  }

  const embed = createEmbed({
    title: `User: ${user.username}`,
    fields: [
      { name: "Verified", value: data.verified ? "Yes" : "No", inline: true },
      { name: "IP", value: data.ip_address || "N/A", inline: true },
      { name: "Screen", value: data.screen_resolution || "N/A", inline: true },
      { name: "Timezone", value: data.timezone || "N/A", inline: true },
      { name: "Fingerprint", value: data.fingerprint ? data.fingerprint.slice(0, 16) + "..." : "N/A", inline: true },
    ],
  });

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handleStats(interaction: ChatInputCommandInteraction) {
  const stats = getStats();
  const daily = getDailyStats(7);

  const graphBuffer = createStatsGraph(daily);
  const attachment = new AttachmentBuilder(graphBuffer, { name: "stats.png" });

  const embed = createEmbed({
    title: "Verification Statistics",
    fields: [
      { name: "Verified Users", value: String(stats.verified), inline: true },
      { name: "Total Attempts", value: String(stats.attempts), inline: true },
      { name: "Blocked", value: String(stats.blocked), inline: true },
      { name: "VPN Detected", value: String(stats.vpn), inline: true },
    ],
  });
  embed.setImage("attachment://stats.png");

  await interaction.reply({ embeds: [embed], files: [attachment], flags: MessageFlags.Ephemeral });
}

async function handlePullback(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const users = getAllVerifiedUsers();
  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply({ content: "Could not access server" });
    return;
  }

  let added = 0;
  let failed = 0;

  for (const user of users) {
    try {
      const member = await guild.members.fetch(user.discord_id).catch(() => null);
      if (member) continue;

      const success = await addGuildMember(user.discord_id, user.access_token);
      if (success) {
        added++;
        log.info(`Pulled back user ${user.discord_id}`);
      } else {
        failed++;
      }

      // Rate limit: wait 1 second between API calls
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (err) {
      log.warn(`Failed to pull back user ${user.discord_id}: ${err instanceof Error ? err.message : "unknown"}`);
      failed++;
    }
  }

  const graphBuffer = createPullbackGraph(added, failed);
  const attachment = new AttachmentBuilder(graphBuffer, { name: "pullback.png" });

  const embed = createEmbed({
    title: "Pullback Complete",
    fields: [
      { name: "Added", value: String(added), inline: true },
      { name: "Failed", value: String(failed), inline: true },
      { name: "Total Processed", value: String(added + failed), inline: true },
    ],
  });
  embed.setImage("attachment://pullback.png");

  await interaction.editReply({ embeds: [embed], files: [attachment] });
}

async function handleAudit(interaction: ChatInputCommandInteraction) {
  const attempts = getRecentAttempts(15);

  if (attempts.length === 0) {
    await interaction.reply({ content: "No recent attempts", flags: MessageFlags.Ephemeral });
    return;
  }

  const lines = attempts.map((a) => {
    const status = a.blocked ? "❌" : "✅";
    const date = new Date(a.created_at);
    const time = date.toISOString().replace("T", " ").slice(0, 19) + " UTC";
    return `${status} **${a.discord_username}** - ${a.ip_address}\n└ ${a.block_reason || "Verified"} • ${time}`;
  });

  const embed = createEmbed({
    title: "Recent Verification Attempts",
    description: lines.join("\n\n"),
  });

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handleBlacklist(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "add") {
    const type = interaction.options.getString("type", true) as "user" | "ip";
    const value = interaction.options.getString("value", true).trim();
    const reason = interaction.options.getString("reason", true).trim();

    if (type === "user" && !isValidDiscordId(value)) {
      await interaction.reply({ content: "Invalid user ID format. Must be a Discord ID (17-20 digits)", flags: MessageFlags.Ephemeral });
      return;
    }

    if (type === "ip" && !isValidIp(value)) {
      await interaction.reply({ content: "Invalid IP format. Must be a valid IPv4 or IPv6 address", flags: MessageFlags.Ephemeral });
      return;
    }

    if (reason.length > 200) {
      await interaction.reply({ content: "Reason must be 200 characters or less", flags: MessageFlags.Ephemeral });
      return;
    }

    addToBlacklist(type, value, reason, interaction.user.id);
    await interaction.reply({ content: `Added ${type} \`${value}\` to blacklist`, flags: MessageFlags.Ephemeral });
  } else if (sub === "remove") {
    const value = interaction.options.getString("value", true);

    const removed = removeFromBlacklist(value);
    if (removed) {
      await interaction.reply({ content: `Removed \`${value}\` from blacklist`, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content: `\`${value}\` was not found in blacklist`, flags: MessageFlags.Ephemeral });
    }
  } else if (sub === "list") {
    const list = getBlacklist();

    if (list.length === 0) {
      await interaction.reply({ content: "Blacklist is empty", flags: MessageFlags.Ephemeral });
      return;
    }

    const lines = list.map((e) => `**${e.type}:** \`${e.value}\`\n└ ${e.reason}`);

    const embed = createEmbed({
      title: "Blacklist",
      description: lines.join("\n\n"),
    });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}
