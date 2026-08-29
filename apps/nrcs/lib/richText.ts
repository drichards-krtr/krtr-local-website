import sanitizeHtml from "sanitize-html";

export function sanitizeRichTextHtml(value: string) {
  return sanitizeHtml(value || "", {
    allowedTags: ["p", "h1", "h2", "strong", "em", "a", "ol", "ul", "li", "blockquote", "br"],
    allowedAttributes: {
      a: ["href", "target", "rel"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: "a",
        attribs: {
          href: attribs.href || "",
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
    },
    disallowedTagsMode: "discard",
  }).trim();
}

export const sanitizeEventHtml = sanitizeRichTextHtml;

export function plainTextToHtml(value: string | null | undefined) {
  const text = String(value || "").trim();
  if (!text) return "";

  return sanitizeRichTextHtml(
    text
      .split(/\n{2,}/)
      .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
      .join("")
  );
}
