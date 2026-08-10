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
const ALLOWED_TAGS = new Set([
  "DIV", "P", "BR", "STRONG", "B", "EM", "I", "U", "SPAN", "UL", "OL", "LI",
  "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TD", "TH", "HR",
]);
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
  return /<\/?(?:div|p|br|strong|b|em|i|u|span|ul|ol|li|font|table|thead|tbody|tfoot|tr|td|th|hr)\b/i.test(value);
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

    if (tagName === "HR") {
      if (runs.length && !runs[runs.length - 1].text.endsWith("\n")) pushRun({ text: "\n", ...style });
      pushRun({ text: "----------------------------------------", ...style });
      pushRun({ text: "\n", ...style });
      return;
    }

    const nextStyle = { ...style };
    if (tagName === "STRONG" || tagName === "B" || element.style.fontWeight === "bold" || Number(element.style.fontWeight) >= 600) nextStyle.bold = true;
    if (tagName === "EM" || tagName === "I" || element.style.fontStyle === "italic") nextStyle.italic = true;
    if (tagName === "U" || element.style.textDecoration.includes("underline")) nextStyle.underline = true;
    const color = normalizeColor(element.style.color || "");
    if (color) nextStyle.color = color;

    if (tagName === "TABLE") {
      if (runs.length && !runs[runs.length - 1].text.endsWith("\n")) pushRun({ text: "\n", ...style });
      Array.from(element.childNodes).forEach((child) => visit(child, nextStyle));
      if (runs.length && !runs[runs.length - 1].text.endsWith("\n")) pushRun({ text: "\n", ...style });
      return;
    }

    if (tagName === "TR") {
      const cells = Array.from(element.children).filter((child) => child.tagName === "TD" || child.tagName === "TH");
      cells.forEach((cell, index) => {
        visit(cell, nextStyle);
        if (index < cells.length - 1) pushRun({ text: " | ", ...style });
      });
      if (runs.length && !runs[runs.length - 1].text.endsWith("\n")) pushRun({ text: "\n", ...style });
      return;
    }

    if (tagName === "TD" || tagName === "TH") {
      const cellStyle = { ...nextStyle, bold: tagName === "TH" ? true : nextStyle.bold };
      Array.from(element.childNodes).forEach((child) => visit(child, cellStyle));
      return;
    }

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

const RICH_TEXT_SURFACE_CLASS = [
  "[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse",
  "[&_td]:min-w-[72px] [&_td]:border [&_td]:border-slate-300 [&_td]:px-2 [&_td]:py-2",
  "[&_th]:min-w-[72px] [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-100 [&_th]:px-2 [&_th]:py-2 [&_th]:font-bold",
  "[&_hr]:my-4 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-slate-300",
].join(" ");

