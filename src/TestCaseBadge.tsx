export default function TestCaseBadge() {
  return (
    <span className="inline-flex rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
      TEST — ไม่นับในผลประเมินจริง
    </span>
  );
}

export function TestCaseNotice() {
  return (
    <div role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <TestCaseBadge />
      <p className="mt-2">บันทึกคะแนนและเปิด Case Detail ได้ตามสิทธิ์เดิม แต่ไม่รวมในคะแนน จำนวนเคส KPI Grade Incentive กราฟ Compare และรายงานผลจริง</p>
    </div>
  );
}
