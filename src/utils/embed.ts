import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
} from "discord.js";
import { config } from "../../config";

interface ContainerOptions {
  title?: string;
  description?: string;
  fields?: { name: string; value: string; inline?: boolean }[];
  image?: string;
  footer?: string;
  color?: number;
}

/**
 * Builds a Components V2 Container that replaces the legacy embed layout.
 * Messages using the returned container must be sent with the
 * MessageFlags.IsComponentsV2 flag (content/embeds are disabled).
 */
export function createContainer(options: ContainerOptions): ContainerBuilder {
  const container = new ContainerBuilder().setAccentColor(options.color ?? config.theme.color);

  const header: string[] = [];
  if (options.title) header.push(`## ${options.title}`);
  if (options.description) header.push(options.description);
  if (header.length) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(header.join("\n\n")));
  }

  if (options.fields?.length) {
    const fieldText = options.fields.map((f) => `**${f.name}**\n${f.value}`).join("\n\n");
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(fieldText));
  }

  if (options.image) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(options.image))
    );
  }

  if (options.footer) {
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${options.footer}`));
  }

  return container;
}
