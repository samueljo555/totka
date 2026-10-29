import { parseRichContent } from "../../backend/rich-content";
import type { RichDocument } from "../../backend/rich-content";

/** New questions share one structured document for text, images, and mathematics. */
export function editorDocument(value: string): RichDocument {
  return (
    parseRichContent(value) || {
      version: 1,
      format: "free",
      indent: false,
      lineHeight: 1.85,
      doc: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            ...(value ? { content: [{ type: "text", text: value }] } : {}),
          },
        ],
      },
    }
  );
}
