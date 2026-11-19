import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildRolePermissionPatches, mergeCachedRolePermissionRows } from "../src/lib/rolePermissionIsolation.mjs";

const normalizeRoleName = name => String(name).trim().toLowerCase() === "sky cc" ? "SKY CC" : String(name).trim();
const defaults = role => ({
  qaEvaluationTarget: role !== "SKY CC",
  createEvaluation: true,
  manageUsers: false,
  manageTeams: false,
  viewUserDirectory: false,
  viewAllTeams: false,
  viewOwnTeam: true,
});
const keys = Object.keys(defaults("Admin Live Chat"));
const savedPermissions = {
  "Admin Live Chat": { ...defaults("Admin Live Chat"), qaEvaluationTarget: true },
  "SKY CC": { ...defaults("SKY CC"), qaEvaluationTarget: true, createEvaluation: false },
};
const drafts = {
  "Admin Live Chat": { ...savedPermissions["Admin Live Chat"] },
  "SKY CC": { ...savedPermissions["SKY CC"], qaEvaluationTarget: false },
};
const changed = buildRolePermissionPatches(
  ["Admin Live Chat", "SKY CC"], drafts, savedPermissions, keys, defaults, normalizeRoleName,
);
assert.deepEqual(changed.map(({roleName,permissions}) => ({roleName,permissions})), [
  { roleName: "SKY CC", permissions: { qaEvaluationTarget: false } },
], "editing head-office SKY CC must not write Admin Live Chat permissions");
const cache = mergeCachedRolePermissionRows(
  [
    { roleName: "Admin Live Chat", permissions: savedPermissions["Admin Live Chat"] },
    { roleName: "SKY CC", permissions: savedPermissions["SKY CC"] },
  ],
  [{ roleName: "SKY CC", permissions: { qaEvaluationTarget: false } }],
  normalizeRoleName,
);
assert.equal(cache.length, 2);
assert.equal(cache.find(row => row.roleName === "Admin Live Chat").permissions.qaEvaluationTarget, true);
assert.equal(cache.find(row => row.roleName === "SKY CC").permissions.qaEvaluationTarget, false);
assert.equal(cache.find(row => row.roleName === "SKY CC").permissions.createEvaluation, false,
  "a patch must not erase unrelated rights within the same role");
assert.deepEqual(buildRolePermissionPatches(
  ["Admin Live Chat","SKY CC"], savedPermissions, savedPermissions, keys, defaults, normalizeRoleName,
), []);
const qaSaved = { "Quality Assurance": { ...defaults("Quality Assurance"), qaEvaluationTarget: false, manageUsers: true, manageTeams: true, viewUserDirectory: true, viewAllTeams: true, viewOwnTeam: true } };
const qaAttempt = { "Quality Assurance": { ...qaSaved["Quality Assurance"], qaEvaluationTarget: true, manageUsers: false } };
assert.deepEqual(buildRolePermissionPatches(
  ["Quality Assurance"], qaAttempt, qaSaved, keys, defaults, normalizeRoleName,
), [], "protected QA rights remain enforced");
const uiSource = readFileSync(new URL("../src/UserRoleAdminMockup.tsx", import.meta.url), "utf8");
const storeSource = readFileSync(new URL("../src/userRoleStore.ts", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
assert.match(uiSource, /buildRolePermissionPatches\(/);
assert.match(uiSource, /await upsertStoredRolePermissions\(permissionRows\)/);
assert.match(storeSource, /mergeCachedRolePermissionRows\(/);
assert.match(storeSource, /setDoc\(doc\(firebaseDb, ROLE_PERMISSION_COLLECTION, safeDocId\(row.roleName\)\), fromRolePermission\(row\), \{ merge: true \}\)/);
assert.match(appSource, /normalizedRole === "SKY CC" \? \{ qaEvaluationTarget: false \}/);
console.log("PASS: SKY CC head-office permissions are isolated from Admin Live Chat, including cache and QA safeguards");
