import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appealPath = path.join(root, "src", "AppealMockup.tsx");
const appealRequestsPath = path.join(root, "src", "AppealRequestsMockup.tsx");
const appealStorePath = path.join(root, "src", "appealStore.ts");
const marker = "appeal-reviewer-loading-fix-v64";

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Appeal v64 missing anchor: ${label}`);
  }
  return source.replace(before, after);
}

function patchAppealMockup() {
  let source = fs.readFileSync(appealPath, "utf8");
  if (source.includes(`// ${marker}-mockup`)) return;

  source = replaceRequired(
    source,
    `import { richTextToPlainText } from "./richText";`,
    `import { richTextToPlainText } from "./richText";\nimport { fetchStoredUserProfiles } from "./userRoleStore";\n// ${marker}-mockup`,
    "AppealMockup user profile import"
  );

  source = replaceRequired(
    source,
    `        const firebaseMapped: AppealCaseItem[] = [];\n        let firebaseLoadError = "";`,
    `        // Show the static appeal workbook immediately. Firebase is an enhancement, not a reason to block the whole page.\n        const initialReviewedCases = collapseAppealRowsToLatest(mapped).sort(\n          (a, b) => b.appealTimestampRank - a.appealTimestampRank\n        );\n        setAllCases(initialReviewedCases);\n        setReviewedSourceInfo({\n          staticCount: initialReviewedCases.length,\n          firebaseCount: 0,\n          error: "",\n        });\n        setIsLoading(false);\n\n        const reviewerNameByUsername = new Map<string, string>();\n        try {\n          const profiles = await Promise.race([\n            fetchStoredUserProfiles(),\n            new Promise<any[]>((_, reject) =>\n              window.setTimeout(() => reject(new Error("User profile lookup timeout")), 5000)\n            ),\n          ]);\n          profiles.forEach((profile: any) => {\n            const username = String(profile?.username || "").trim().toLowerCase();\n            const fullName = canonicalizeAgentName(profile?.agentName || profile?.displayName || "");\n            if (username && fullName) reviewerNameByUsername.set(username, fullName);\n          });\n        } catch (profileError) {\n          console.warn("Appeal reviewer profile lookup skipped", profileError);\n        }\n\n        const resolveReviewerFullName = (usernameValue: unknown, rawNameValue: unknown) => {\n          const username = String(usernameValue || "").trim();\n          const profileName = reviewerNameByUsername.get(username.toLowerCase()) || "";\n          if (profileName) return profileName;\n\n          const currentUsername = String(currentUser?.username || "").trim().toLowerCase();\n          if (username && currentUsername && username.toLowerCase() === currentUsername) {\n            const currentCandidates = [currentUser?.agentName, currentUser?.displayName]\n              .map((value) => canonicalizeAgentName(value || ""))\n              .filter(Boolean)\n              .sort((a, b) => b.split(/\\s+/).length - a.split(/\\s+/).length);\n            const currentFullName = currentCandidates.find((value) => value.split(/\\s+/).length >= 2);\n            if (currentFullName) return currentFullName;\n          }\n\n          const rawName = canonicalizeAgentName(rawNameValue || "");\n          if (rawName && rawName.split(/\\s+/).length >= 2) return rawName;\n          return rawName || username || "-";\n        };\n\n        const firebaseMapped: AppealCaseItem[] = [];\n        let firebaseLoadError = "";`,
    "AppealMockup non-blocking initial render and reviewer profile map"
  );

  source = replaceRequired(
    source,
    `          const appealEvents = (await fetchAppealEvents(\n            [\n              "appeal_request_submitted",\n              "appeal_request_reviewed",\n              "appeal_request_reset",\n            ],\n            { limit: 2000, forceRefresh: true }\n          )) as UsageLogEvent[];`,
    `          const appealEvents = (await Promise.race([\n            fetchAppealEvents(\n              [\n                "appeal_request_submitted",\n                "appeal_request_reviewed",\n                "appeal_request_reset",\n              ],\n              { limit: 2000, forceRefresh: true }\n            ),\n            new Promise<UsageLogEvent[]>((_, reject) =>\n              window.setTimeout(() => reject(new Error("Firebase appeal load timeout after 8 seconds")), 8000)\n            ),\n          ])) as UsageLogEvent[];`,
    "AppealMockup Firebase timeout"
  );

  source = replaceRequired(
    source,
    `            const reviewedByName = String(\n              request.reviewedByUsername || request.reviewedBy || ""\n            ).trim();`,
    `            const reviewedByName = resolveReviewerFullName(\n              request.reviewedByUsername || "",\n              request.reviewedBy || ""\n            );`,
    "AppealMockup reviewer full-name resolution"
  );

  fs.writeFileSync(appealPath, source, "utf8");
}

function patchAppealRequests() {
  let source = fs.readFileSync(appealRequestsPath, "utf8");
  if (source.includes(`// ${marker}-requests`)) return;

  source = replaceRequired(
    source,
    `          reviewedAt: new Date().toISOString(),\n          topics: topicsForReview,`,
    `          reviewedAt: new Date().toISOString(),\n          reviewedBy: String(\n            currentUser?.agentName || currentUser?.displayName || currentUser?.username || ""\n          ).trim(),\n          reviewedByUsername: String(currentUser?.username || "").trim(),\n          // ${marker}-requests\n          topics: topicsForReview,`,
    "AppealRequests reviewer identity details"
  );

  fs.writeFileSync(appealRequestsPath, source, "utf8");
}

function patchAppealStore() {
  let source = fs.readFileSync(appealStorePath, "utf8");
  if (source.includes(`// ${marker}-store`)) return;

  source = replaceRequired(
    source,
    `  const fullReviewerName = canonicalizeAgentName(user.agentName || user.displayName);`,
    `  const reviewerNameCandidates = [user.agentName, user.displayName]\n    .map((value) => canonicalizeAgentName(value || ""))\n    .filter(Boolean)\n    .sort((a, b) => b.split(/\\s+/).length - a.split(/\\s+/).length);\n  const fullReviewerName = reviewerNameCandidates[0] || canonicalizeAgentName(user.username || "");\n  // ${marker}-store`,
    "appealStore full reviewer selection"
  );

  source = replaceRequired(
    source,
    `      agent_name: canonicalizeAgentName(user.agentName),`,
    `      agent_name: fullReviewerName,`,
    "appealStore agent_name"
  );

  fs.writeFileSync(appealStorePath, source, "utf8");
}

patchAppealMockup();
patchAppealRequests();
patchAppealStore();
console.log("Patched Appeal reviewer full-name resolution and non-blocking Firebase loading.");
