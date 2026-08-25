"use client";

import { useCallback, useState } from "react";
import Link from "@tiptap/extension-link";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

type Props = {
  name: string;
  initialHtml?: string | null;
};

const buttonClassName = "rounded border border-neutral-300 px-2 py-1 text-xs font-semibold";
const activeButtonClassName = "rounded border border-neutral-900 bg-neutral-900 px-2 py-1 text-xs font-semibold text-white";

export default function RichTextEditor({ name, initialHtml = "" }: Props) {
  const [html, setHtml] = useState(initialHtml || "<p></p>");
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
        code: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Link.configure({
        autolink: false,
        openOnClick: false,
        protocols: ["http", "https", "mailto", "tel"],
      }),
    ],
    content: initialHtml || "<p></p>",
    onUpdate({ editor }) {
      setHtml(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "min-h-[220px] rounded-b border border-t-0 border-neutral-300 bg-white px-3 py-2 text-sm leading-6 focus:outline-none",
      },
    },
  });

  const setLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL", previousUrl || "https://");

    if (url === null) return;
    if (url.trim() === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }, [editor]);

  if (!editor) {
    return <textarea name={name} defaultValue={initialHtml || ""} />;
  }

  return (
    <div>
      <input type="hidden" name={name} value={html} readOnly />
      <div className="flex flex-wrap gap-2 rounded-t border border-neutral-300 bg-neutral-50 p-2">
        <button
          type="button"
          onClick={() => editor.chain().focus().setParagraph().run()}
          className={editor.isActive("paragraph") ? activeButtonClassName : buttonClassName}
        >
          Normal
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={editor.isActive("heading", { level: 1 }) ? activeButtonClassName : buttonClassName}
        >
          H1
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={editor.isActive("heading", { level: 2 }) ? activeButtonClassName : buttonClassName}
        >
          H2
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={editor.isActive("bold") ? activeButtonClassName : buttonClassName}
        >
          Bold
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={editor.isActive("italic") ? activeButtonClassName : buttonClassName}
        >
          Italic
        </button>
        <button
          type="button"
          onClick={setLink}
          className={editor.isActive("link") ? activeButtonClassName : buttonClassName}
        >
          Link
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={editor.isActive("orderedList") ? activeButtonClassName : buttonClassName}
        >
          Numbered
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={editor.isActive("bulletList") ? activeButtonClassName : buttonClassName}
        >
          Bullets
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={editor.isActive("blockquote") ? activeButtonClassName : buttonClassName}
        >
          Quote
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
