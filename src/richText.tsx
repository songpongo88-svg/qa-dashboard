import { useEffect, useRef, useState } from "react";

export type RichTextRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  image?: RichTextImage;
};

export type RichTextImage = { id: string; url: string; width: number; height: number; caseId: string; name?: string };

function safeRichTextImage(element: HTMLElement): RichTextImage | null {
  try {
    const url = new URL(element.getAttribute("src") || "", "https://qa.local");
    const id = url.searchParams.get("id") || "";
    const caseId = element.getAttribute("data-case-id") || "";
    const ownOrigin = typeof document !== "undefined" ? document.location?.origin : "";
    if ((url.origin !== "https://qa.local" && url.origin !== ownOrigin) || url.pathname !== "/api/google-drive-download" ||
      !/^[A-Za-z0-9_-]+$/.test(id) || url.searchParams.get("watermark") !== "qa-v2" ||
      !caseId || caseId !== url.searchParams.get("caseId")) return null;
    return { id, url: url.pathname + url.search, caseId, name: element.getAttribute("alt") || "รูปหลักฐาน QA",
      width: Math.min(1600, Math.max(1, Number(element.getAttribute("width")) || 800)),
      height: Math.min(1600, Math.max(1, Number(element.getAttribute("height")) || 600)) };
  } catch { return null; }
}

export function richTextImageHtml(image: RichTextImage) {
  return `<img src="${escapeHtml(image.url)}" data-case-id="${escapeHtml(image.caseId)}" width="${image.width}" height="${image.height}" alt="${escapeHtml(image.name || "รูปหลักฐาน QA")}">`;
}

