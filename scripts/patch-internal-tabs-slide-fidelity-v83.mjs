import fs from "node:fs";

function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`v83 missing ${label}`);
  return source.replace(from, to);
}

// 1) Dashboard actions: keep Case Detail and Edit Evaluation inside QA Dashboard workspace tabs.
{
  const file = "src/DashboardMockup.tsx";
  let source = fs.readFileSync(file, "utf8");
  const marker = "// dashboard-internal-case-edit-tabs-v83";

  if (!source.includes(marker)) {
    if (!source.includes("// dashboard-case-browser-tabs-edit-v82")) {
      throw new Error("v83 requires Dashboard v82 first");
    }
    source = source.replace(
      "// dashboard-case-browser-tabs-edit-v82\n",
      "// dashboard-case-browser-tabs-edit-v82\n" + marker + "\n",
    );

    source = replaceOnce(
      source,
      "  onOpenCaseDetail,\n  onCloseCaseDetail,",
      "  onOpenCaseDetail,\n  onOpenEvaluationEdit,\n  onCloseCaseDetail,",
      "Dashboard callback destructuring",
    );
    source = replaceOnce(
      source,
      "  onOpenCaseDetail?: (caseId?: string, agentName?: string) => void;\n  onCloseCaseDetail?: () => void;",
      "  onOpenCaseDetail?: (caseId?: string, agentName?: string) => void;\n  onOpenEvaluationEdit?: (caseId: string, agentName?: string) => void;\n  onCloseCaseDetail?: () => void;",
      "Dashboard callback type",
    );

    source = replaceOnce(
      source,
      "onClick={() => openEvaluationEditBrowserTabV82(activeSelectedCase.caseId, activeSelectedCase.agent)}",
      "onClick={() => onOpenEvaluationEdit?.(activeSelectedCase.caseId, activeSelectedCase.agent)}",
      "Edit Evaluation browser handler",
    );
    source = replaceOnce(
      source,
      "onClick={() => openCaseDetailBrowserTabV82(activeSelectedCase.caseId, activeSelectedCase.agent)}",
      "onClick={() => onOpenCaseDetail?.(activeSelectedCase.caseId, activeSelectedCase.agent)}",
      "Case Detail browser handler",
    );
    source = source.replace('title="เปิด Case Detail ใน Browser Tab ใหม่"', 'title="เปิด Case Detail เป็น Tab ภายใน QA Dashboard"');
    source = source.replace("Open Full Case Detail ↗", "Open Full Case Detail");

    fs.writeFileSync(file, source);
    console.log("Applied internal Dashboard Case Detail/Edit Evaluation actions v83");
  } else {
    console.log("Internal Dashboard Case/Edit tabs v83 already applied");
  }
}

// 2) App workspace: route Edit Evaluation through the existing internal Evaluate workspace tab.
{
  const file = "src/App.tsx";
  let source = fs.readFileSync(file, "utf8");
  const marker = "// app-internal-case-edit-tabs-v83";

  if (!source.includes(marker)) {
    const importAnchor = 'import CreateEvaluationMockup, { EvaluationSubmitPayload } from "./CreateEvaluationMockup";\n';
    if (!source.includes(importAnchor)) throw new Error("v83 App CreateEvaluation import anchor missing");
    source = source.replace(importAnchor, importAnchor + marker + "\n");

    const caseCallbackAnchor = "              onOpenCaseDetail={(caseId, agentName) => {";
    if (!source.includes(caseCallbackAnchor)) throw new Error("v83 App onOpenCaseDetail anchor missing");
    const editCallback = `              onOpenEvaluationEdit={(caseId, agentName) => {
                if (!caseId) return;
                setSelectedDashboardCaseId(caseId);
                if (agentName) {
                  setSelectedAgentGlobal(agentName);
                  setCaseSelectedAgent(agentName);
                }
                navigateToTab("create-evaluation", {
                  workspaceKey: "create-evaluation",
                  params: {
                    editCaseId: caseId,
                    agent: agentName || "",
                    caseId: "",
                    subTab: "",
                  },
                });
                logUsageEvent(currentUser, "evaluation_edit_open", {
                  caseId,
                  agentName: agentName || "",
                  source: "dashboard_selected_case",
                });
              }}
`;
    source = source.replace(caseCallbackAnchor, editCallback + caseCallbackAnchor);

    const createEvalAnchor = `          <CreateEvaluationMockup
            agentOptions={qaEvaluationAgentOptions}
            currentUser={currentUser}
            onSubmitEvaluation={handleEvaluationSubmitted}
          />`;
    if (!source.includes(createEvalAnchor)) throw new Error("v83 App CreateEvaluation render anchor missing");
    const createEvalReplacement = `          <CreateEvaluationMockup
            agentOptions={qaEvaluationAgentOptions}
            currentUser={currentUser}
            editCaseId={typeof window !== "undefined" ? String(new URL(window.location.href).searchParams.get("editCaseId") || "") : ""}
            onSubmitEvaluation={handleEvaluationSubmitted}
          />`;
    source = source.replace(createEvalAnchor, createEvalReplacement);

    fs.writeFileSync(file, source);
    console.log("Applied App internal Edit Evaluation workspace routing v83");
  } else {
    console.log("App internal Edit Evaluation routing v83 already applied");
  }
}

