import { canonicalAgentIdentityKey } from "./agentIdentity";
import { getUserFullName } from "./userNames";

// Display-only directory data: never pass passwords or change case authorization.
export type CaseAgentDirectoryEntry = {
  username: string;
  displayName?: string;
  agentName?: string;
  teamLead?: string;
  teamName?: string;
};

function directoryUsernameKey(value?: string) {
  return String(value || "").trim().toLowerCase();
}

function findDirectoryProfileByName(name: string, directory: readonly CaseAgentDirectoryEntry[]) {
  const nameKey = canonicalAgentIdentityKey(name);
  if (!nameKey) return undefined;
  const matches = directory.filter((profile) =>
    [profile.displayName, profile.agentName].some((value) => canonicalAgentIdentityKey(value) === nameKey) ||
    directoryUsernameKey(profile.username) === directoryUsernameKey(name)
  );
  // Never guess from a first-name prefix or choose between duplicate names.
  return matches.length === 1 ? matches[0] : undefined;
}

export function resolveCaseAgentTeam(
  caseItem: { targetUsername?: string; agent?: string } | null | undefined,
  directory: readonly CaseAgentDirectoryEntry[]
) {
  const empty = { teamLead: "", teamName: "" };
  if (!caseItem) return empty;

  const username = directoryUsernameKey(caseItem.targetUsername);
  const linkedProfiles = username
    ? directory.filter((profile) => directoryUsernameKey(profile.username) === username)
    : [];
  const profile = username
    ? (linkedProfiles.length === 1 ? linkedProfiles[0] : undefined)
    : findDirectoryProfileByName(caseItem.agent || "", directory);
  // A missing linked account must not fall back to somebody with the same name.
  if (!profile) return empty;

  const teamLead = String(profile.teamLead || "").trim();
  const leadProfiles = teamLead
    ? directory.filter((candidate) => directoryUsernameKey(candidate.username) === directoryUsernameKey(teamLead))
    : [];
  const lead = leadProfiles.length
    ? (leadProfiles.length === 1 ? leadProfiles[0] : undefined)
    : findDirectoryProfileByName(teamLead, directory);

  return {
    teamLead: lead ? getUserFullName(lead) : teamLead,
    teamName: String(profile.teamName || "").trim(),
  };
}