const BLOCK_TAGS = new Set(["DIV", "P", "LI", "UL", "OL"]);
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED"]);
const ALLOWED_TAGS = new Set([
  "DIV", "P", "BR", "STRONG", "B", "EM", "I", "U", "SPAN", "UL", "OL", "LI",
  "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TD", "TH", "HR", "IMG",
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
  return /<\/?(?:div|p|br|strong|b|em|i|u|span|ul|ol|li|font|table|thead|tbody|tfoot|tr|td|th|hr|img)\b/i.test(value);
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

export function sanitizeRichTextHtml(value: unknown, preserveWhitespace = false) {
  const source = String(value || "");
  if (!source) return "";
  if (typeof DOMParser === "undefined" || typeof document === "undefined") {
    return looksLikeRichText(source) ? source : plainTextToHtml(source);
  }

  const parsed = new DOMParser().parseFromString(
    `<body>${looksLikeRichText(source) ? source : plainTextToHtml(source)}</body>`,
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
    if (normalizedTag === "IMG") {
      const image = safeRichTextImage(element);
      if (!image) return;
      const safeImage = document.createElement("img");
      safeImage.setAttribute("src", image.url);
      safeImage.setAttribute("data-case-id", image.caseId);
      safeImage.setAttribute("width", String(image.width));
      safeImage.setAttribute("height", String(image.height));
      safeImage.setAttribute("alt", image.name || "รูปหลักฐาน QA");
      target.appendChild(safeImage);
      return;
    }
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
      const textDecoration = `${element.style.textDecoration} ${element.style.textDecorationLine}`;
      if (textDecoration.includes("underline")) safeElement.style.textDecoration = "underline";
    }
    Array.from(element.childNodes).forEach((child) => appendSafeNode(child, safeElement));
    target.appendChild(safeElement);
  };

  Array.from(parsed.body.childNodes).forEach((node) => appendSafeNode(node, output));
  if (preserveWhitespace) return output.innerHTML;
  return output.innerHTML.trim();
}

export function parseRichTextRuns(value: unknown, preserveWhitespace = false): RichTextRun[] {
  if (preserveWhitespace && !looksLikeRichText(String(value ?? ""))) {
    return value ? [{ text: String(value) }] : [];
  }
  const source = sanitizeRichTextHtml(value, preserveWhitespace);
  if (!source) return [];
  if (typeof DOMParser === "undefined") {
    return [{ text: String(value || "").replace(/<[^>]*>/g, "") }];
  }

  const parsed = new DOMParser().parseFromString(`<body>${source}</body>`, "text/html");
  const runs: RichTextRun[] = [];
  const pushRun = (run: RichTextRun) => {
    if (!run.text && !run.image) return;
    const previous = runs[runs.length - 1];
    if (
      previous && !previous.image && !run.image &&
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
    if (tagName === "IMG") {
      const image = safeRichTextImage(element);
      if (image) pushRun({ text: "", image });
      return;
    }
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
    const textDecoration = `${element.style.textDecoration} ${element.style.textDecorationLine}`;
    if (tagName === "U" || textDecoration.includes("underline")) nextStyle.underline = true;
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
  if (!preserveWhitespace && runs[runs.length - 1]?.text.endsWith("\n")) {
    runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/\n+$/, "");
  }
  return runs.filter((run) => run.text || run.image);
}

export function richTextImages(value: unknown): RichTextImage[] {
  return parseRichTextRuns(value, true).flatMap(run => run.image ? [run.image] : []);
}

export function richTextToPlainText(value: unknown, preserveWhitespace = false) {
  const text = parseRichTextRuns(value, preserveWhitespace)
    .map((run) => run.text)
    .join("")
    .replace(/\u00a0/g, " ");
  if (preserveWhitespace) return text;
  return text
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export function hasRichTextContent(value: unknown) {
  return Boolean(richTextToPlainText(value)) || /<(?:table|hr|img)\b/i.test(sanitizeRichTextHtml(value));
}

const RICH_TEXT_SURFACE_CLASS = [
  "[&_u]:underline",
  "[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse",
  "[&_td]:min-w-[72px] [&_td]:border [&_td]:border-slate-300 [&_td]:px-2 [&_td]:py-2",
  "[&_th]:min-w-[72px] [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-100 [&_th]:px-2 [&_th]:py-2 [&_th]:font-bold",
  "[&_hr]:my-4 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-slate-300",
  "[&_img]:my-3 [&_img]:block [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-lg [&_img]:border [&_img]:border-slate-200",
].join(" ");

export function RichTextContent({ value, fallback = "-", className = "", preserveWhitespace = false, decodeEntities = false }: { value: unknown; fallback?: string; className?: string; preserveWhitespace?: boolean; decodeEntities?: boolean }) {
  let source = String(value ?? "");
  if (decodeEntities && typeof document !== "undefined") {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const textarea = document.createElement("textarea");
      textarea.innerHTML = source;
      const decoded = textarea.value;
      if (decoded === source) break;
      source = decoded;
    }
  }
  const html = sanitizeRichTextHtml(source, preserveWhitespace);
  if (!hasRichTextContent(html)) return <div className={className}>{fallback}</div>;
  return <div className={`${RICH_TEXT_SURFACE_CLASS} ${className}`} style={preserveWhitespace ? { whiteSpace: "pre-wrap" } : undefined} dangerouslySetInnerHTML={{ __html: html }} />;
}

type RichTextEditorTarget = {
  element: HTMLDivElement;
  label: string;
  restoreSelection: () => void;
  rememberSelection: () => void;
  commit: () => void;
};

let activeEditorTarget: RichTextEditorTarget | null = null;
const activeEditorListeners = new Set<(target: RichTextEditorTarget | null) => void>();

function setActiveEditorTarget(target: RichTextEditorTarget | null) {
  activeEditorTarget = target;
  activeEditorListeners.forEach((listener) => listener(target));
}

function runActiveEditorCommand(command: "bold" | "italic" | "underline" | "removeFormat" | "foreColor" | "insertHTML", value?: string) {
  const target = activeEditorTarget;
  if (!target?.element.isConnected) return false;
  // Toolbar focus must never replace the highlighted range with a caret.
  target.element.focus({ preventScroll: true });
  target.restoreSelection();
  document.execCommand("styleWithCSS", false, "true");
  document.execCommand(command, false, value);
  target.rememberSelection();
  target.commit();
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
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<RichTextEditorTarget | null>(activeEditorTarget);
  const [selectedColor, setSelectedColor] = useState(COLOR_OPTIONS[0]);
  const [tableMenuOpen, setTableMenuOpen] = useState(false);

  useEffect(() => {
    const listener = (nextTarget: RichTextEditorTarget | null) => {
      setTarget(nextTarget);
      setTableMenuOpen(false);
    };
    activeEditorListeners.add(listener);
    const clearPlainTextTarget = (event: FocusEvent) => {
      const element = event.target;
      if (!(element instanceof HTMLElement) || toolbarRef.current?.contains(element)) return;
      if (element.matches("input, textarea, select") || (element.isContentEditable && !element.hasAttribute("data-rich-text-editor"))) {
        setActiveEditorTarget(null);
      }
    };
    document.addEventListener("focusin", clearPlainTextTarget);
    return () => {
      activeEditorListeners.delete(listener);
      document.removeEventListener("focusin", clearPlainTextTarget);
    };
  }, []);

  const disabled = !target;
  const buttonClass = "flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 transition hover:border-violet-300 hover:bg-violet-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";

  const commandButton = (label: string, title: string, command: "bold" | "italic" | "underline" | "removeFormat", extraClass = "") => (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={() => runActiveEditorCommand(command)}
      className={`${buttonClass} ${extraClass}`}
    >
      {label}
    </button>
  );

  return (
    <div ref={toolbarRef} data-rich-text-toolbar="true" onMouseDown={(event) => { if (event.button === 0) event.preventDefault(); }} className={`rounded-[22px] border border-violet-200 bg-white shadow-[0_14px_38px_rgba(76,29,149,0.12)] ${className}`}>
      <div className="flex flex-col gap-2 border-b border-violet-100 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-700">เครื่องมือแก้ไขข้อความ</div>
          <div className="mt-0.5 text-xs font-semibold text-slate-500">เลือกข้อความใน Assessment Reason, Case Description หรือ Sticky Note แล้วใช้เครื่องมือได้ทันที</div>
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
              onClick={() => {
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
          onClick={() => {
            if (!disabled) setTableMenuOpen((current) => !current);
          }}
          className={buttonClass}
        >
          ▦ ตาราง
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
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
              onClick={() => {
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

function editorPlainText(root: HTMLElement): string {
  const blocks = new Set(["DIV", "P", "LI"]);
  const read = (parent: HTMLElement): string => {
    let text = "";
    let previousBlock = false;
    Array.from(parent.childNodes).forEach((node, index) => {
      const element = node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : null;
      const block = Boolean(element && blocks.has(element.tagName));
      if (index > 0 && (previousBlock || (block && !text.endsWith("\n")))) text += "\n";
      if (node.nodeType === Node.TEXT_NODE) text += (node.textContent || "").replace(/\u00a0/g, " ");
      else if (element?.tagName === "BR") text += "\n";
      else if (element) {
        // A lone BR in an empty browser-created block is a caret placeholder.
        const emptyBlock = block && element.childNodes.length === 1 && element.firstChild?.nodeName === "BR";
        if (!emptyBlock) text += read(element);
      }
      previousBlock = block;
    });
    return text;
  };
  return read(root);
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = 132,
  tone = "emerald",
  editorLabel = "ช่องข้อความ",
  preserveWhitespace = false,
  onImagePaste,
  onImageBusyChange,
  imageCaseId = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  minHeight?: number;
  tone?: "emerald" | "amber" | "violet";
  editorLabel?: string;
  preserveWhitespace?: boolean;
  onImagePaste?: (file: File) => Promise<RichTextImage>;
  onImageBusyChange?: (busy: boolean) => void;
  imageCaseId?: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<Range | null>(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  const imagePasteRef = useRef(onImagePaste);
  const imageScopeRef = useRef(imageCaseId);
  const imageBusyCallbackRef = useRef(onImageBusyChange);
  const imageBusyRef = useRef(false);
  const aliveRef = useRef(true);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState("");
  imagePasteRef.current = onImagePaste;
  imageScopeRef.current = imageCaseId;
  imageBusyCallbackRef.current = onImageBusyChange;
  onChangeRef.current = onChange;
  valueRef.current = value;
  const ringClass = tone === "amber" ? "focus-within:border-amber-500 focus-within:ring-amber-100" : tone === "violet" ? "focus-within:border-violet-500 focus-within:ring-violet-100" : "focus-within:border-emerald-600 focus-within:ring-emerald-100";

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor) return;
    const safeHtml = sanitizeRichTextHtml(value, preserveWhitespace);
    // Do not replace equivalent DOM: saved Ranges point to its text nodes.
    if (sanitizeRichTextHtml(editor.innerHTML, preserveWhitespace) !== safeHtml) {
      editor.innerHTML = safeHtml;
      selectionRef.current = null;
    }
  }, [value, preserveWhitespace]);

  const rememberSelection = () => {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!editorRef.current?.contains(range.startContainer) || !editorRef.current.contains(range.endContainer)) return;
    selectionRef.current = range.cloneRange();
  };

  const restoreSelection = () => {
    const selection = window.getSelection();
    const editor = editorRef.current;
    if (!selection || !editor) return;
    let range = selectionRef.current;
    if (!range || !editor.contains(range.startContainer) || !editor.contains(range.endContainer)) {
      range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
    }
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const commit = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const safeHtml = sanitizeRichTextHtml(editor.innerHTML, preserveWhitespace);
    // Keep existing plain-text reasons byte-for-byte until the user changes them.
    if (safeHtml === sanitizeRichTextHtml(valueRef.current, preserveWhitespace)) return;
    if (preserveWhitespace && !editor.querySelector("strong, b, em, i, u, [style], table, hr, ul, ol, li, img")) {
      onChangeRef.current(editorPlainText(editor));
      return;
    }
    onChangeRef.current(preserveWhitespace || hasRichTextContent(safeHtml) ? safeHtml : "");
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
    aliveRef.current = true;
    const editor = editorRef.current;
    const captureSelection = () => {
      if (document.activeElement === editor) rememberSelection();
    };
    document.addEventListener("selectionchange", captureSelection);
    return () => {
      aliveRef.current = false;
      if (imageBusyRef.current) { imageBusyRef.current = false; imageBusyCallbackRef.current?.(false); }
      document.removeEventListener("selectionchange", captureSelection);
      if (editor && activeEditorTarget?.element === editor) setActiveEditorTarget(null);
    };
  }, []);

  const paste = async (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (imageBusyRef.current) return;
    const copiedHtml = event.clipboardData.getData("text/html");
    const copiedImages = onImagePaste ? richTextImages(copiedHtml) : [];
    if (copiedImages.length) {
      if (copiedImages.some(image => image.caseId !== imageScopeRef.current)) { setImageError("รูปหลักฐานเป็นของ Case ID อื่น กรุณา Copy รูปต้นฉบับแล้ววางใหม่"); return; }
      // Copying an already-stamped image inside the app keeps its durable ID
      // instead of stamping the clipboard bitmap a second time.
      document.execCommand("insertHTML", false, sanitizeRichTextHtml(copiedHtml, true));
      rememberSelection(); commit(); return;
    }
    const files = Array.from(event.clipboardData.items || []).filter(item => item.kind === "file" && item.type.startsWith("image/"))
      .map(item => item.getAsFile()).filter((file): file is File => Boolean(file));
    if (!files.length) files.push(...Array.from(event.clipboardData.files || []).filter(file => file.type.startsWith("image/")));
    if (files.length && imagePasteRef.current) {
      rememberSelection();
      const originalScope = imageScopeRef.current;
      imageBusyRef.current = true; setImageBusy(true); setImageError(""); imageBusyCallbackRef.current?.(true);
      try {
        // Finish each upload before inserting it. Failed files never become broken saved images.
        for (const file of files) {
          const image = await imagePasteRef.current(file);
          if (!aliveRef.current) return;
          if (originalScope !== imageScopeRef.current) throw new Error("Case ID เปลี่ยนระหว่างอัปโหลด กรุณาวางรูปในเคสที่ต้องการอีกครั้ง");
          const editor = editorRef.current;
          if (!editor) return;
          // Native editing commands require an editable target even while the
          // rest of the asynchronous paste is guarded from user edits.
          editor.setAttribute("contenteditable", "true");
          editor.focus(); restoreSelection();
          const html = sanitizeRichTextHtml(richTextImageHtml(image), true);
          if (!document.execCommand("insertHTML", false, html)) {
            const selection = window.getSelection();
            const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
            if (!range) throw new Error("ไม่พบตำแหน่งวางรูป กรุณาคลิกในข้อความแล้วลองใหม่");
            range.deleteContents();
            const fragment = range.createContextualFragment(html), last = fragment.lastChild;
            range.insertNode(fragment);
            if (last) range.setStartAfter(last);
            range.collapse(true); selection!.removeAllRanges(); selection!.addRange(range);
          }
          rememberSelection(); commit();
          editor.setAttribute("contenteditable", "false");
        }
      } catch (error) {
        if (aliveRef.current) setImageError(error instanceof Error ? error.message : "วางรูปไม่สำเร็จ กรุณาลองใหม่");
      } finally {
        if (imageBusyRef.current) { imageBusyRef.current = false; imageBusyCallbackRef.current?.(false); }
        if (aliveRef.current) setImageBusy(false);
      }
      return;
    }
    document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
    rememberSelection(); commit();
  };

  return (
    <div className={`mt-2 overflow-hidden rounded-xl border border-slate-300 bg-white shadow-inner transition focus-within:ring-4 ${ringClass}`}>
      <div
        ref={editorRef}
        contentEditable={!imageBusy}
        aria-busy={imageBusy}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={editorLabel}
        data-rich-text-editor="true"
        data-placeholder={placeholder}
        onFocus={() => {
          activateEditor();
        }}
        onInput={() => {
          activateEditor();
          rememberSelection();
          commit();
        }}
        onBlur={() => { rememberSelection(); commit(); }}
        onMouseUp={() => {
          activateEditor();
          rememberSelection();
        }}
        onKeyUp={() => {
          activateEditor();
          rememberSelection();
        }}
        onPaste={(event) => { void paste(event); }}
        className={`prose prose-sm max-w-none overflow-y-auto px-4 py-3 text-sm font-normal leading-6 text-slate-900 outline-none empty:before:pointer-events-none empty:before:text-slate-400 empty:before:content-[attr(data-placeholder)] [&_div]:min-h-[1.5em] [&_p]:my-1 [&_u]:underline ${RICH_TEXT_SURFACE_CLASS}`}
        style={{ minHeight, whiteSpace: preserveWhitespace ? "pre-wrap" : undefined }}
      />
      {onImagePaste ? <div className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500" role="status">
        {imageBusy ? "กำลังใส่ลายน้ำและอัปโหลดรูป…" : imageError || "Ctrl+V เพื่อวางรูประหว่างข้อความ · รูปมีลายน้ำและ Case ID อัตโนมัติ"}
      </div> : null}
    </div>
  );
}
