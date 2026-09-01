import fs from "node:fs";

const summaryPath = "src/SummaryMockup.tsx";
const marker = "// data-analytics-canonical-dashboard-case-count-v25";

let source = fs.readFileSync(summaryPath, "utf8");

if (source.includes(marker)) {
  console.log("Analytics canonical metric count v25 already applied.");
  process.exit(0);
}

const oldFilter = `      } as CaseItem;
    })
    .filter((item) => item.agent && item.caseId && item.auditDateObj);
}`;
const newFilter = `      } as CaseItem;
    })
    ${marker}
    // Dashboard has already accepted these as evaluated production rows.
    // A missing display Case ID must not remove a row from analytics metrics.
    .filter((item) => item.agent && item.auditDateObj);
}`;

if (!source.includes(oldFilter)) {
  throw new Error("Analytics canonical metric count v25 anchor not found.");
}

source = source.replace(oldFilter, newFilter);
fs.writeFileSync(summaryPath, source, "utf8");

console.log("Analytics canonical metric count v25 applied.");
