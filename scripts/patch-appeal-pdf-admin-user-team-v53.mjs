import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appealPath = path.join(root, "src", "AppealMockup.tsx");
const marker = "appeal-pdf-admin-user-team-v53";

function patchAppealPdfAdminDirectory() {
  let source = fs.readFileSync(appealPath, "utf8");
  if (source.includes(`// ${marker}`)) return;

  const importAnchor = `import { richTextToPlainText } from "./richText";`;
  if (!source.includes(importAnchor)) {
    throw new Error("Appeal PDF v53: user directory import anchor not found.");
  }
  source = source.replace(
    importAnchor,
    `${importAnchor}\nimport { fetchStoredUserProfiles } from "./userRoleStore"; // ${marker}`
  );

  const generateAnchor = `      const generated = await generateOfficialCaseDetailPdf({`;
  const generateIndex = source.indexOf(generateAnchor);
  if (generateIndex < 0) {
    throw new Error("Appeal PDF v53: PDF generation anchor not found.");
  }

  const resolverBlock = `      // Resolve the Appeal submitter from the central User directory.\n      // Do not filter by status: Active and Suspended users are both valid matches.\n      const appealPdfUserProfiles = await fetchStoredUserProfiles().catch(() => []);\n      const appealPdfSubmittedIdentity = String(selectedCase.submittedByName || "").trim();\n      const normalizeAppealPdfIdentity = (value: unknown) =>\n        String(value || "")\n          .replace(/\\u00A0/g, " ")\n          .replace(/\\s+/g, " ")\n          .trim()\n          .toLowerCase();\n      const compactAppealPdfIdentity = (value: unknown) =>\n        normalizeAppealPdfIdentity(value).replace(/[^a-z0-9ก-๙]/g, "");\n      const submittedNormalized = normalizeAppealPdfIdentity(appealPdfSubmittedIdentity);\n      const submittedCompact = compactAppealPdfIdentity(appealPdfSubmittedIdentity);\n      const appealPdfAdminProfile = appealPdfUserProfiles.find((profile) => {\n        const email = String(profile.email || "").trim();\n        const emailLocal = email.includes("@") ? email.split("@")[0] : email;\n        const candidates = [\n          profile.username,\n          profile.displayName,\n          profile.agentName,\n          email,\n          emailLocal,\n        ].filter(Boolean);\n        return candidates.some((candidate) => {\n          const normalized = normalizeAppealPdfIdentity(candidate);\n          const compact = compactAppealPdfIdentity(candidate);\n          return Boolean(\n            (submittedNormalized && normalized === submittedNormalized) ||\n            (submittedCompact && compact === submittedCompact)\n          );\n        });\n      });\n      const appealPdfAdminUser = String(appealPdfAdminProfile?.username || "").trim() || "-";\n      const appealPdfAdminTeam = String(appealPdfAdminProfile?.teamName || "").trim() || "-";\n\n`;

  const fullNameResolverBlock = resolverBlock.replace(
    `const appealPdfAdminUser = String(appealPdfAdminProfile?.username || "").trim() || "-";`,
    `const appealPdfAdminUser = String(\n        appealPdfAdminProfile?.displayName ||\n        appealPdfAdminProfile?.agentName ||\n        appealPdfAdminProfile?.username ||\n        ""\n      ).trim() || "-";`
  );
  source = source.slice(0, generateIndex) + fullNameResolverBlock + source.slice(generateIndex);

  const identityBefore = `          teamName: selectedCase.teamName || "",\n          appealSubmittedBy: selectedCase.submittedByName || "",\n          appealReviewedBy: selectedCase.reviewedByName || "",`;
  const identityAfter = `          teamName: appealPdfAdminTeam,\n          appealSubmittedBy: appealPdfAdminUser,\n          appealReviewedBy: selectedCase.reviewedByName || "",`;
  if (!source.includes(identityBefore)) {
    throw new Error("Appeal PDF v53: PDF identity context anchor not found.");
  }
  source = source.replace(identityBefore, identityAfter);

  fs.writeFileSync(appealPath, source, "utf8");
}

patchAppealPdfAdminDirectory();
console.log("Appeal PDF v53 applied: Admin uses the full central User name (including Suspended users), and Team comes from the matched User record.");