// 3) Evaluate: accept the internal edit-case prop and react when Dashboard opens an Edit tab.
{
  const file = "src/CreateEvaluationMockup.tsx";
  let source = fs.readFileSync(file, "utf8");
  const marker = "// evaluate-internal-edit-tab-v83";

  if (!source.includes(marker)) {
    if (!source.includes("// evaluate-direct-edit-case-v82")) {
      throw new Error("v83 requires Evaluate v82 first");
    }
    source = source.replace(
      "// evaluate-direct-edit-case-v82\n",
      "// evaluate-direct-edit-case-v82\n" + marker + "\n",
    );

    source = replaceOnce(
      source,
      `export default function CreateEvaluationMockup({
  agentOptions,
  currentUser,
  onSubmitEvaluation,
}: {
  agentOptions?: EvaluationAgentOption[];
  currentUser?: EvaluationCurrentUser | null;
  onSubmitEvaluation?: (payload: EvaluationSubmitPayload) => void | Promise<void>;
}) {`,
      `export default function CreateEvaluationMockup({
  agentOptions,
  currentUser,
  editCaseId,
  onSubmitEvaluation,
}: {
  agentOptions?: EvaluationAgentOption[];
  currentUser?: EvaluationCurrentUser | null;
  editCaseId?: string;
  onSubmitEvaluation?: (payload: EvaluationSubmitPayload) => void | Promise<void>;
}) {`,
      "Evaluate editCaseId prop",
    );

    const oldDirectId = `  const directEditCaseIdV82 = useMemo(() => {
    if (typeof window === "undefined") return "";
    try {
      return String(new URL(window.location.href).searchParams.get("editCaseId") || "").trim().toUpperCase();
    } catch {
      return "";
    }
  }, []);`;
    const newDirectId = `  const directEditCaseIdV82 = useMemo(() => {
    const fromProp = String(editCaseId || "").trim().toUpperCase();
    if (fromProp) return fromProp;
    if (typeof window === "undefined") return "";
    try {
      return String(new URL(window.location.href).searchParams.get("editCaseId") || "").trim().toUpperCase();
    } catch {
      return "";
    }
  }, [editCaseId]);`;
    source = replaceOnce(source, oldDirectId, newDirectId, "Evaluate direct edit case source");

    // Allow the same case to be reopened after Cancel Edit in the retained Evaluate tab.
    source = source.replace(
      /function cancelSubmittedEdit\(\) \{([\s\S]*?)\n  \}/,
      (match, body) => body.includes("directEditHandledRefV82.current")
        ? match
        : `function cancelSubmittedEdit() {${body}\n    directEditHandledRefV82.current = \"\";\n  }`,
    );

    fs.writeFileSync(file, source);
    console.log("Applied retained internal Evaluate edit-tab support v83");
  } else {
    console.log("Evaluate internal edit-tab v83 already applied");
  }
}

