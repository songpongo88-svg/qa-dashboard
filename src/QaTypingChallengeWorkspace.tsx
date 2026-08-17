import React, { useEffect, useMemo, useState } from "react";
import PageHero from "./PageHero";
import QaTypingChallengeAdmin from "./QaTypingChallengeAdmin";
import { fetchStoredProfilePhoto } from "./profilePhotoStore";

type AgentOption = {
  username: string;
  displayName: string;
  agentName: string;
  role: string;
  email?: string;
};

type CurrentUser = {
  username?: string;
  displayName?: string;
};

export default function QaTypingChallengeWorkspace({
  agentOptions,
  currentUser,
}: {
  agentOptions?: AgentOption[];
  currentUser?: CurrentUser | null;
}) {
  const agents = useMemo(
    () =>
      (agentOptions || [])
        .filter((agent) => String(agent.username || "").trim())
        .slice()
        .sort((a, b) =>
          String(a.agentName || a.displayName || a.username).localeCompare(
            String(b.agentName || b.displayName || b.username),
            "en"
          )
        ),
    [agentOptions]
  );

  const [selectedUsername, setSelectedUsername] = useState("");
  const [profilePhoto, setProfilePhoto] = useState("");

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.username === selectedUsername) || null,
    [agents, selectedUsername]
  );

  useEffect(() => {
    if (!selectedUsername && agents.length) setSelectedUsername(agents[0].username);
    if (selectedUsername && !agents.some((agent) => agent.username === selectedUsername)) {
      setSelectedUsername(agents[0]?.username || "");
    }
  }, [agents, selectedUsername]);

  useEffect(() => {
    let cancelled = false;
    const username = String(selectedAgent?.username || "").trim();
    setProfilePhoto("");
    if (!username) return;

    const load = async () => {
      const photo = await fetchStoredProfilePhoto(username);
      if (!cancelled) setProfilePhoto(photo?.photoDataUrl || "");
    };

    void load();
    const handleUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ username?: string }>).detail;
      if (String(detail?.username || "").trim().toLowerCase() === username.toLowerCase()) void load();
    };
    window.addEventListener("qa-profile-photo-updated", handleUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("qa-profile-photo-updated", handleUpdated);
    };
  }, [selectedAgent?.username]);

  const initials = useMemo(() => {
    const source = String(selectedAgent?.agentName || selectedAgent?.displayName || selectedAgent?.username || "AG").trim();
    const parts = source.split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("") || "AG";
  }, [selectedAgent]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/60 p-4 text-slate-950 sm:p-6" style={{ fontFamily: "'Kanit', sans-serif" }}>
      <div className="mx-auto max-w-[1280px] overflow-hidden rounded-[30px] border border-violet-100 bg-white/60 shadow-sm">
        <PageHero
          eyebrow="QUALITY CONTROL"
          title="QA Access Check"
          subtitle="กำหนดคำที่ Agent ต้องพิมพ์ให้ถูกต้องก่อนเข้าดูผล QA"
          workspaceTitle="QA Access Control"
          workspaceSubtitle="Typing verification before QA result access"
        />

        <div className="grid gap-5 p-5 xl:grid-cols-[360px_minmax(0,1fr)] sm:p-6">
          <aside className="rounded-[28px] border border-violet-100 bg-white p-5 shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-600">Target Agent</div>
            <h2 className="mt-1 text-lg font-black text-slate-950">เลือกผู้รับ QA Access Check</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">โจทย์จะผูกกับ Username ของ Agent โดยตรง และมีได้ 1 ชุดที่กำลังใช้งานต่อคน</p>

            <label className="mt-5 block">
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Agent Full Name</span>
              <select
                value={selectedUsername}
                onChange={(event) => setSelectedUsername(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm font-bold text-slate-900 outline-none transition focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"
              >
                <option value="">Select agent</option>
                {agents.map((agent) => (
                  <option key={agent.username} value={agent.username}>
                    {agent.agentName || agent.displayName || agent.username}{agent.role ? ` - ${agent.role}` : ""}
                  </option>
                ))}
              </select>
            </label>

            {selectedAgent ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <div className="flex items-center gap-3">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-sm">
                    {profilePhoto ? (
                      <img src={profilePhoto} alt={`${selectedAgent.agentName || selectedAgent.displayName} profile`} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-base font-black text-violet-700">{initials}</div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black text-slate-950">{selectedAgent.agentName || selectedAgent.displayName}</div>
                    <div className="mt-0.5 truncate text-xs font-bold text-violet-700">{selectedAgent.role || "Agent"}</div>
                    <div className="mt-1 truncate text-[10px] font-semibold text-slate-500">@{selectedAgent.username}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-xs font-semibold text-slate-400">
                เลือก Agent เพื่อกำหนด QA Access Check
              </div>
            )}

            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
              <span className="font-black">หมายเหตุ:</span> ระบบไม่เก็บประวัติคำที่พิมพ์หรือจำนวนครั้งที่ผิด เมื่อ Agent ผ่าน โจทย์ปัจจุบันจะถูกลบออกทันที
            </div>
          </aside>

          <main className="rounded-[28px] border border-violet-100 bg-white p-5 shadow-[0_18px_45px_rgba(76,29,149,0.08)] sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-600">Challenge Setup</div>
                <h2 className="mt-1 text-xl font-black text-slate-950">กำหนดคำและเกณฑ์การผ่าน</h2>
              </div>
              <div className="rounded-full border border-violet-100 bg-violet-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-violet-700">
                No History
              </div>
            </div>

            {selectedAgent ? (
              <QaTypingChallengeAdmin agent={selectedAgent} currentUser={currentUser} />
            ) : (
              <div className="flex min-h-[320px] items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50/70 px-6 text-center">
                <div>
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-2xl">⌨</div>
                  <div className="mt-4 text-base font-black text-slate-700">ยังไม่ได้เลือก Agent</div>
                  <div className="mt-1 text-sm text-slate-500">เลือกชื่อจากด้านซ้ายเพื่อเริ่มกำหนดคำ</div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
