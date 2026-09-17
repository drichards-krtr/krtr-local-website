import { createHash, timingSafeEqual } from "node:crypto";
import sanitizeHtml from "sanitize-html";
import { canonicalPublication, type PublicationEnvelope } from "@/apps/nrcs/lib/editorialContract";

export function authorizeNrcsService(request: Request) {
  const expected = process.env.CMS_NRCS_API_SECRET;
  const match = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i);
  if (!expected || !match) return false;
  return timingSafeEqual(createHash("sha256").update(expected).digest(), createHash("sha256").update(match[1]).digest());
}
export function sanitizePublicationHtml(html: string) {
  return sanitizeHtml(html, { allowedTags: ["p", "h1", "h2", "strong", "em", "a", "ol", "ul", "li", "blockquote", "br"], allowedAttributes: { a: ["href", "target", "rel"] }, allowedSchemes: ["http", "https", "mailto", "tel"], transformTags: { a: (_name, attributes) => ({ tagName: "a", attribs: { href: attributes.href || "", target: "_blank", rel: "noopener noreferrer" } }) }, disallowedTagsMode: "discard" }).trim();
}
export function publicationHash(envelope: PublicationEnvelope) { return createHash("sha256").update(canonicalPublication(envelope)).digest("hex"); }
