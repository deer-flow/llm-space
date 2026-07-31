import type { ImageContent as PiImageContent } from "@earendil-works/pi-ai";
import { Type, type Static } from "typebox";

/**
 * The text type content of a message.
 */
export const TextContent = Type.Object({
  /**
   * The type of the content.
   */
  type: Type.Literal("text"),

  /**
   * The text of the content.
   */
  text: Type.String(),
});
export type TextContent = Static<typeof TextContent>;

/** Image content shared verbatim with pi's model-facing message contract. */
export const ImageContent = Type.Object({
  /**
   * The type of the content.
   */
  type: Type.Literal("image"),

  /**
   * The MIME type of the image.
   *
   * **Examples:**
   * `image/png`, `image/jpeg`, `image/gif`, `image/webp`, etc.
   */
  mimeType: Type.String(),

  /**
   * The base64 encoded image data of the image.
   */
  data: Type.String(),
});

export type ImageContent = PiImageContent;

/**
 * The union type of the content of a message.
 */
export const MessageContent = Type.Union([TextContent, ImageContent]);
export type MessageContent = TextContent | ImageContent;
