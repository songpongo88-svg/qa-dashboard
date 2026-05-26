import React, { useMemo } from "react";
import PageHero from "./PageHero";
import { ChatMessage } from "./TeamChatMockup";

type CurrentUser = {
  username: string;
  displayName: string;
  role: string;
  agentName: string;
};

type CallHistoryRow = ChatMessage & {
  direction: "Incoming" | "Outgoing";
  peerUsername: string;
  peerDisplayName: string;
  roomLabel: string;
};

const CALL_TIMEOUT_SECONDS = 45;

function formatCallTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("th-TH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getCallStatusLabel(status?: ChatMessage["callStatus"]) {
  if (status === "accepted") return "Answered";
  if (status === "declined") return "Declined";
  if (status === "ended") return "Ended";
  if (status === "missed") return "Missed Call";
  return "Ringing";
}

function getCallStatusStyle(status?: ChatMessage["callStatus"]) {
  if (status === "accepted") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "declined") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "ended") return "border-slate-200 bg-slate-100 text-slate-600";
  if (status === "missed") return "border-orange-200 bg-orange-50 text-orange-700";
  return "border-amber-200 bg-amber-100 text-amber-800";
}

function getCallDurationLabel(message: ChatMessage) {
  if (message.callStatus === "accepted") return "Connected";
  if (message.callStatus === "ended") return "Ended";
  if (message.callStatus === "missed") return `${CALL_TIMEOUT_SECONDS}s timeout`;
  if (message.callStatus === "declined") return "Declined";
  return "Ringing";
}

export default function CallHistoryMockup({
  currentUser,
  messages,
  onOpenChat,
}: {
  currentUser: CurrentUser;
  messages: ChatMessage[];
  onOpenChat: (peerUsername?: string) => void;
}) {
  const callHistory = useMemo(() => {
    const myUsername = currentUser.username.toLowerCase();
    return messages
      .filter((message) => message.kind === "call")
      .map((message): CallHistoryRow => {
        const isOutgoing = message.username.toLowerCase() === myUsername;
        const peerUsername = isOutgoing ? String(message.toUsername || "") : message.username;
        const peerDisplayName = isOutgoing
          ? String(message.toDisplayName || message.toUsername || "Team Room")
          : message.displayName || message.username || "Team Room";
        return {
          ...message,
          direction: isOutgoing ? "Outgoing" : "Incoming",
          peerUsername,
          peerDisplayName,
          roomLabel: message.room === "team" ? "Team Room" : "Private Chat",
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [currentUser.username, messages]);

  const missedCount = callHistory.filter((call) => call.callStatus === "missed").length;
  const incomingCount = callHistory.filter((call) => call.direction === "Incoming").length;
  const outgoingCount = callHistory.filter((call) => call.direction === "Outgoing").length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50 to-white pb-10">
      <div className="mx-auto max-w-[1500px] overflow-hidden rounded-[30px] border border-violet-200 bg-white shadow-[0_18px_50px_rgba(88,28,135,0.10)]">
        <PageHero
          eyebrow="Call History"
          title="Call History Center"
          subtitle="Separate call log for incoming, outgoing, missed, declined, and ended calls."
          workspaceTitle="Voice Activity"
          workspaceSubtitle="This page is separate from chat rooms so call records are easier to track."
        />

        <div className="grid gap-4 border-b border-violet-100 bg-gradient-to-r from-slate-950 via-violet-950 to-fuchsia-800 p-5 text-white md:grid-cols-4">
          <div className="rounded-3xl border border-white/15 bg-white/10 p-5">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-violet-100">All Calls</div>
            <div className="mt-3 text-4xl font-black">{callHistory.length}</div>
            <div className="mt-1 text-xs font-semibold text-violet-100">Total call records</div>
          </div>
          <div className="rounded-3xl border border-white/15 bg-white/10 p-5">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-orange-100">Missed</div>
            <div className="mt-3 text-4xl font-black">{missedCount}</div>
            <div className="mt-1 text-xs font-semibold text-orange-100">No answer / timeout</div>
          </div>
          <div className="rounded-3xl border border-white/15 bg-white/10 p-5">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-sky-100">Incoming</div>
            <div className="mt-3 text-4xl font-black">{incomingCount}</div>
            <div className="mt-1 text-xs font-semibold text-sky-100">Calls received</div>
          </div>
          <div className="rounded-3xl border border-white/15 bg-white/10 p-5">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-100">Outgoing</div>
            <div className="mt-3 text-4xl font-black">{outgoingCount}</div>
            <div className="mt-1 text-xs font-semibold text-emerald-100">Calls made</div>
          </div>
        </div>

        <div className="p-5">
          <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-700">Call Records</div>
                <div className="mt-1 text-xl font-black text-slate-950">ประวัติการโทรแยกจากห้องแชท</div>
              </div>
              <button
                type="button"
                onClick={() => onOpenChat()}
                className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-black text-white transition hover:bg-violet-800"
              >
                Open Team Chat
              </button>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[1040px]">
                <div className="grid grid-cols-[1.05fr_1fr_1fr_0.8fr_0.9fr_0.9fr_0.8fr_0.75fr] gap-3 bg-slate-950 px-5 py-3 text-[11px] font-black uppercase tracking-[0.14em] text-white">
                  <div>Time</div>
                  <div>Caller</div>
                  <div>Receiver</div>
                  <div>Type</div>
                  <div>Status</div>
                  <div>Room</div>
                  <div>Duration</div>
                  <div>Action</div>
                </div>
                <div className="divide-y divide-slate-100">
                  {callHistory.map((call) => (
                    <div key={call.id} className="grid grid-cols-[1.05fr_1fr_1fr_0.8fr_0.9fr_0.9fr_0.8fr_0.75fr] items-center gap-3 px-5 py-4 transition hover:bg-violet-50/70">
                      <div className="text-sm font-bold text-slate-900">{formatCallTime(call.createdAt)}</div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-slate-950">{call.displayName || call.username}</div>
                        <div className="truncate text-[11px] font-semibold text-slate-500">{call.username}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-slate-700">{call.room === "team" ? "Team Room" : call.toDisplayName || call.toUsername || "-"}</div>
                        <div className="truncate text-[11px] font-semibold text-slate-500">{call.room === "team" ? "Group" : call.toUsername || "-"}</div>
                      </div>
                      <div>
                        <span className={`rounded-full px-3 py-1 text-xs font-black ${call.direction === "Outgoing" ? "bg-sky-50 text-sky-700" : "bg-violet-50 text-violet-700"}`}>
                          {call.direction}
                        </span>
                      </div>
                      <div>
                        <span className={`rounded-full border px-3 py-1 text-xs font-black ${getCallStatusStyle(call.callStatus)}`}>
                          {getCallStatusLabel(call.callStatus)}
                        </span>
                      </div>
                      <div className="text-sm font-bold text-slate-700">{call.roomLabel}</div>
                      <div className="text-sm font-bold text-slate-700">{getCallDurationLabel(call)}</div>
                      <div>
                        <button
                          type="button"
                          onClick={() => onOpenChat(call.room === "private" ? call.peerUsername : undefined)}
                          className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-black text-violet-700 transition hover:bg-violet-100"
                        >
                          Open Chat
                        </button>
                      </div>
                    </div>
                  ))}
                  {!callHistory.length ? (
                    <div className="px-5 py-16 text-center">
                      <div className="text-lg font-black text-slate-800">No call history yet.</div>
                      <div className="mt-2 text-sm font-semibold text-slate-500">
                        When users start voice calls, records will appear here as a separate tab.
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
