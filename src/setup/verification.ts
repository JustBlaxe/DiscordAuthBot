import { Client, TextChannel, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from "discord.js";
import { config } from "../../config";
import { log, createContainer, getOAuthUrl } from "../utils";

export async function setupVerification(client: Client) {
  const channel = (await client.channels.fetch(config.channels.verify)) as TextChannel;
  if (!channel) {
    log.error("Verification channel not found");
    return;
  }

  const messages = await channel.messages.fetch({ limit: 10 });
  const botMessage = messages.find((m) => m.author.id === client.user?.id && !m.system);

  const container = createContainer({
    title: config.embed.title,
    description: config.embed.description,
    image: config.theme.banner || undefined,
  });

  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setLabel(config.embed.buttonLabel).setStyle(ButtonStyle.Link).setURL(getOAuthUrl())
    )
  );

  if (botMessage) {
    await botMessage.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });
  } else {
    await channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  log.ok("Verification message ready");
}
