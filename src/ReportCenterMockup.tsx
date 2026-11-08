import React, { useState } from "react";

export type ReportSection = "analytics" | "cases" | "payments" | "slides";

const REPORT_SECTIONS: Array<{ id: ReportSection; title: string; description: string; icon: string }> = [
  { id: "analytics", title: "Monthly / Yearly / Weekly / Compare", description: "รายงานคะแนน วิเคราะห์และเปรียบเทียบผล QA · PDF / Excel", icon: "▥" },
  { id: "cases", title: "Case Detail", description: "Gen All Case / My Case PDF จากตัวกรองเคส", icon: "▤" },
  { id: "payments", title: "Payment / Final Signed", description: "รายงาน Payment และเอกสารลงนาม · PDF / Excel", icon: "▣" },
  { id: "slides", title: "QA Slides", description: "รายงานประกอบสไลด์ QA และ Export PDF", icon: "▧" },
];

export default function ReportCenterMockup({
  analytics,
  cases,
  payments,
  slides,
}: {
  analytics: React.ReactNode;
  cases: React.ReactNode;
  payments: React.ReactNode;
  slides: React.ReactNode;
}) {
  const [section, setSection] = useState<ReportSection>("analytics");
  const current = REPORT_SECTIONS.find((item) => item.id === section)!;
  return (
    <div data-qa-report-center="true" className="min-h-screen bg-[#f7f8fc] p-4 text-slate-900 sm:p-6">
      <header className="mb-5 rounded-[24px] border border-violet-100 bg-gradient-to-r from-slate-950 via-violet-950 to-violet-800 px-6 py-6 text-white shadow-lg">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-200">QA Dashboard · Reporting</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Report Center</h1>
        <p className="mt-2 text-sm text-violet-100">ศูนย์กลางการเลือกข้อมูล ตรวจสอบ และส่งออกรายงาน QA โดยใช้ระบบสร้างไฟล์และสิทธิ์เดิม</p>
      </header>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="tablist" aria-label="เลือกประเภทรายงาน">
        {REPORT_SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={section === item.id}
            onClick={() => setSection(item.id)}
            className={`rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${section === item.id ? "border-violet-600 bg-violet-50 ring-2 ring-violet-100" : "border-slate-200 bg-white hover:border-violet-200"}`}
          >
            <span className="text-2xl text-violet-700" aria-hidden="true">{item.icon}</span>
            <div className="mt-2 text-sm font-semibold text-slate-950">{item.title}</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>
          </button>
        ))}
      </div>
      <section role="tabpanel" aria-label={current.title} className="min-w-0">
        {section === "analytics" ? analytics : section === "cases" ? cases : section === "payments" ? payments : slides}
      </section>
    </div>
  );
}
