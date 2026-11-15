import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { usernameIdentityPolicyPatchV2 } from "../build/usernameIdentityPolicyPatchV2.js";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const [app, endpoint, server, client] = await Promise.all([
  read("src/App.tsx"), read("server/qaSingleSessionEndpoint.js"),
  read("server/qaSingleSessionAdmin.js"), read("src/qaSingleSessionClient.ts"),
]);

const section = (start, end) => {
  const value = app.split(start)[1]?.split(end)[0] || "";
  assert.ok(value, "Missing trusted-login section: " + start);
  return value;
};
const usernameStep = section('  useEffect(() => {\n    if (currentUser || loginStep !== "username") return;',
  '  }, [currentUser, loginStep, username, maintenanceState.enabled, maintenanceState.message]);');
const usernameBranch = usernameStep.split('if (QA_SINGLE_SESSION_CLIENT_ENABLED) {')[1]
  ?.split('        const normalizedUsername = typedUsername.toLowerCase();')[0] || "";
assert.ok(usernameBranch.includes('setLoginStep("password");') && usernameBranch.includes('return;'),
  "Trusted username step must advance without querying QA profiles");
assert.ok(usernameStep.indexOf('if (QA_SINGLE_SESSION_CLIENT_ENABLED) {') <
  usernameStep.indexOf('getCentralEffectiveUserAccounts()'),
  "Trusted username gate must run before any legacy profile query");
assert.doesNotMatch(usernameBranch, /getDoc\(|getDocs\(|getCentralEffectiveUserAccounts\(/,
  "Unauthenticated trusted username input cannot read Firestore");

const login = section('  const handleLoginAsync = async () => {',
  '    // Direct Firebase profile login first.');
assert.ok(login.includes('if (QA_SINGLE_SESSION_CLIENT_ENABLED) {'));
assert.ok(login.includes('await qaServerSessionRequest("login", {'));
assert.ok(login.includes('const verifiedUser: CurrentUser = {'));
assert.ok(login.includes('await activateUserSession(verifiedUser, "", true)'),
  "The trusted server must authenticate before workspace initialization");
assert.ok(login.includes('if (result.status === "conflict") {') &&
  login.includes('setTakeoverUser(verifiedUser);'),
  "Trusted login must retain the explicit takeover confirmation");
assert.doesNotMatch(login, /getDoc\(|getDocs\(|getCentralEffectiveUserAccounts\(/,
  "Trusted login must not inspect user profiles before authentication");
assert.match(login, /\n      return;\n    }\n\n$/);

const activation = section('  const activateUserSession = async (', '  useEffect(() => {');
assert.ok(activation.includes('let trustedSessionMetadata:'));
assert.ok(activation.includes('sessionId: verification.sessionId, expiresAt: verification.expiresAt,'));
assert.ok(activation.includes('? trustedSessionMetadata!\n        : await createStoredUserSession(user);'),
  "Trusted login must reuse server session ID and avoid a separate legacy Firestore session write");

const restore = section('    async function restoreSecureSession() {',
  '        let restoredUser = storedUser;');
assert.ok(restore.includes('const refreshed = await qaServerSessionRequest("touch");'));
assert.ok(restore.includes('refreshed.sessionId !== verified.sessionId'));
assert.ok(restore.includes('setCurrentUser(secureRestoredUser);'));
assert.ok(restore.includes('return; // Never read/write legacy session collections in trusted mode.'),
  "Trusted page restore must not touch the legacy QA user session collection");

assert.ok(endpoint.includes('displayName: actor.displayName, agentName: actor.agentName,'));
assert.ok(endpoint.includes('sessionId: ticket.sessionId, expiresAt: current.expiresAt,'));
assert.ok(endpoint.includes('sessionId: active.sessionId, expiresAt: active.expiresAt'));
assert.ok(server.includes('return { status: "active", sessionId, expiresAt: row.expiresAt };'));
assert.ok(client.includes('displayName?: string; agentName?: string; email?: string;'));

const mainFixture = [
  'import AutoDeployRefresh from "./AutoDeployRefresh";',
  'ReactDOM.createRoot(document.getElementById("root")!).render(',
  '    <RootErrorBoundary>',
  '      <App />',
  '      <AutoDeployRefresh />',
  '      <MaintenanceRuntime />',
  '    </RootErrorBoundary>',
].join("\n");
const plugin = usernameIdentityPolicyPatchV2();
const transformed = plugin.transform.call({
  error(message) { throw new Error(message); },
}, mainFixture, "/src/main.tsx")?.code || "";
const bypass = transformed.indexOf('VITE_QA_SINGLE_SESSION_ENABLED');
const migration = transformed.indexOf('void ensureUsernamePolicyMigration(');
assert.ok(bypass > 0 && migration > bypass,
  "Trusted login must not be blocked by a privileged, pre-auth username migration");
assert.ok(transformed.includes('if (String(import.meta.env?.VITE_QA_SINGLE_SESSION_ENABLED || "") === "true") {'));

console.log("PASS trusted QA server-only prelogin, authoritative session restore and bootstrap gate");