export function RichTextContent({ value, fallback = "-", className = "" }: { value: unknown; fallback?: string; className?: string }) {
  const html = sanitizeRichTextHtml(value);
  if (!hasRichTextContent(html)) return <div className={className}>{fallback}</div>;
  return <div className={`${RICH_TEXT_SURFACE_CLASS} ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

type RichTextEditorTarget = {
  element: HTMLDivElement;
  label: string;
  restoreSelection: () => void;
  rememberSelection: () => void;
  commit: (normalizeEditor?: boolean) => void;
};

let activeEditorTarget: RichTextEditorTarget | null = null;
const activeEditorListeners = new Set<(target: RichTextEditorTarget | null) => void>();

function setActiveEditorTarget(target: RichTextEditorTarget | null) {
  activeEditorTarget = target;
  activeEditorListeners.forEach((listener) => listener(target));
}

function runActiveEditorCommand(command: "bold" | "italic" | "underline" | "removeFormat" | "foreColor" | "insertHTML", value?: string) {
  const target = activeEditorTarget;
  if (!target) return false;
  // Capture the live range while the pointer is still down on the toolbar.
  // Restoring it before focus prevents the editor's onFocus handler from
  // replacing a highlighted range with a collapsed caret position.
  target.rememberSelection();
  target.restoreSelection();
  target.element.focus({ preventScroll: true });
  target.restoreSelection();
  document.execCommand("styleWithCSS", false, "true");
  document.execCommand(command, false, value);
  target.rememberSelection();
  target.commit(false);
  return true;
}

function tableHtml(rows: number, columns: number) {
  const safeRows = Math.min(6, Math.max(1, rows));
  const safeColumns = Math.min(6, Math.max(1, columns));
  const body = Array.from({ length: safeRows }, () =>
    `<tr>${Array.from({ length: safeColumns }, () => "<td><br></td>").join("")}</tr>`
  ).join("");
  return `<table><tbody>${body}</tbody></table><div><br></div>`;
}

export function RichTextToolbar({ className = "" }: { className?: string }) {
  const [target, setTarget] = useState<RichTextEditorTarget | null>(activeEditorTarget);
  const [selectedColor, setSelectedColor] = useState(COLOR_OPTIONS[0]);
  const [tableMenuOpen, setTableMenuOpen] = useState(false);

  useEffect(() => {
    const listener = (nextTarget: RichTextEditorTarget | null) => {
      setTarget(nextTarget);
      setTableMenuOpen(false);
    };
    activeEditorListeners.add(listener);
    return () => activeEditorListeners.delete(listener);
  }, []);

  const disabled = !target;
  const buttonClass = "flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 transition hover:border-violet-300 hover:bg-violet-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";

  const commandButton = (label: string, title: string, command: "bold" | "italic" | "underline" | "removeFormat", extraClass = "") => (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onMouseDown={(event) => {
        event.preventDefault();
        runActiveEditorCommand(command);
      }}
      className={`${buttonClass} ${extraClass}`}
    >
      {label}
    </button>
  );

  return (
    <div className={`rounded-[22px] border border-violet-200 bg-white shadow-[0_14px_38px_rgba(76,29,149,0.12)] ${className}`}>
      <div className="flex flex-col gap-2 border-b border-violet-100 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-700">เครื่องมือแก้ไขข้อความ</div>
          <div className="mt-0.5 text-xs font-semibold text-slate-500">เลือกช่องข้อความก่อน แล้วใช้เครื่องมือชุดนี้ได้ทันที</div>
        </div>
        <div className={`w-fit rounded-full border px-3 py-1.5 text-xs font-black ${target ? "border-violet-200 bg-violet-100 text-violet-800" : "border-slate-200 bg-slate-100 text-slate-500"}`}>
          {target ? `กำลังใช้กับ: ${target.label}` : "ยังไม่ได้เลือกช่องข้อความ"}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 px-3 py-3">
        {commandButton("B", "ตัวหนา", "bold")}
        {commandButton("I", "ตัวเอียง", "italic", "italic")}
        {commandButton("U", "ขีดเส้นใต้", "underline", "underline")}
        <div className="mx-1 hidden h-7 w-px bg-slate-200 sm:block" />
        <div className="flex flex-wrap items-center gap-1" aria-label="สีตัวอักษร">
          {COLOR_OPTIONS.map((color) => (
            <button
              key={color}
              type="button"
              title={`สีตัวอักษร ${color}`}
              aria-label={`สีตัวอักษร ${color}`}
              disabled={disabled}
              onMouseDown={(event) => {
                event.preventDefault();
                setSelectedColor(color);
                runActiveEditorCommand("foreColor", color);
              }}
              className={`h-8 w-8 rounded-full border-2 bg-white p-1 transition hover:scale-110 disabled:cursor-not-allowed disabled:opacity-40 ${selectedColor === color ? "border-slate-900" : "border-transparent"}`}
            >
              <span className="block h-full w-full rounded-full" style={{ backgroundColor: color }} />
            </button>
          ))}
        </div>
        <div className="mx-1 hidden h-7 w-px bg-slate-200 sm:block" />
        <button
          type="button"
          disabled={disabled}
          aria-expanded={tableMenuOpen}
          onMouseDown={(event) => {
            event.preventDefault();
            if (!disabled) setTableMenuOpen((current) => !current);
          }}
          className={buttonClass}
        >
          ▦ ตาราง
        </button>
        <button
          type="button"
          disabled={disabled}
          onMouseDown={(event) => {
            event.preventDefault();
            runActiveEditorCommand("insertHTML", "<hr><div><br></div>");
          }}
          className={buttonClass}
        >
          — เส้นคั่น
        </button>
        {commandButton("Tx", "ล้างรูปแบบ", "removeFormat", "text-xs")}
      </div>

      {tableMenuOpen && target ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-violet-100 bg-violet-50/60 px-4 py-3">
          <span className="text-xs font-bold text-slate-500">เลือกขนาดตาราง:</span>
          {[[2, 2], [3, 3], [4, 4]].map(([rows, columns]) => (
            <button
              key={`${rows}-${columns}`}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                runActiveEditorCommand("insertHTML", tableHtml(rows, columns));
                setTableMenuOpen(false);
              }}
              className={buttonClass}
            >
              {rows} × {columns}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = 132,
  tone = "emerald",
  editorLabel = "ช่องข้อความ",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  minHeight?: number;
  tone?: "emerald" | "amber" | "violet";
  editorLabel?: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<Range | null>(null);
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

  const activateEditor = () => {
    const editor = editorRef.current;
    if (!editor) return;
    setActiveEditorTarget({
      element: editor,
      label: editorLabel,
      restoreSelection,
      rememberSelection,
      commit,
    });
  };

  useEffect(() => {
    const editor = editorRef.current;
    return () => {
      if (editor && activeEditorTarget?.element === editor) setActiveEditorTarget(null);
    };
  }, []);

  return (
    <div className={`mt-2 overflow-hidden rounded-xl border border-slate-300 bg-white shadow-inner transition focus-within:ring-4 ${ringClass}`}>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onFocus={() => {
          activateEditor();
          rememberSelection();
        }}
        onInput={() => {
          activateEditor();
          commit(false);
        }}
        onBlur={() => commit(true)}
        onMouseUp={() => {
          activateEditor();
          rememberSelection();
        }}
        onKeyUp={() => {
          activateEditor();
          rememberSelection();
        }}
        onPaste={(event) => {
          event.preventDefault();
          const text = event.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
          commit(false);
        }}
        className={`prose prose-sm max-w-none overflow-y-auto px-4 py-3 text-sm font-normal leading-6 text-slate-900 outline-none empty:before:pointer-events-none empty:before:text-slate-400 empty:before:content-[attr(data-placeholder)] [&_div]:min-h-[1.5em] [&_p]:my-1 [&_u]:underline ${RICH_TEXT_SURFACE_CLASS}`}
        style={{ minHeight }}
      />
    </div>
  );
}
