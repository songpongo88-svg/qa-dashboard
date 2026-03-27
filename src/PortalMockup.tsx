export default function PortalMockup() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-r from-violet-500 to-purple-400">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-[400px]">
        <h1 className="text-xl font-bold mb-2">
          QA Appeal Results Portal
        </h1>

        <p className="text-sm text-gray-500 mb-6">
          โหมดนี้เป็น demo role visibility เท่านั้น
        </p>

        <div className="flex flex-col gap-3">
          <label>Demo User</label>
          <select className="border p-2 rounded">
            <option>Admin</option>
            <option>QA</option>
            <option>Agent</option>
          </select>

          <label>Access Code</label>
          <input
            className="border p-2 rounded"
            placeholder="Enter access code"
          />

          <button className="bg-violet-600 text-white p-2 rounded mt-2">
            Unlock Dashboard
          </button>
        </div>
      </div>
    </div>
  )
}
