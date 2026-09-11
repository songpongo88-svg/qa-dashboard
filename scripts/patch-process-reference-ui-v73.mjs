import fs from "node:fs";

const file = "src/processLibrary.tsx";
let source = fs.readFileSync(file, "utf8");
const marker = "// process-reference-custom-labels-v73";

if (source.includes(marker)) {
  console.log("Process reference UI v73 already applied");
  await import("./patch-process-reference-ui-v74.mjs");
  process.exit(0);
}

const readSnippet = (name) => fs.readFileSync(`scripts/process-reference-v73/${name}.txt`, "utf8");
const replaceExact = (from, to, label) => {
  if (!source.includes(from)) throw new Error(`Process reference UI v73: missing ${label}`);
  source = source.replace(from, to);
};
const replaceRegex = (pattern, to, label) => {
  if (!pattern.test(source)) throw new Error(`Process reference UI v73: missing ${label}`);
  source = source.replace(pattern, to);
};

replaceExact(
  "// process-library-native-v69\n",
  "// process-library-native-v69\n" + marker + "\n",
  "source marker",
);

replaceRegex(
  /function ProcessSlideModalV68\(\{ meta, onClose \}: \{ meta: ProcessReferenceMeta \| null; onClose: \(\) => void \}\) \{[\s\S]*?\n\}\n\nexport function ProcessReferenceSelector/,
  readSnippet("modal") + "\nexport function ProcessReferenceSelector",
  "slide viewer modal",
);

const stateAnchor = '  const [message, setMessage] = useState("");\n  const [previewMeta, setPreviewMeta] = useState<ProcessReferenceMeta | null>(null);\n';
replaceExact(
  stateAnchor,
  stateAnchor + '  const [slidePickerOpen, setSlidePickerOpen] = useState(false);\n  const [slideQuery, setSlideQuery] = useState("");\n  const [pickerSlideNumber, setPickerSlideNumber] = useState(0);\n',
  "selector states",
);

replaceRegex(
  /  const addSlide = \(slideNumber: number\) => \{[\s\S]*?\n  \};\n\n  const updateStep = \(slideNumber: number, nextStep: string\) => \{[\s\S]*?\n  \};\n\n/,
  readSnippet("handlers"),
  "slide handlers",
);

const pickerAnchor = '  const usedSlides = new Set(parsedRefs.map((item) => item.slideNumber));\n' +
  '  const autoName = uploadFile ? uploadFile.name.replace(/\\.[^.]+$/, "").replace(/\\s*\\(\\d+\\)\\s*$/, "").trim() : "-";\n';
replaceExact(pickerAnchor, readSnippet("picker-data"), "picker data");

replaceRegex(
  /      \{!historical \? \(\n        <div className="border-b border-violet-100 p-4">[\s\S]*?\n      \) : null\}\n/,
  readSnippet("chooser"),
  "slide chooser",
);

replaceRegex(
  /      <div className="space-y-2 p-4">[\s\S]*?      <ProcessSlideModalV68 meta=\{previewMeta\} onClose=\{\(\) => setPreviewMeta\(null\)\} \/>\n/,
  readSnippet("selected"),
  "selected slides and picker",
);

replaceRegex(
  /export function ProcessReferenceDisplay\(\{ value, className = "" \}: \{ value: string; className\?: string \}\) \{[\s\S]*\}\s*$/,
  readSnippet("display") + "\n",
  "process reference display",
);

fs.writeFileSync(file, source);
console.log("Applied Process reference custom labels, picker, carousel, navigation, and minimize v73");
await import("./patch-process-reference-ui-v74.mjs");
