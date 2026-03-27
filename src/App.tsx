import { useState } from 'react'
import AppealMockup from './AppealMockup'
import DashboardMockup from './DashboardMockup'

type TabKey = 'appeal' | 'dashboard'

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('appeal')

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="border-b bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl gap-2 px-6 py-4">
          <button
            type="button"
            onClick={() => setActiveTab('appeal')}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === 'appeal'
                ? 'bg-violet-600 text-white shadow'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            QA Appeal Results
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === 'dashboard'
                ? 'bg-violet-600 text-white shadow'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            QA Dashboard
          </button>
        </div>
      </div>

      <div>
        {activeTab === 'appeal' ? <AppealMockup /> : <DashboardMockup />}
      </div>
    </div>
  )
}
