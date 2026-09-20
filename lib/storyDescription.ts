import sanitizeHtml from "sanitize-html";
import { Parser } from "htmlparser2";

export function htmlToDescription(html: string | null | undefined, maxLength = 180) {
  const chunks: string[] = [];
  const blocks = new Set(["p", "h1", "h2", "li", "blockquote", "br", "div"]);
  const parser = new Parser({ ontext: text => chunks.push(text),
    onopentag: name => { if (blocks.has(name)) chunks.push(" "); },
    onclosetag: name => { if (blocks.has(name)) chunks.push(" "); } }, { decodeEntities: true });
  parser.end(sanitizeHtml(html || ""));
  const text = chunks.join("").replace(/\s+/g, " ").trim();
  return !text ? null : text.length <= maxLength ? text : `${text.slice(0, maxLength - 3).trimEnd()}...`;
}
