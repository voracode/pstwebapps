"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { EditorContent, useEditor, useEditorState, type Editor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Youtube from "@tiptap/extension-youtube";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
  MonitorPlay as YoutubeIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-controls";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { cn } from "@/lib/utils/cn";
import { MediaPicker } from "./media-picker";
import { altFor, youtubeId } from "./media-types";

const isYoutubeUrl = (v: string) => v.toLowerCase().startsWith("https://") && !!youtubeId(v);

export interface RichTextValue {
  json: JSONContent | null;
  html: string;
}

/**
 * TipTap editor used for posts and website sections. The server sanitises
 * contentHtml (sanitize-html) — this component only shapes the markup.
 */
export function RichTextEditor({
  id,
  initialContent,
  onChange,
  placeholder,
  invalid,
  describedBy,
  minHeight = "min-h-64",
  editable = true,
}: {
  id: string;
  initialContent?: JSONContent | string | null;
  onChange: (v: RichTextValue) => void;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
  minHeight?: string;
  editable?: boolean;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        codeBlock: false,
        link: { openOnClick: false, autolink: true, protocols: ["mailto", "tel"], defaultProtocol: "https" },
      }),
      Image.configure({ inline: false, allowBase64: false }),
      Youtube.configure({ nocookie: true, modestBranding: true, width: 640, height: 360 }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: initialContent ?? "",
    editorProps: {
      attributes: {
        id,
        role: "textbox",
        "aria-multiline": "true",
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
        ...(invalid ? { "aria-invalid": "true" } : {}),
        class: cn(
          "prose prose-sm dark:prose-invert max-w-none px-3 py-3 focus:outline-none [&_iframe]:aspect-video [&_iframe]:h-auto [&_iframe]:w-full [&_img]:rounded-md",
          minHeight,
        ),
      },
    },
    onUpdate: ({ editor: e }) => onChange({ json: e.isEmpty ? null : e.getJSON(), html: e.isEmpty ? "" : e.getHTML() }),
  });

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border border-input bg-background focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40",
        invalid && "border-destructive",
        "[&_.is-editor-empty:first-child::before]:pointer-events-none [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:text-muted-foreground [&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
      )}
    >
      {editor && editable ? <Toolbar editor={editor} /> : editable ? <div className="h-11 border-b bg-muted/40" /> : null}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const t = useTranslations("cms.editor");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [dialog, setDialog] = useState<null | "link" | "youtube" | "image">(null);
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);

  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const openLink = () => {
    setUrl((editor.getAttributes("link").href as string | undefined) ?? "");
    setUrlError(null);
    setDialog("link");
  };

  const applyLink = () => {
    const v = url.trim();
    if (!v) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setDialog(null);
      return;
    }
    const ok = /^(https?:\/\/|mailto:|tel:|\/)/i.test(v);
    if (!ok) {
      setUrlError(t("invalidLink"));
      return;
    }
    const chain = editor.chain().focus().extendMarkRange("link");
    if (editor.state.selection.empty && !editor.isActive("link")) {
      chain.insertContent({ type: "text", text: v, marks: [{ type: "link", attrs: { href: v } }] }).run();
    } else chain.setLink({ href: v }).run();
    setDialog(null);
  };

  const applyYoutube = () => {
    const v = url.trim();
    if (!isYoutubeUrl(v)) {
      setUrlError(t("invalidYoutube"));
      return;
    }
    editor.chain().focus().setYoutubeVideo({ src: v }).run();
    setDialog(null);
  };

  const btn = (label: string, active: boolean, onClick: () => void, Icon: React.ComponentType<{ className?: string }>, disabled = false) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40",
        active && "bg-muted text-foreground",
      )}
    >
      <Icon className="size-4" />
    </button>
  );

  const sep = <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />;

  return (
    <>
      <div role="toolbar" aria-label={t("toolbar")} className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 p-1">
        {btn(t("h2"), s.h2, () => editor.chain().focus().toggleHeading({ level: 2 }).run(), Heading2)}
        {btn(t("h3"), s.h3, () => editor.chain().focus().toggleHeading({ level: 3 }).run(), Heading3)}
        {sep}
        {btn(t("bold"), s.bold, () => editor.chain().focus().toggleBold().run(), Bold)}
        {btn(t("italic"), s.italic, () => editor.chain().focus().toggleItalic().run(), Italic)}
        {btn(t("underline"), s.underline, () => editor.chain().focus().toggleUnderline().run(), UnderlineIcon)}
        {btn(t("strike"), s.strike, () => editor.chain().focus().toggleStrike().run(), Strikethrough)}
        {sep}
        {btn(t("bulletList"), s.bullet, () => editor.chain().focus().toggleBulletList().run(), List)}
        {btn(t("orderedList"), s.ordered, () => editor.chain().focus().toggleOrderedList().run(), ListOrdered)}
        {btn(t("quote"), s.quote, () => editor.chain().focus().toggleBlockquote().run(), Quote)}
        {btn(t("divider"), false, () => editor.chain().focus().setHorizontalRule().run(), Minus)}
        {sep}
        {btn(t("link"), s.link, openLink, Link2)}
        {s.link && btn(t("unlink"), false, () => editor.chain().focus().extendMarkRange("link").unsetLink().run(), Link2Off)}
        {btn(t("image"), false, () => setDialog("image"), ImagePlus)}
        {btn(
          t("youtube"),
          false,
          () => {
            setUrl("");
            setUrlError(null);
            setDialog("youtube");
          },
          YoutubeIcon,
        )}
        {sep}
        {btn(t("undo"), false, () => editor.chain().focus().undo().run(), Undo2, !s.canUndo)}
        {btn(t("redo"), false, () => editor.chain().focus().redo().run(), Redo2, !s.canRedo)}
      </div>

      <Dialog open={dialog === "link" || dialog === "youtube"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title={dialog === "youtube" ? t("youtube") : t("link")}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (dialog === "youtube") applyYoutube();
              else applyLink();
            }}
            className="space-y-4"
          >
            <Field label={dialog === "youtube" ? t("youtubeUrl") : t("linkUrl")} htmlFor="rte-url" error={urlError} hint={dialog === "link" ? t("linkHint") : undefined}>
              <Input
                type="text"
                inputMode="url"
                autoFocus
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={dialog === "youtube" ? "https://www.youtube.com/watch?v=…" : "https://"}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>
                {tc("actions.cancel")}
              </Button>
              <Button type="submit">{tc("actions.confirm")}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <MediaPicker
        open={dialog === "image"}
        onOpenChange={(o) => !o && setDialog(null)}
        kinds={["IMAGE"]}
        onSelect={([m]) => {
          if (m?.url) editor.chain().focus().setImage({ src: m.url, alt: altFor(m, locale) }).run();
        }}
      />
    </>
  );
}
