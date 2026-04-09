import React from "react";

type RubricTopic = {
  code: string;
  title: string;
  score: number;
};

type RubricSection = {
  no: number;
  title: string;
  score: number;
  topics: RubricTopic[];
};

export default function QARubricMockup({
  currentUser,
}: {
  currentUser: any;
}) {
  const rubricSections: RubricSection[] = [
    {
      no: 1,
      title: "Compliance & Policy = การปฏิบัติตามข้อกำหนดและนโยบาย",
      score: 20,
      topics: [
        {
          code: "1.1",
          title: "มาตรฐานการทักทายและปิดการสนทนา",
          score: 10,
        },
        {
          code: "1.2",
          title: "ความถูกต้องของข้อมูล (ไม่ให้ข้อมูลผิด/เกินจริง)",
          score: 5,
        },
        {
          code: "1.3",
          title: "การปฏิบัติตาม PDPA และนโยบายบริษัท",
          score: 5,
        },
      ],
    },
    {
      no: 2,
      title: "Accuracy & Knowledge = ความถูกต้องและความรู้",
      score: 20,
      topics: [
        {
          code: "2.1",
          title: "ความแม่นยำในการตอบตามเคสจริง",
          score: 5,
        },
        {
          code: "2.2",
          title: "ความครบถ้วนในการตอบคำถาม",
          score: 5,
        },
        {
          code: "2.3",
          title: "ความชัดเจนในการอธิบายขั้นตอน",
          score: 5,
        },
        {
          code: "2.4",
          title: "การใช้แหล่งอ้างอิงที่ถูกต้อง",
          score: 5,
        },
      ],
    },
    {
      no: 3,
      title: "Resolution & Ownership = การแก้ไขปัญหาและความรับผิดชอบ",
      score: 20,
      topics: [
        {
          code: "3.1",
          title: "การวิเคราะห์และแก้ไขปัญหาได้ตรงจุด",
          score: 10,
        },
        {
          code: "3.2",
          title: "ความรับผิดชอบต่อเคส (ไม่ส่งต่อโดยไม่จำเป็น)",
          score: 5,
        },
        {
          code: "3.3",
          title: "การแจ้งแนวทางดำเนินการ (Next Step) ชัดเจน",
          score: 5,
        },
      ],
    },
    {
      no: 4,
      title: "Communication Skill = ทักษะการสื่อสาร",
      score: 20,
      topics: [
        {
          code: "4.1",
          title: "โครงสร้างข้อความอ่านง่าย เป็นลำดับ",
          score: 5,
        },
        {
          code: "4.2",
          title: "ความถูกต้องและความกระชับของภาษา",
          score: 5,
        },
        {
          code: "4.3",
          title: "ความเหมาะสมของน้ำเสียง",
          score: 5,
        },
        {
          code: "4.4",
          title: "การปรับรูปแบบตามสถานการณ์",
          score: 5,
        },
      ],
    },
    {
      no: 5,
      title: "Process & SLA = กระบวนการทำงานและข้อตกลงระดับการให้บริการ (SLA)",
      score: 20,
      topics: [
        {
          code: "5.1",
          title: "การปฏิบัติตามขั้นตอนการทำงาน",
          score: 10,
        },
        {
          code: "5.2",
          title: "การตอบกลับภายใน SLA",
          score: 5,
        },
        {
          code: "5.3",
          title: "ความถูกต้องในการบันทึกและอัปเดตสถานะเคส",
          score: 5,
        },
      ],
    },
  ];

  const totalTopics = rubricSections.reduce(
    (sum, section) => sum + section.topics.length,
    0
  );
  const totalScore = rubricSections.reduce(
    (sum, section) => sum + section.score,
    0
  );

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 rounded-3xl bg-gradient-to-r from-violet-950 via-violet-800 to-fuchsia-700 px-6 py-5 text-white shadow-xl">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-200">
            Robinhood QA Rubric
          </div>

          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold">QA Rubric</h1>
              <div className="mt-2 text-sm text-violet-100">
                Logged in as {currentUser?.displayName || "-"} (
                {currentUser?.role || "-"})
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur">
                <div className="text-xs uppercase tracking-wide text-violet-200">
                  Sections
                </div>
                <div className="mt-1 text-2xl font-bold">{rubricSections.length}</div>
              </div>
              <div className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur">
                <div className="text-xs uppercase tracking-wide text-violet-200">
                  Topics
                </div>
                <div className="mt-1 text-2xl font-bold">{totalTopics}</div>
              </div>
              <div className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur col-span-2 sm:col-span-1">
                <div className="text-xs uppercase tracking-wide text-violet-200">
                  Total Score
                </div>
                <div className="mt-1 text-2xl font-bold">{totalScore}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6 rounded-3xl border border-violet-200 bg-white shadow-sm">
          <div className="border-b border-violet-100 px-6 py-4">
            <div className="text-lg font-semibold text-slate-900">
              Customer Service QA Criteria (Non Voice)
            </div>
            <div className="mt-1 text-sm text-slate-500">
              Reference rubric topics used in dashboard and appeal review
            </div>
          </div>

          <div className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-violet-700">
                Coverage
              </div>
              <div className="mt-2 text-sm font-medium text-slate-800">
                Non-Voice QA rubric aligned to latest uploaded criteria file
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Focus
              </div>
              <div className="mt-2 text-sm font-medium text-slate-800">
                Policy, Accuracy, Resolution, Communication, Process & SLA
              </div>
            </div>

            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                Score Model
              </div>
              <div className="mt-2 text-sm font-medium text-slate-800">
                5 sections / 100 total points
              </div>
            </div>

            <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                Usage
              </div>
              <div className="mt-2 text-sm font-medium text-slate-800">
                Dashboard view, QA review, appeal reference
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          {rubricSections.map((section) => (
            <div
              key={section.no}
              className="overflow-hidden rounded-3xl border border-violet-200 bg-white shadow-sm"
            >
              <div className="flex flex-col gap-3 border-b border-violet-100 bg-gradient-to-r from-violet-50 to-fuchsia-50 px-6 py-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-600">
                    Section {section.no}
                  </div>
                  <h2 className="mt-1 text-xl font-bold text-slate-900">
                    {section.title}
                  </h2>
                </div>

                <div className="inline-flex items-center rounded-2xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white shadow-sm">
                  {section.score} คะแนน
                </div>
              </div>

              <div className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
                {section.topics.map((topic) => (
                  <div
                    key={topic.code}
                    className="group rounded-2xl border border-violet-100 bg-slate-50 p-4 transition hover:-translate-y-0.5 hover:border-violet-200 hover:bg-white hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="inline-flex rounded-xl bg-violet-100 px-3 py-1 text-sm font-bold text-violet-800">
                        {topic.code}
                      </div>
                      <div className="rounded-xl bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                        {topic.score} pts
                      </div>
                    </div>

                    <div className="mt-4 text-sm font-semibold leading-6 text-slate-800">
                      {topic.title}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
