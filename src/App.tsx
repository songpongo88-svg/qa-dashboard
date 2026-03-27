import { useState } from 'react'
import PortalMockup from './PortalMockup'
import DashboardMockup from './DashboardMockup'

type TabKey = 'portal' | 'dashboard'

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('portal')

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="border-b bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl gap-2 px-6 py-4">
          <button
            type="button"
            onClick={() => setActiveTab('portal')}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${
              activeTab === 'portal'
                ? 'bg-violet-600 text-white'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            Portal Mockup
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${
              activeTab === 'dashboard'
                ? 'bg-violet-600 text-white'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            Dashboard Mockup
          </button>
        </div>
      </div>

      <div>
        {activeTab === 'portal' ? <PortalMockup /> : <DashboardMockup />}
      </div>
    </div>
  )
}
