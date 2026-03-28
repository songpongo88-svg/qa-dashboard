import React, { useEffect, useMemo, useState } from "react";
type AppealCase = {
 caseId: string;
 agentName: string;
 appealSubmitDate?: string;
 appealResultDate?: string;
 appealChannel?: string;
 originalScore?: number;
 revisedScore?: number;
 result?: string;
 reason?: string;
};
const DEMO_CASES: AppealCase[] = [
 {
   caseId: "AA205349",
   agentName: "Jariyawadee Taboodda",
   appealSubmitDate: "26/03/2026 20:26",
   appealResultDate: "27/03/2026 10:00",
   appealChannel: "Email",
   originalScore: 76,
   revisedScore: 79,
   result: "Revised",
   reason: "มีการทบทวนรายละเอียดเพิ่มเติมและปรับคะแนนบางหัวข้อ",
 },
 {
   caseId: "AA206880",
   agentName: "Songpon Phothong",
   appealSubmitDate: "26/03/2026 20:26",
   appealResultDate: "27/03/2026 10:30",
   appealChannel: "Email",
   originalScore: 69,
   revisedScore: 69,
   result: "No Change",
   reason: "ตรวจสอบแล้วคงผลประเมินเดิม",
 },
];
function hasFullAccess(user: any) {
 return Boolean(user && user.role !== "Agent");
}
export default function AppealMockup({ currentUser }: { currentUser: any }) {
 const [selectedAgent, setSelectedAgent] = useState("");
 const [selectedCaseId, setSelectedCaseId] = useState("");
 const visibleCases = useMemo(() => {
   if (!currentUser) return [];
   return hasFullAccess(currentUser)
     ? DEMO_CASES
     : DEMO_CASES.filter((item) => item.agentName === currentUser.agentName);
 }, [currentUser]);
 const selectableAgents = useMemo(() => {
   return [...new Set(visibleCases.map((item) => item.agentName))].sort((a, b) =>
     a.localeCompare(b)
   );
 }, [visibleCases]);
 useEffect(() => {
   if (!selectableAgents.length) {
     setSelectedAgent("");
     setSelectedCaseId("");
     return;
   }
   if (currentUser?.role === "Agent" && currentUser.agentName) {
     setSelectedAgent(currentUser.agentName);
     return;
   }
   if (!selectedAgent || !selectableAgents.includes(selectedAgent)) {
     setSelectedAgent(selectableAgents[0]);
   }
 }, [currentUser, selectableAgents, selectedAgent]);
 const filteredCases = useMemo(() => {
   if (!selectedAgent) return [];
   return visibleCases.filter((item) => item.agentName === selectedAgent);
 }, [visibleCases, selectedAgent]);
 useEffect(() => {
   if (!filteredCases.length) {
     setSelectedCaseId("");
     return;
   }
   const stillExists = filteredCases.some((item) => item.caseId === selectedCaseId);
   if (!stillExists) {
     setSelectedCaseId(filteredCases[0].caseId);
   }
 }, [filteredCases, selectedCaseId]);
 const selectedCase =
   filteredCases.find((item) => item.caseId === selectedCaseId) || filteredCases[0] || null;
 return (
<div className="min-h-screen bg-[#f5f3ff] text-slate-800">
<div className="mx-auto max-w-7xl px-6 py-10">
<div className="overflow-hidden rounded-[28px] bg-white shadow-[0_20px_60px_rgba(88,28,135,0.10)] ring-1 ring-purple-100">
<div className="bg-gradient-to-r from-purple-900 via-violet-800 to-fuchsia-700 px-8 py-8 text-white">
<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
<div>
<h1 className="text-3xl font-semibold leading-tight lg:text-4xl">
                 แจ้งผลการพิจารณาอุทธรณ์คะแนน QA
</h1>
<p className="mt-3 text-sm text-purple-100">
                 Agent เห็นเฉพาะข้อมูลของตัวเอง ส่วน QA / Supervisor / Senior เห็นได้ทุกคน
</p>
</div>
<div className="text-sm text-purple-100">
               {currentUser?.displayName || "-"} ({currentUser?.role || "-"})
</div>
</div>
</div>
<div className="grid gap-4 p-6 md:grid-cols-2">
<div>
<label className="mb-2 block text-sm font-semibold text-slate-700">Agent Name</label>
<select
               value={selectedAgent}
               onChange={(e) => setSelectedAgent(e.target.value)}
               disabled={currentUser?.role === "Agent"}
               className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-purple-400 disabled:bg-slate-100"
>
               {selectableAgents.map((agent) => (
<option key={agent} value={agent}>
                   {agent}
</option>
               ))}
</select>
</div>
<div>
<label className="mb-2 block text-sm font-semibold text-slate-700">Case ID</label>
<select
               value={selectedCase?.caseId || ""}
               onChange={(e) => setSelectedCaseId(e.target.value)}
               className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-purple-400"
>
               {filteredCases.map((item) => (
<option key={item.caseId} value={item.caseId}>
                   {item.caseId}
</option>
               ))}
</select>
</div>
</div>
</div>
       {selectedCase ? (
<div className="mt-8 rounded-[28px] bg-white p-8 shadow-[0_20px_50px_rgba(15,23,42,0.06)] ring-1 ring-slate-200">
<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
<div className="text-xs text-slate-500">Case ID</div>
<div className="mt-1 text-base font-semibold text-slate-900">{selectedCase.caseId}</div>
</div>
<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
<div className="text-xs text-slate-500">Appeal Submit Date</div>
<div className="mt-1 text-base font-semibold text-slate-900">
                 {selectedCase.appealSubmitDate || "-"}
</div>
</div>
<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
<div className="text-xs text-slate-500">Appeal Result Date</div>
<div className="mt-1 text-base font-semibold text-slate-900">
                 {selectedCase.appealResultDate || "-"}
</div>
</div>
<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
<div className="text-xs text-slate-500">Appeal Channel</div>
<div className="mt-1 text-base font-semibold text-slate-900">
                 {selectedCase.appealChannel || "-"}
</div>
</div>
</div>
<div className="mt-6 grid gap-4 md:grid-cols-3">
<div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
<div className="text-xs text-amber-700">Original Score</div>
<div className="mt-1 text-xl font-bold text-slate-900">
                 {selectedCase.originalScore ?? "-"}
</div>
</div>
<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
<div className="text-xs text-emerald-700">Revised Score</div>
<div className="mt-1 text-xl font-bold text-slate-900">
                 {selectedCase.revisedScore ?? "-"}
</div>
</div>
<div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
<div className="text-xs text-violet-700">Result</div>
<div className="mt-1 text-xl font-bold text-slate-900">
                 {selectedCase.result || "-"}
</div>
</div>
</div>
<div className="mt-6 rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
<div className="text-sm font-semibold text-indigo-900">Reason</div>
<div className="mt-2 text-sm leading-7 text-slate-700">
               {selectedCase.reason || "-"}
</div>
</div>
</div>
       ) : (
<div className="mt-8 rounded-[28px] bg-white p-8 text-center ring-1 ring-slate-200">
           ไม่พบข้อมูลอุทธรณ์
</div>
       )}
</div>
</div>
 );
}
