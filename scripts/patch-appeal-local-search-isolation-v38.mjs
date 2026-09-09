import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appealPath = path.join(root, "src", "AppealMockup.tsx");
const marker = "appeal-local-search-isolation-v38";

let source = fs.readFileSync(appealPath, "utf8");

if (!source.includes(`// ${marker}`)) {
  const stateAnchor = `  const [searchCaseId, setSearchCaseId] = useState("");`;
  if (!source.includes(stateAnchor)) {
    throw new Error("Appeal local search v38 state anchor not found.");
  }
  source = source.replace(
    stateAnchor,
    `  // ${marker}\n${stateAnchor}`
  );

  // Appeal page filters are local UI state. Do not push Agent changes back to Dashboard.
  source = source.replace(/\n\s*onSelectedAgentChange\?\.\(scopedAgent \|\| ""\);/g, "");
  source = source.replace(/\n\s*onSelectedAgentChange\?\.\(""\);/g, "");
  source = source.replace(/\n\s*onSelectedAgentChange\?\.\(next\);/g, "");
  source = source.replace(/\n\s*onSelectedAgentChange\?\.\(matchedCase\.agent\);/g, "");

  source = source.replace(
    `  }, [roleScopedAgentList, selectedAgent, visibleAgentList, onSelectedAgentChange]);`,
    `  }, [roleScopedAgentList, selectedAgent, visibleAgentList]);`
  );

  // External Case ID may initialize/select an Appeal case, but local search/filter state
  // must not cause the external Dashboard selection effect to run again.
  const oldExternalDeps = `  }, [\n    externalSelectedCaseId,\n    externalSelectedAgent,\n    allCases,\n    selectedCaseKey,\n    selectedMonthKey,\n    selectedAgent,\n    roleScopedAgentList,\n    onSelectedAgentChange,\n  ]);`;
  const newExternalDeps = `  }, [\n    externalSelectedCaseId,\n    allCases,\n    roleScopedAgentList,\n  ]);`;

  if (!source.includes(oldExternalDeps)) {
    throw new Error("Appeal local search v38 external selection dependency anchor not found.");
  }
  source = source.replace(oldExternalDeps, newExternalDeps);

  fs.writeFileSync(appealPath, source, "utf8");
}

console.log("Patched Appeal search and Agent filters to stay local to Appeal Cases without syncing back to Dashboard.");
