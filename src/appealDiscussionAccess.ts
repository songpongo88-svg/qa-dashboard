import { canonicalAgentIdentityKey } from "./lib/agentIdentity";

type Account = { username: string; displayName: string; agentName?: string; role?: string };
type Event = { event_type: string; username?: string; source_case_unavailable?: boolean; created_at?: string; details?: Record<string, any> };
const key = (value: unknown) => String(value || "").trim().toLowerCase();

// Never guess between namesakes; an explicit evaluated-account link takes priority.
export function discussionRecipients(accounts: readonly Account[], request: { targetUsername?: string; agent?: string } | null) {
  const matches = request?.targetUsername
    ? accounts.filter(account => key(account.username) === key(request.targetUsername))
    : accounts.filter(account => [account.agentName, account.displayName, account.username].some(name =>
      Boolean(request?.agent) && canonicalAgentIdentityKey(name) === canonicalAgentIdentityKey(request?.agent)));
  const owner = matches.length === 1 ? matches[0] : undefined;
  return accounts.filter(account => ["Senior", "Supervisor"].includes(account.role || "") || account === owner);
}

export function visibleDiscussionEvents<T extends Event>(events: readonly T[], user: {username?: string; role?: string} | null, requestId: string): T[] {
  if (!user?.username) return [];
  return events.filter(event => event.event_type === "appeal_internal_message" && !event.source_case_unavailable &&
    event.details?.requestId === requestId && (user.role === "Quality Assurance" || key(event.details?.seniorUsername) === key(user.username)))
    .sort((a,b) => Date.parse(a.created_at || "") - Date.parse(b.created_at || ""));
}
