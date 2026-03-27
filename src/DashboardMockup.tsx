export default function DashboardMockup() {
  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="mx-auto max-w-6xl rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="text-2xl font-bold mb-4">QA Dashboard Mockup</h1>
        <p className="text-slate-600 mb-6">
          หน้านี้ไว้สำหรับ dashboard ตัวที่ 2
        </p>

        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border p-4">
            <div className="text-sm text-slate-500">Average Score</div>
            <div className="text-2xl font-bold">84.00</div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="text-sm text-slate-500">Grade</div>
            <div className="text-2xl font-bold">B</div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="text-sm text-slate-500">Status</div>
            <div className="text-2xl font-bold">Reviewed</div>
          </div>
        </div>
      </div>
    </div>
  )
}
