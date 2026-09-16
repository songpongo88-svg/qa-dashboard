import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import TermsWorkspace, { TermsAccessBoundary } from "../../src/knowledge/Terms";
import UserGuide, { GuideDrawer } from "../../src/knowledge/UserGuide";
import { CURRENT_TERMS, documentHash, KNOWLEDGE_BUILD } from "../../src/knowledge/model";
import { MANUAL } from "../../src/knowledge/guideModel";
import "../../src/index.css";

const user = { username: "sample.agent", displayName: "แอดมินเฉาก๊วย (ข้อมูลตัวอย่าง)", role: "Admin Live Chat", teamName: "ทีมตัวอย่าง", sessionId: "local-preview-only" };
const sample = { id: "sample.agent__1.0", username: user.username, user: { ...user, email: "" }, version: CURRENT_TERMS.version,
  contentHash: await documentHash(CURRENT_TERMS), document: CURRENT_TERMS, status: "Accepted" as const,
  acceptedAt: "2026-09-16T12:00:00.000Z", signatureDataUrl: "", signatureSource: "none" as const, buildCommit: KNOWLEDGE_BUILD.commitHash };
const terms = {
  current: async () => null,
  accept: async () => sample,
  history: async () => [sample],
  management: async () => ({ accounts: [{ ...user, status: "Active" }, { username: "sample.qa", displayName: "ผู้ประเมิน QA (ข้อมูลตัวอย่าง)", role: "Quality Assurance", teamName: "ทีมตัวอย่าง", status: "Active" }], records: [sample] }),
  savedSignatures: async () => [],
};
let previewChapters: any[] = JSON.parse(JSON.stringify(MANUAL.chapters));
const guide = { load: async () => ({ chapters: previewChapters, stale: [] }), publish: async (_user: unknown, chapter: any) => { previewChapters = previewChapters.map((row) => row.id === chapter.id ? { ...chapter, revision: (row.revision || 0) + 1, publishedBy: "ตัวอย่างเท่านั้น", updatedAt: new Date().toISOString() } : row); } };
function Preview() {
  const [view, setView] = useState("terms");
  const [help, setHelp] = useState(false);
  const [mobile, setMobile] = useState(false);
  const permissions = view === "guide-admin" ? Object.fromEntries(MANUAL.chapters.flatMap((chapter) => chapter.permissions).map((key) => [key, true])) : { viewDashboard: true, viewSummary: true, viewAppeal: true, submitAppeal: true, viewRubric: true };
  return <div style={{ background: "#f8fafc", minHeight: "100vh" }}>
    <nav style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 12, background: "#1e1b4b", color: "white", fontFamily: "KanitKnowledge" }} aria-label="เครื่องมือทดสอบ">
      <span>ข้อมูลตัวอย่าง · ไม่บันทึกเข้าระบบจริง</span>
      {[["terms", "T&C"], ["profile", "Profile"], ["management", "Management"], ["guide", "Manual Agent"], ["guide-admin", "Manual QA"]].map(([key, label]) => <button style={{ padding: "2px 10px", border: "1px solid #a78bfa", borderRadius: 6 }} key={key} onClick={() => setView(key)}>{label}</button>)}
      <button onClick={() => setMobile(!mobile)}>ขนาดมือถือ</button><button onClick={() => setHelp(true)}>ช่วยเหลือประจำหน้า</button>
    </nav>
    <div style={{ maxWidth: mobile ? 390 : undefined, margin: "0 auto" }}>
      {view === "terms" ? <TermsAccessBoundary user={user} onLogout={() => setView("guide")} repository={terms}><div style={{ padding: 40 }}>เปิด Workspace สำหรับข้อมูลตัวอย่างแล้ว</div></TermsAccessBoundary>
        : view === "profile" ? <TermsWorkspace user={user} repository={terms} />
        : view === "management" ? <TermsWorkspace user={user} management canManage repository={terms} />
        : <UserGuide key={view} user={user} permissions={permissions} canManage={view === "guide-admin"} repository={guide} />}
    </div>
    {help && <GuideDrawer user={user} permissions={permissions} context="case-detail" repository={guide} onClose={() => setHelp(false)} />}
  </div>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
