import { Client, TextChannel, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { config } from "../../config";
import { log, createEmbed, getOAuthUrl } from "../utils";

export async function setupVerification(client: Client) {
  const channel = (await client.channels.fetch(config.channels.verify)) as TextChannel;
  if (!channel) {
    log.error("Verification channel not found");
    return;
  }

  const messages = await channel.messages.fetch({ limit: 10 });
  const botMessage = messages.find((m) => m.author.id === client.user?.id && !m.system);

  const embed = createEmbed({
    title: config.embed.title,
    description: config.embed.description,
    image: config.theme.banner || undefined,
  });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setLabel(config.embed.buttonLabel).setStyle(ButtonStyle.Link).setURL(getOAuthUrl())
  );

  if (botMessage) {
    await botMessage.edit({ embeds: [embed], components: [row] });
  } else {
    await channel.send({ embeds: [embed], components: [row] });
  }

  log.ok("Verification message ready");
}