// 4) PPTX preview fidelity: overlay the original embedded slide pictures from the PPTX package.
// This does not invent substitute icons/images; unsupported renderer placeholders are hidden instead.
{
  const file = "src/processLibrary.tsx";
  let source = fs.readFileSync(file, "utf8");
  const marker = "// process-pptx-original-media-fidelity-v83";

  if (!source.includes(marker)) {
    if (!source.includes("// process-slide-viewer-no-fullscreen-v82")) {
      throw new Error("v83 requires Process Slide Viewer v82 first");
    }
    source = source.replace(
      "// process-slide-viewer-no-fullscreen-v82\n",
      "// process-slide-viewer-no-fullscreen-v82\n" + marker + "\n",
    );

    const helperAnchor = "function PptxSlidePreviewV69({ meta }: { meta: ProcessReferenceMeta }) {";
    if (!source.includes(helperAnchor)) throw new Error("v83 PPTX preview helper anchor missing");

    const helpers = `type OriginalPptxPictureV83 = {
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  slideWidth: number;
  slideHeight: number;
};

async function originalPptxPicturesV83(buffer: ArrayBuffer, slideNumber: number): Promise<OriginalPptxPictureV83[]> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 70000); offset -= 1) {
    if (zipU32V68(view, offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) return [];

  const totalEntries = zipU16V68(view, eocd + 10);
  let cursor = zipU32V68(view, eocd + 16);
  const decoder = new TextDecoder("utf-8");
  const entries = new Map<string, PptxZipEntry>();
  for (let index = 0; index < totalEntries && cursor + 46 <= bytes.length; index += 1) {
    if (zipU32V68(view, cursor) !== 0x02014b50) break;
    const method = zipU16V68(view, cursor + 10);
    const compressedSize = zipU32V68(view, cursor + 20);
    const fileNameLength = zipU16V68(view, cursor + 28);
    const extraLength = zipU16V68(view, cursor + 30);
    const commentLength = zipU16V68(view, cursor + 32);
    const localOffset = zipU32V68(view, cursor + 42);
    const name = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + fileNameLength)).replace(/\\\\/g, "/");
    entries.set(name, { method, compressedSize, localOffset });
    cursor += 46 + fileNameLength + extraLength + commentLength;
  }

  const readBytes = async (name: string) => {
    const entry = entries.get(name);
    if (!entry || entry.localOffset + 30 > bytes.length || zipU32V68(view, entry.localOffset) !== 0x04034b50) return null;
    const localNameLength = zipU16V68(view, entry.localOffset + 26);
    const localExtraLength = zipU16V68(view, entry.localOffset + 28);
    const dataStart = entry.localOffset + 30 + localNameLength + localExtraLength;
    if (dataStart + entry.compressedSize > bytes.length) return null;
    const compressed = bytes.slice(dataStart, dataStart + entry.compressedSize);
    return inflateZipEntryV68(compressed, entry.method);
  };
  const readText = async (name: string) => {
    const value = await readBytes(name);
    return value ? decoder.decode(value) : "";
  };

  const presentationXml = await readText("ppt/presentation.xml");
  const sizeTag = presentationXml.match(/<p:sldSz\\b[^>]*>/i)?.[0] || "";
  const slideWidth = Math.max(1, Number(xmlAttributeV69(sizeTag, "cx")) || 12192000);
  const slideHeight = Math.max(1, Number(xmlAttributeV69(sizeTag, "cy")) || 6858000);
  const slidePath = "ppt/slides/slide" + slideNumber + ".xml";
  const relsPath = "ppt/slides/_rels/slide" + slideNumber + ".xml.rels";
  const [slideXml, relsXml] = await Promise.all([readText(slidePath), readText(relsPath)]);
  if (!slideXml || !relsXml) return [];

  const relationships = new Map<string, string>();
  for (const match of relsXml.matchAll(/<Relationship\\b[^>]*\\/?\\s*>/gi)) {
    const tag = match[0];
    const id = xmlAttributeV69(tag, "Id");
    const target = xmlAttributeV69(tag, "Target");
    if (id && target) relationships.set(id, normalizeZipTargetV69("ppt/slides", target));
  }

  const mimeFor = (path: string) => {
    const ext = path.toLowerCase().split(".").pop() || "";
    if (ext === "png") return "image/png";
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
    if (ext === "gif") return "image/gif";
    if (ext === "webp") return "image/webp";
    if (ext === "svg") return "image/svg+xml";
    if (ext === "bmp") return "image/bmp";
    return "";
  };

  const pictures: OriginalPptxPictureV83[] = [];
  for (const match of slideXml.matchAll(/<p:pic\\b[\\s\\S]*?<\\/p:pic>/gi)) {
    const block = match[0];
    const blip = block.match(/<a:blip\\b[^>]*>/i)?.[0] || "";
    const relationshipId = xmlAttributeV69(blip, "r:embed");
    const mediaPath = relationships.get(relationshipId) || "";
    const mime = mimeFor(mediaPath);
    if (!mediaPath || !mime) continue;
    const xfrm = block.match(/<a:xfrm\\b[\\s\\S]*?<\\/a:xfrm>/i)?.[0] || "";
    const off = xfrm.match(/<a:off\\b[^>]*\\/?\\s*>/i)?.[0] || "";
    const ext = xfrm.match(/<a:ext\\b[^>]*\\/?\\s*>/i)?.[0] || "";
    const x = Number(xmlAttributeV69(off, "x"));
    const y = Number(xmlAttributeV69(off, "y"));
    const width = Number(xmlAttributeV69(ext, "cx"));
    const height = Number(xmlAttributeV69(ext, "cy"));
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) continue;
    const media = await readBytes(mediaPath);
    if (!media?.length) continue;
    const url = URL.createObjectURL(new Blob([media as any], { type: mime }));
    pictures.push({ url, x, y, width, height, slideWidth, slideHeight });
  }
  return pictures;
}

function hideSyntheticPptxPlaceholdersV83(container: HTMLElement) {
  container.querySelectorAll<HTMLElement>("*").forEach((element) => {
    if (element.childElementCount) return;
    const text = String(element.textContent || "").trim();
    if (/^image$/i.test(text) || text === "🏠" || text === "🏡") {
      element.style.visibility = "hidden";
    }
  });
}

function applyOriginalPptxPicturesV83(container: HTMLElement, pictures: OriginalPptxPictureV83[]) {
  if (!pictures.length) return;
  const slideRatio = pictures[0].slideWidth / pictures[0].slideHeight;
  const candidates = [container, ...Array.from(container.querySelectorAll<HTMLElement>("div,section,article"))];
  let surface: HTMLElement = container;
  let bestScore = Number.POSITIVE_INFINITY;
  candidates.forEach((element) => {
    const rect = element.getBoundingClientRect();
    if (rect.width < 240 || rect.height < 140) return;
    const ratio = rect.width / rect.height;
    const ratioDelta = Math.abs(ratio - slideRatio);
    const sizePenalty = 1 / Math.max(1, rect.width * rect.height);
    const score = ratioDelta + sizePenalty * 50000;
    if (score < bestScore) {
      bestScore = score;
      surface = element;
    }
  });

  if (getComputedStyle(surface).position === "static") surface.style.position = "relative";
  const overlay = document.createElement("div");
  overlay.dataset.originalPptxMediaV83 = "true";
  overlay.style.position = "absolute";
  overlay.style.inset = "0";
  overlay.style.pointerEvents = "none";
  overlay.style.zIndex = "50";
  overlay.style.overflow = "hidden";

  pictures.forEach((picture) => {
    const image = document.createElement("img");
    image.src = picture.url;
    image.alt = "";
    image.draggable = false;
    image.style.position = "absolute";
    image.style.left = (picture.x / picture.slideWidth * 100) + "%";
    image.style.top = (picture.y / picture.slideHeight * 100) + "%";
    image.style.width = (picture.width / picture.slideWidth * 100) + "%";
    image.style.height = (picture.height / picture.slideHeight * 100) + "%";
    image.style.objectFit = "fill";
    image.style.maxWidth = "none";
    overlay.appendChild(image);
  });
  surface.appendChild(overlay);
}

`;
    source = source.replace(helperAnchor, helpers + helperAnchor);

    const viewerDeclaration = `    let viewer: { destroy: () => void; renderSlide: (index?: number) => Promise<void>; slideCount: number } | null = null;`;
    source = replaceOnce(
      source,
      viewerDeclaration,
      viewerDeclaration + `\n    let originalMediaUrlsV83: string[] = [];`,
      "PPTX viewer declaration",
    );

    source = replaceOnce(
      source,
      `        await viewer.renderSlide(slideIndex);
        if (!disposed) setState("ready");`,
      `        await viewer.renderSlide(slideIndex);
        const originalPicturesV83 = await originalPptxPicturesV83(buffer, meta.slideNumber);
        originalMediaUrlsV83 = originalPicturesV83.map((item) => item.url);
        if (disposed) {
          originalMediaUrlsV83.forEach((url) => URL.revokeObjectURL(url));
          originalMediaUrlsV83 = [];
          return;
        }
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        hideSyntheticPptxPlaceholdersV83(container);
        applyOriginalPptxPicturesV83(container, originalPicturesV83);
        if (!disposed) setState("ready");`,
      "PPTX render completion",
    );

    source = replaceOnce(
      source,
      `      viewer?.destroy();
      container.replaceChildren();`,
      `      viewer?.destroy();
      originalMediaUrlsV83.forEach((url) => URL.revokeObjectURL(url));
      originalMediaUrlsV83 = [];
      container.replaceChildren();`,
      "PPTX cleanup",
    );

    fs.writeFileSync(file, source);
    console.log("Applied original embedded PPTX picture overlay and placeholder suppression v83");
  } else {
    console.log("Original PPTX media fidelity v83 already applied");
  }
}
