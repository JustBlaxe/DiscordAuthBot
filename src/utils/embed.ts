import { EmbedBuilder, ColorResolvable } from "discord.js";
import { config } from "../../config";

interface EmbedOptions {
  title?: string;
  description?: string;
  fields?: { name: string; value: string; inline?: boolean }[];
  image?: string;
  footer?: string;
}

export function createEmbed(options: EmbedOptions): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(config.theme.color as ColorResolvable);

  if (options.title) embed.setTitle(options.title);
  if (options.description) embed.setDescription(options.description);
  if (options.fields) embed.addFields(options.fields);
  if (options.image) embed.setImage(options.image);
  if (options.footer) embed.setFooter({ text: options.footer });

  return embed;
}
