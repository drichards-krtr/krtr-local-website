import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { sanitizePublicationHtml } from "./nrcsPublication";

const processor = unified().use(remarkParse).use(remarkRehype).use(rehypeStringify);
type Node = { type: string; depth?: number; start?: number | null; url?: string; children?: Node[] };
export function convertLegacyMarkdown(markdown: string) {
  const tree = processor.parse(markdown);
  const issues = new Set<string>();
  function inspect(node: Node) {
    if (["html", "image", "imageReference", "code", "inlineCode", "thematicBreak"].includes(node.type)) issues.add(`Unsupported Markdown ${node.type}; conversion review required.`);
    if (node.type === "heading" && (node.depth || 0) > 2) issues.add("Heading level exceeds H2; conversion review required.");
    if (node.type === "list" && node.start != null && node.start !== 1) issues.add("Non-default ordered-list start would be lost; conversion review required.");
    if (node.url && !/^(?:https?:|mailto:|tel:|\/|#)/i.test(node.url)) issues.add("Relative or unsafe Markdown URL requires review.");
    node.children?.forEach(inspect);
  }
  inspect(tree as Node);
  const html = String(processor.stringify(processor.runSync(tree)));
  return { html: sanitizePublicationHtml(html), issues: [...issues] };
}
