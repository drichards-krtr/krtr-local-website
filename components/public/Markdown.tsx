import ReactMarkdown from "react-markdown";

export default function Markdown({ content }: { content: string }) {
  return (
    <div className="story-body">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
