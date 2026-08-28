import { canonicalizeAgentName } from "./agentIdentity";

type UserNameSource = {
  username?: unknown;
  displayName?: unknown;
  display_name?: unknown;
  agentName?: unknown;
  agent_name?: unknown;
};

// The profile's Full Name is authoritative. Username remains a separate login ID.
export function getUserFullName(source: UserNameSource) {
  return [source.displayName, source.display_name, source.agentName, source.agent_name, source.username]
    .map(canonicalizeAgentName).find(Boolean) || "";
}

export function withConsistentUserNames<T extends UserNameSource>(source: T) {
  const fullName = getUserFullName(source);
  return { ...source, displayName: fullName, agentName: fullName };
}

// Use the full-name snapshot only for evaluations linked to a user account.
// Unlinked legacy/imported records retain their existing agent identity.
export function getEvaluationAgentFullName(source: {
  agentName?: unknown; agent_name?: unknown;
  targetUsername?: unknown; target_username?: unknown;
  targetDisplayName?: unknown; target_display_name?: unknown;
}) {
  const agentName = canonicalizeAgentName(source.agentName ?? source.agent_name);
  const fullName = canonicalizeAgentName(source.targetDisplayName ?? source.target_display_name);
  const username = String(source.targetUsername ?? source.target_username ?? "").trim();
  return (username && fullName ? fullName : agentName) || fullName;
}
