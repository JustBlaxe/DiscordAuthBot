import { Client, GatewayIntentBits, REST, Routes } from "discord.js";
import { config } from "../config";
import { log, initDatabase, startServer, setClient } from "./utils";
import { handleCommand, commands } from "./handlers";
import { setupVerification } from "./setup";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once("clientReady", async () => {
  log.ok(`Logged in as ${client.user?.tag}`);

  client.user?.setActivity(config.status.text, { type: config.status.type });

  setClient(client);
  await initDatabase();
  startServer();

  const rest = new REST().setToken(config.discord.token);
  await rest.put(Routes.applicationCommands(config.discord.clientId), {
    body: [],
  });
  await rest.put(Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId), {
    body: commands.map((c) => c.toJSON()),
  });
  log.ok("Commands registered to guild");

  const guild = await client.guilds.fetch(config.discord.guildId);
  const botMember = await guild.members.fetch(client.user!.id);
  const memberRole = await guild.roles.fetch(config.roles.member);

  if (memberRole) {
    if (botMember.roles.highest.position <= memberRole.position) {
      log.error(`Bot role is below member role cannot assign roles. Move bot role above "${memberRole.name}"`);
    } else {
      log.ok("Role hierarchy check passed");
    }
  } else {
    log.error(`Member role not found: ${config.roles.member}`);
  }

  await setupVerification(client);
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.guildId !== config.discord.guildId) return;
  if (interaction.isChatInputCommand()) await handleCommand(interaction);
});

client.login(config.discord.token);
