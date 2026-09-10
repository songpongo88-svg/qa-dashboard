import fs from "node:fs";

const createPath = "src/CreateEvaluationMockup.tsx";
const dashboardPath = "src/DashboardMockup.tsx";
const marker = "process-library-v65";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Process Library v65 anchor not found: ${label}`);
  return source.replace(before, after);
}

function patchCreateEvaluation() {
  let source = fs.readFileSync(createPath, "utf8");
  if (source.includes(`// ${marker}`)) return;

  source = replaceOnce(
    source,
    `} from "./richText";`,
    `} from "./richText";\nimport { ProcessReferenceDisplay, ProcessReferenceSelector } from "./processLibrary";\n// ${marker}`,
    "Create Evaluation import"
  );

  const oldEditor = `                <label className="block">\n                  <span className={labelClass}>Process ที่ใช้เทียบ</span>\n                  <RichTextEditor\n                    value={processReference}\n                    onChange={setProcessReference}\n                    editorLabel="Process ที่ใช้เทียบ"\n                    minHeight={132}\n                    tone="violet"\n                    placeholder="วางข้อมูล Process, Slide, ข้อ หรือ Tag ที่ใช้อ้างอิงได้ที่นี่..."\n                  />\n                </label>`;

  const newEditor = `                <label className="block">\n                  <span className={labelClass}>Process ที่ใช้เทียบ</span>\n                  <ProcessReferenceSelector\n                    value={processReference}\n                    onChange={setProcessReference}\n                    currentUser={currentUser}\n                  />\n                </label>`;

  source = replaceOnce(source, oldEditor, newEditor, "Process selector");

  source = replaceOnce(
    source,
    `<RichTextContent value={submitPreview.record.processReference} className="mt-2 whitespace-pre-line text-sm font-semibold leading-6 text-slate-800" />`,
    `<ProcessReferenceDisplay value={submitPreview.record.processReference} className="mt-2" />`,
    "Submit preview Process display"
  );

  fs.writeFileSync(createPath, source, "utf8");
}

function patchDashboard() {
  let source = fs.readFileSync(dashboardPath, "utf8");
  if (source.includes(`// ${marker}`)) return;

  source = replaceOnce(
    source,
    `import MonthlyKpiNotice from "./MonthlyKpiNotice";`,
    `import MonthlyKpiNotice from "./MonthlyKpiNotice";\nimport { ProcessReferenceDisplay } from "./processLibrary";\n// ${marker}`,
    "Dashboard import"
  );

  source = replaceOnce(
    source,
    `<RichTextContent value={caseItem.processReference} className="whitespace-pre-line text-[14px] leading-6.5 text-slate-800" />`,
    `<ProcessReferenceDisplay value={caseItem.processReference || ""} />`,
    "Case Detail Process preview"
  );

  fs.writeFileSync(dashboardPath, source, "utf8");
}

patchCreateEvaluation();
patchDashboard();
console.log("Process Library v65 applied: versioned Process selection, slide/step references, upload-new-version flow, and locked Case Detail preview.");
