const JIRAPONG_CANONICAL_NAME = "Jirapong Wongwangnoi";

const JIRAPONG_ALIASES = new Set([
  "jirapongwongwangnoi",
  "jirapongwongwaengnoi",
]);

function compactAgentIdentity(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]/g, "");
}

export function canonicalizeAgentName(value: unknown) {
  const name = String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  return JIRAPONG_ALIASES.has(compactAgentIdentity(name)) ? JIRAPONG_CANONICAL_NAME : name;
}

export function canonicalAgentIdentityKey(value: unknown) {
  return compactAgentIdentity(canonicalizeAgentName(value));
}

export function isSameCanonicalAgent(a: unknown, b: unknown) {
  const left = canonicalAgentIdentityKey(a);
  const right = canonicalAgentIdentityKey(b);
  return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
}

export const JIRAPONG_AGENT_NAME = JIRAPONG_CANONICAL_NAME;
