import { useEffect, useRef, useState } from "react";

export type RichTextRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
};

const BLOCK_TAGS = new Set(["DIV", "P", "LI", "UL", "OL"]);
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED"]);
const ALLOWED_TAGS = new Set(["DIV", "P", "BR", "STRONG", "B", "EM", "I", "U", "SPAN", "UL", "OL", "LI"]);
const COLOR_OPTIONS = ["#111827", "#dc2626", "#ea580c", "#16a34a", "#2563eb", "#7c3aed"];

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function looksLikeRichText(value: string) {
  return /<\/?(?:div|p|br|strong|b|em|i|u|span|ul|ol|li|font)\b/i.test(value);
}

function normalizeColor(value: string) {
  const color = String(value || "").trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(color) || /^#[0-9a-f]{6}$/.test(color)) return color;
  const rgb = color.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/);
  if (!rgb) return "";
  const values = rgb.slice(1, 4).map((item) => Math.min(255, Math.max(0, Number(item))));
  return `#${values.map((item) => item.toString(16).padStart(2, "0")).join("")}`;
}

function plainTextToHtml(value: string) {
  return escapeHtml(String(value || "")).replace(/\r\n?|\n/g, "<br>");
}

export function sanitizeRichTextHtml(value: unknown) {
  const source = String(value || "");
  if (!source) return "";
  if (typeof DOMParser === "undefined" || typeof document === "undefined") {
    return looksLikeRichText(source) ? source : plainTextToHtml(source);
  }

  const parsed = new DOMParser().parseFromString(
    looksLikeRichText(source) ? source : plainTextToHtml(source),
    "text/html"
  );
  const output = document.createElement("div");

  const appendSafeNode = (node: Node, target: HTMLElement) => {
    if (node.nodeType === Node.TEXT_NODE) {
      target.appendChild(document.createTextNode(node.textContent || ""));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const element = node as HTMLElement;
    const tagName = element.tagName.toUpperCase();
    if (SKIP_TAGS.has(tagName)) return;

    const normalizedTag = tagName === "FONT" ? "SPAN" : tagName;
    if (!ALLOWED_TAGS.has(normalizedTag)) {
      Array.from(element.childNodes).forEach((child) => appendSafeNode(child, target));
      return;
    }

    const safeElement = document.createElement(normalizedTag.toLowerCase());
    if (normalizedTag === "SPAN") {
      const color = normalizeColor(element.style.color || element.getAttribute("color") || "");
      if (color) safeElement.style.color = color;
      if (element.style.fontWeight === "bold" || Number(element.style.fontWeight) >= 600) safeElement.style.fontWeight = "bold";
      if (element.style.fontStyle === "italic") safeElement.style.fontStyle = "italic";
      if (element.style.textDecoration.includes("underline")) safeElement.style.textDecoration = "underline";
    }
    Array.from(element.childNodes).forEach((child) => appendSafeNode(child, safeElement));
    target.appendChild(safeElement);
  };

  Array.from(parsed.body.childNodes).forEach((node) => appendSafeNode(node, output));
  return output.innerHTML
    .replace(/(?:<br>\s*){3,}/gi, "<br><br>")
    .trim();
}

export function parseRichTextRuns(value: unknown): RichTextRun[] {
  const source = sanitizeRichTextHtml(value);
  if (!source) return [];
  if (typeof DOMParser === "undefined") {
    return [{ text: String(value || "").replace(/<[^>]*>/g, "") }];
  }

  const parsed = new DOMParser().parseFromString(source, "text/html");
  const runs: RichTextRun[] = [];
  const pushRun = (run: RichTextRun) => {
    if (!run.text) return;
    const previous = runs[runs.length - 1];
    if (
      previous &&
      previous.bold === run.bold &&
      previous.italic === run.italic &&
      previous.underline === run.underline &&
      previous.color === run.color
    ) {
      previous.text += run.text;
    } else {
      runs.push({ ...run });
    }
  };

  const visit = (node: Node, style: Omit<RichTextRun, "text">) => {
    if (node.nodeType === Node.TEXT_NODE) {
      pushRun({ text: node.textContent || "", ...style });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    const tagName = element.tagName.toUpperCase();
    if (tagName === "BR") {
      pushRun({ text: "\n", ...style });
      return;
    }

    const nextStyle = { ...style };
    if (tagName === "STRONG" || tagName === "B" || element.style.fontWeight === "bold" || Number(element.style.fontWeight) >= 600) nextStyle.bold = true;
    if (tagName === "EM" || tagName === "I" || element.style.fontStyle === "italic") nextStyle.italic = true;
    if (tagName === "U" || element.style.textDecoration.includes("underline")) nextStyle.underline = true;
    const color = normalizeColor(element.style.color || "");
    if (color) nextStyle.color = color;

    const shouldBreak = BLOCK_TAGS.has(tagName) && runs.length > 0 && !runs[runs.length - 1].text.endsWith("\n");
    if (shouldBreak) pushRun({ text: "\n", ...style });
    Array.from(element.childNodes).forEach((child) => visit(child, nextStyle));
    if (BLOCK_TAGS.has(tagName) && runs.length > 0 && !runs[runs.length - 1].text.endsWith("\n")) {
      pushRun({ text: "\n", ...style });
    }
  };

  Array.from(parsed.body.childNodes).forEach((node) => visit(node, {}));
  if (runs[runs.length - 1]?.text.endsWith("\n")) {
    runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/\n+$/, "");
  }
  return runs.filter((run) => run.text);
}

export function richTextToPlainText(value: unknown) {
  return parseRichTextRuns(value)
    .map((run) => run.text)
    .join("")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function hasRichTextContent(value: unknown) {
  return Boolean(richTextToPlainText(value));
}

export function RichTextContent({ value, fallback = "-", className = "" }: { value: unknown; fallback?: string; className?: string }) {
  const html = sanitizeRichTextHtml(value);
  if (!hasRichTextContent(html)) return <div className={className}>{fallback}</div>;
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = 132,
  tone = "emerald",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  minHeight?: number;
  tone?: "emerald" | "amber" | "violet";
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<Range | null>(null);
  const [selectedColor, setSelectedColor] = useState(COLOR_OPTIONS[0]);
  const ringClass = tone === "amber" ? "focus-within:border-amber-500 focus-within:ring-amber-100" : tone === "violet" ? "focus-within:border-violet-500 focus-within:ring-violet-100" : "focus-within:border-emerald-600 focus-within:ring-emerald-100";

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor) return;
    const safeHtml = sanitizeRichTextHtml(value);
    if (editor.innerHTML !== safeHtml) editor.innerHTML = safeHtml;
  }, [value]);

  const rememberSelection = () => {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !editorRef.current?.contains(selection.anchorNode)) return;
    selectionRef.current = selection.getRangeAt(0).cloneRange();
  };

  const restoreSelection = () => {
    const selection = window.getSelection();
    const range = selectionRef.current;
    if (!selection || !range) return;
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const commit = (normalizeEditor = false) => {
    const editor = editorRef.current;
    if (!editor) return;
    const safeHtml = sanitizeRichTextHtml(editor.innerHTML);
    if (normalizeEditor && editor.innerHTML !== safeHtml) editor.innerHTML = safeHtml;
    onChange(hasRichTextContent(safeHtml) ? safeHtml : "");
  };

  const applyCommand = (command: "bold" | "italic" | "underline" | "removeFormat" | "foreColor", commandValue?: string) => {
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(command, false, commandValue);
    rememberSelection();
    commit(true);
  };

  const toolbarButton = (label: string, title: string, command: "bold" | "italic" | "underline" | "removeFormat", className = "") => (
    <button
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(event) => {
        event.preventDefault();
        applyCommand(command);
      }}
      className={`flex h-9 min-w-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-2 text-sm font-black text-slate-700 transition hover:border-violet-300 hover:bg-violet-50 ${className}`}
    >
      {label}
    </button>
  );

  return (
    <div className={`mt-2 overflow-hidden rounded-xl border border-slate-300 bg-white shadow-inner transition focus-within:ring-4 ${ringClass}`}>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-2.5 py-2">
        {toolbarButton("B", "ตัวหนา", "bold")}
        {toolbarButton("I", "ตัวเอียง", "italic", "italic")}
        {toolbarButton("U", "ขีดเส้นใต้", "underline", "underline")}
        <div className="mx-1 h-6 w-px bg-slate-200" />
        <div className="flex items-center gap-1" aria-label="สีตัวอักษร">
          {COLOR_OPTIONS.map((color) => (
            <button
              key={color}
              type="button"
              title={`สีตัวอักษร ${color}`}
              onMouseDown={(event) => {
                event.preventDefault();
                setSelectedColor(color);
                applyCommand("foreColor", color);
              }}
              className={`h-7 w-7 rounded-full border-2 bg-white p-1 transition hover:scale-110 ${selectedColor === color ? "border-slate-900" : "border-transparent"}`}
            >
              <span className="block h-full w-full rounded-full" style={{ backgroundColor: color }} />
            </button>
          ))}
        </div>
        <div className="mx-1 h-6 w-px bg-slate-200" />
        {toolbarButton("Tx", "ล้างรูปแบบ", "removeFormat", "text-xs")}
        <span className="ml-auto text-[10px] font-bold text-slate-400">เลือกข้อความก่อน แล้วกดรูปแบบ</span>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={() => commit(false)}
        onBlur={() => commit(true)}
        onMouseUp={rememberSelection}
        onKeyUp={rememberSelection}
        onPaste={(event) => {
          event.preventDefault();
          const text = event.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
          commit(false);
        }}
        className="prose prose-sm max-w-none overflow-y-auto px-4 py-3 text-sm font-normal leading-6 text-slate-900 outline-none empty:before:pointer-events-none empty:before:text-slate-400 empty:before:content-[attr(data-placeholder)] [&_div]:min-h-[1.5em] [&_p]:my-1 [&_u]:underline"
        style={{ minHeight }}
      />
    </div>
  );
}
