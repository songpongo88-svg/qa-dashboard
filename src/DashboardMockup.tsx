import React, { useEffect, useMemo, useState } from 'react'

type Grade = 'A' | 'B' | 'C' | 'D' | 'F'
type ReviewStatus = 'Reviewed' | 'Revised' | 'Pending'
type UserRole = 'QA' | 'Supervisor' | 'Senior' | 'Agent'

type TopicScore = {
  topic: string
  score: number
  max: number
  comment?: string
}

type CaseItem = {
  key: string
  caseId: string
  agent: string
  auditDate: string
  weekLabel: string
  inquiryTh: string
  inquiryEn: string
  finalScore: number
  grade: Grade
  reviewStatus: ReviewStatus
  topics: TopicScore[]
  revisedTopics?: TopicScore[]
}

type UserAccount = {
  username: string
  password: string
  displayName: string
  role: UserRole
  agentName?: string
}

const AGENTS = [
  'Anucha Makundin',
  'Arisa aiemrit',
  'Chatkonnaphat Bhusomya',
  'Jariyawadee Taboodda',
  'Jureeporn Piddum',
  'Krivut Vongkampang',
  'Natcha Chai-in',
  'Nattapol Suprom',
  'Sunijtra Siritip',
  'Supakrit Promkhamnoi',
  'Suphitcha Keawliam',
  'Wachiraporn chailittichai',
  'Wassana Phothong',
] as const

const TOPIC_MASTER = [
  '1.1 Greeting and Closing Standard',
  '1.2 Information Accuracy',
  '2.2 Answer Completeness',
  '2.3 Process Explanation Clarity',
  '2.4 Correct Reference Usage',
  '3.1 Root Cause Analysis & Resolution',
  '3.2 Case Ownership',
  '3.3 Clear Next Step Guidance',
  '4.3 Tone Appropriateness',
  '5.1 Work Process Compliance',
] as const

function gradeFromScore(score: number): Grade {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 60) return 'D'
  return 'F'
}

function formatScore(value: number) {
  return value.toFixed(2)
}

function parseDMY(value: string) {
  const [dd, mm, yyyy] = value.split('/').map(Number)
  return new Date(yyyy, mm - 1, dd)
}

function formatInputDate(date: Date) {
  const yyyy = date.getFullYear()
  const mm = `${date.getMonth() + 1}`.padStart(2, '0')
  const dd = `${date.getDate()}`.padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function topicSet(seed: number): TopicScore[] {
  return [
    { topic: TOPIC_MASTER[0], score: 4 + (seed % 2), max: 5, comment: 'มีการทักทายและปิดแชทค่อนข้างครบ' },
    { topic: TOPIC_MASTER[1], score: 3 + (seed % 3), max: 5, comment: 'ข้อมูลหลักถูกต้องในระดับหนึ่ง' },
    { topic: TOPIC_MASTER[2], score: 3 + ((seed + 1) % 3), max: 5, comment: 'ตอบคำถามได้หลายประเด็นแต่ยังไม่ครบทั้งหมด' },
    { topic: TOPIC_MASTER[3], score: 3 + (seed % 2), max: 5, comment: 'อธิบายขั้นตอนพอทำตามได้' },
    { topic: TOPIC_MASTER[4], score: 4, max: 5, comment: 'มีการอ้างอิงข้อมูลค่อนข้างเหมาะสม' },
    { topic: TOPIC_MASTER[5], score: 6 + (seed % 4), max: 10, comment: 'วิเคราะห์ปัญหาได้บางส่วน' },
    { topic: TOPIC_MASTER[6], score: 3 + (seed % 2), max: 5, comment: 'รับผิดชอบต่อเคสในระดับหนึ่ง' },
    { topic: TOPIC_MASTER[7], score: 3 + ((seed + 2) % 3), max: 5, comment: 'มีการแจ้งแนวทางต่อค่อนข้างชัด' },
    { topic: TOPIC_MASTER[8], score: 4, max: 5, comment: 'น้ำเสียงสุภาพเหมาะสม' },
    { topic: TOPIC_MASTER[9], score: 7 + (seed % 3), max: 10, comment: 'ทำตามขั้นตอนงานได้ค่อนข้างดี' },
  ]
}

function revisedTopicSet(base: TopicScore[], uplift: number): TopicScore[] {
  return base.map((item, index) => {
    if (index === 1 || index === 5 || index === 7) {
      return { ...item, score: Math.min(item.max, item.score + uplift) }
    }
    return item
  })
}

function totalScore(topics: TopicScore[]) {
  return topics.reduce((sum, item) => sum + item.score, 0)
}

function createCase(params: {
  caseId: string
  agent: string
  auditDate: string
  weekLabel: string
  inquiryTh: string
  inquiryEn: string
  seed: number
  status: ReviewStatus
  revised?: boolean
}): CaseItem {
  const topics = topicSet(params.seed)
  const revisedTopics = params.revised ? revisedTopicSet(topics, 1) : undefined
  const finalTopics = revisedTopics ?? topics
  const finalScore = totalScore(finalTopics)

  return {
    key: `${params.agent}-${params.caseId}`,
    caseId: params.caseId,
    agent: params.agent,
    auditDate: params.auditDate,
    weekLabel: params.weekLabel,
    inquiryTh: params.inquiryTh,
    inquiryEn: params.inquiryEn,
    finalScore,
    grade: gradeFromScore(finalScore),
    reviewStatus: params.status,
    topics,
    revisedTopics,
  }
}

const CASES: CaseItem[] = [
  createCase({
    caseId: 'AA205349',
    agent: 'Chatkonnaphat Bhusomya',
    auditDate: '11/03/2026',
    weekLabel: 'Week 1',
    inquiryTh: 'ร้านเตรียมอาหารแล้ว แต่ไรเดอร์ขอยกเลิก',
    inquiryEn: 'Food prepared but rider requested cancellation',
    seed: 1,
    status: 'Reviewed',
  }),
  createCase({
    caseId: 'AA205600',
    agent: 'Chatkonnaphat Bhusomya',
    auditDate: '12/03/2026',
    weekLabel: 'Week 1',
    inquiryTh: 'ติดตามเคสเดิมของไรเดอร์',
    inquiryEn: 'Follow-up on previous rider case',
    seed: 2,
    status: 'Reviewed',
  }),
  createCase({
    caseId: 'AA206422',
    agent: 'Nattapol Suprom',
    auditDate: '14/03/2026',
    weekLabel: 'Week 2',
    inquiryTh: 'ลูกค้าส่ง STM มาจากเคสก่อนหน้า',
    inquiryEn: 'Customer sent STM from previous case',
    seed: 3,
    status: 'Revised',
    revised: true,
  }),
  createCase({
    caseId: 'AA206427',
    agent: 'Natcha Chai-in',
    auditDate: '14/03/2026',
    weekLabel: 'Week 2',
    inquiryTh: 'ไรเดอร์ติดตามปัญหาการรับสินค้า',
    inquiryEn: 'Rider followed up on pickup issue',
    seed: 4,
    status: 'Revised',
    revised: true,
  }),
  createCase({
    caseId: 'AA206880',
    agent: 'Natcha Chai-in',
    auditDate: '15/03/2026',
    weekLabel: 'Week 2',
    inquiryTh: 'ผลพิจารณาบัญชีไม่เป็นไปตามนโยบาย',
    inquiryEn: 'Account review did not meet policy requirements',
    seed: 5,
    status: 'Reviewed',
  }),
  createCase({
    caseId: 'AA207397',
    agent: 'Nattapol Suprom',
    auditDate: '16/03/2026',
    weekLabel: 'Week 3',
    inquiryTh: 'ลูกค้าติดตามเงินคืนและระยะเวลา',
    inquiryEn: 'Customer followed up on refund timeline',
    seed: 6,
    status: 'Revised',
    revised: true,
  }),
  createCase({
    caseId: 'AA207998',
    agent: 'Nattapol Suprom',
    auditDate: '17/03/2026',
    weekLabel: 'Week 3',
    inquiryTh: 'ปัญหาการตรวจสอบข้อมูลก่อนตอบ',
    inquiryEn: 'Issue related to verification before response',
    seed: 7,
    status: 'Revised',
    revised: true,
  }),
  createCase({
    caseId: 'AA208553',
    agent: 'Jariyawadee Taboodda',
    auditDate: '18/03/2026',
    weekLabel: 'Week 3',
    inquiryTh: 'ร้านค้าสอบถามวิธีใช้งานระบบ',
    inquiryEn: 'Merchant asked about system usage',
    seed: 8,
    status: 'Reviewed',
  }),
  createCase({
    caseId: 'AA209311',
    agent: 'Jariyawadee Taboodda',
    auditDate: '20/03/2026',
    weekLabel: 'Week 3',
    inquiryTh: 'อธิบาย flow การทำงานไม่ครบ',
    inquiryEn: 'Work process flow explanation incomplete',
    seed: 9,
    status: 'Reviewed',
  }),
  createCase({
    caseId: 'AA210992',
    agent: 'Krivut Vongkampang',
    auditDate: '24/03/2026',
    weekLabel: 'Week 4',
    inquiryTh: 'ติดตามผลการประสานงานหลังบ้าน',
    inquiryEn: 'Follow-up on back-office coordination result',
    seed: 10,
    status: 'Revised',
    revised: true,
  }),
]

const USER_ACCOUNTS: UserAccount[] = [
  { username: 'qa', password: 'qa1234', displayName: 'QA Admin', role: 'QA' },
  { username: 'supervisor', password: 'super1234', displayName: 'Supervisor', role: 'Supervisor' },
  { username: 'senior', password: 'senior1234', displayName: 'Senior', role: 'Senior' },
  ...AGENTS.map((agent) => ({
    username: agent.toLowerCase().replace(/[^a-z]/g, ''),
    password: 'agent1234',
    displayName: agent,
    role: 'Agent' as UserRole,
    agentName: agent,
  })),
]

const TODAY = new Date(2026, 2, 31)
const CASE_TARGET = 10

function gradeTone(grade: Grade) {
  if (grade === 'A') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (grade === 'B') return 'border-sky-200 bg-sky-50 text-sky-700'
  if (grade === 'C') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (grade === 'D') return 'border-rose-200 bg-rose-50 text-rose-700'
  return 'border-slate-200 bg-slate-100 text-slate-700'
}

function statusTone(status: ReviewStatus) {
  if (status === 'Revised') return 'border-violet-200 bg-violet-50 text-violet-700'
  if (status === 'Reviewed') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  return 'border-amber-200 bg-amber-50 text-amber-700'
}

function buildAgentSummary(items: CaseItem[]) {
  const average = items.length ? items.reduce((sum, item) => sum + item.finalScore, 0) / items.length : 0
  const gradeCounts: Record<Grade, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 }

  items.forEach((item) => {
    gradeCounts[item.grade] += 1
  })

  const topicMap = new Map<string, { earned: number; max: number }>()

  items.forEach((item) => {
    const source = item.revisedTopics ?? item.topics
    source.forEach((topic) => {
      const existing = topicMap.get(topic.topic) ?? { earned: 0, max: 0 }
      existing.earned += topic.score
      existing.max += topic.max
      topicMap.set(topic.topic, existing)
    })
  })

  const topicPerformance = Array.from(topicMap.entries()).map(([topic, data]) => ({
    topic,
    percent: data.max ? (data.earned / data.max) * 100 : 0,
  }))

  return {
    average,
    averageDisplay: formatScore(average),
    gradeCounts,
    topicPerformance,
  }
}

function SmallButton({
  children,
  onClick,
  dark,
}: {
  children: React.ReactNode
  onClick: () => void
  dark?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-semibold ${
        dark
          ? 'bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/15'
          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
      }`}
    >
      {children}
    </button>
  )
}

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="rounded-[28px] bg-white shadow-[0_20px_50px_rgba(15,23,42,0.06)] ring-1 ring-slate-200">{children}</section>
}

function PanelHeader({ title }: { title: string }) {
  return (
    <div className="border-b border-slate-200 px-6 py-5">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
    </div>
  )
}

function PanelBody({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`px-6 py-6 ${className}`}>{children}</div>
}

function MetricCard({
  title,
  value,
  sub,
  className = '',
}: {
  title: string
  value: string
  sub: string
  className?: string
}) {
  return (
    <div className={`rounded-3xl border p-5 ${className}`}>
      <div className="text-xs uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-3 text-3xl font-bold text-slate-900">{value}</div>
      <div className="mt-2 text-sm text-slate-600">{sub}</div>
    </div>
  )
}

function WeeklySnapshotCard({
  label,
  caseCount,
  averageDisplay,
  isActive,
  onClick,
}: {
  label: string
  caseCount: number
  averageDisplay: string
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-3xl border p-4 text-left transition ${
        isActive
          ? 'border-violet-300 bg-violet-50 shadow-sm'
          : 'border-slate-200 bg-slate-50 hover:border-violet-200 hover:bg-violet-50/40'
      }`}
    >
      <div className="text-sm font-semibold text-slate-900">{label}</div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{averageDisplay}</div>
      <div className="mt-1 text-sm text-slate-500">{caseCount} cases</div>
    </button>
  )
}

function ReviewStatusBadge({ item }: { item: CaseItem }) {
  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(item.reviewStatus)}`}>
      {item.reviewStatus}
    </span>
  )
}

function CaseNavigatorCard({
  item,
  isSelected,
  onSelect,
}: {
  item: CaseItem
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-3xl border p-4 text-left transition ${
        isSelected
          ? 'border-violet-300 bg-violet-50 shadow-sm'
          : 'border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/30'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">{item.caseId}</div>
          <div className="mt-1 text-sm text-slate-600">{item.agent}</div>
        </div>
        <ReviewStatusBadge item={item} />
      </div>

      <div className="mt-3 text-sm text-slate-600">{item.weekLabel}</div>
      <div className="mt-1 line-clamp-2 text-sm text-slate-500">{item.inquiryTh}</div>
      <div className="mt-3 flex items-center justify-between">
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${gradeTone(item.grade)}`}>
          {item.grade}
        </span>
        <span className="text-sm font-semibold text-slate-900">{formatScore(item.finalScore)}</span>
      </div>
    </button>
  )
}

function TopicPerformanceTable({
  items,
}: {
  items: Array<{ topic: string; percent: number }>
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Topic</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Performance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {items.map((item) => (
            <tr key={item.topic}>
              <td className="px-4 py-3 text-sm text-slate-700">{item.topic}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.min(item.percent, 100)}%` }} />
                  </div>
                  <div className="w-16 text-right text-sm font-semibold text-slate-700">{item.percent.toFixed(1)}%</div>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CaseDetailTopicTable({
  topics,
  revisedTopics,
  reviewStatus,
}: {
  topics: TopicScore[]
  revisedTopics?: TopicScore[]
  reviewStatus: ReviewStatus
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Topic</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Original</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Revised</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Comment</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {topics.map((topic, index) => {
            const revised = revisedTopics?.[index] ?? topic
            return (
              <tr key={topic.topic}>
                <td className="px-4 py-3 text-sm font-medium text-slate-800">{topic.topic}</td>
                <td className="px-4 py-3 text-sm text-slate-700">
                  {topic.score}/{topic.max}
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">
                  {reviewStatus === 'Revised' ? `${revised.score}/${revised.max}` : '-'}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">{revised.comment || topic.comment || '-'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function GradeMix({ gradeCounts }: { gradeCounts: Record<Grade, number> }) {
  const rows: Grade[] = ['A', 'B', 'C', 'D', 'F']
  return (
    <div className="grid gap-3">
      {rows.map((grade) => (
        <div key={grade} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${gradeTone(grade)}`}>{grade}</span>
          <span className="text-lg font-semibold text-slate-900">{gradeCounts[grade]}</span>
        </div>
      ))}
    </div>
  )
}

function DataHealthChecks() {
  const duplicateCheck = new Set<string>()
  const duplicates = CASES.filter((item) => {
    if (duplicateCheck.has(item.key)) return true
    duplicateCheck.add(item.key)
    return false
  })

  const missingRevised = CASES.filter((item) => item.reviewStatus === 'Revised' && !item.revisedTopics)

  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
        Duplicate Case Keys: {duplicates.length}
      </div>
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
        Revised Cases Missing Revised Data: {missingRevised.length}
      </div>
      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-800">
        Loaded Agents: {AGENTS.length}
      </div>
    </div>
  )
}

function LoginScreen(props: {
  username: string
  password: string
  error: string
  onUsernameChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onLogin: () => void
}) {
  const { username, password, error, onUsernameChange, onPasswordChange, onLogin } = props

  return (
    <div className="min-h-screen bg-[#f5f3ff] px-6 py-10 text-slate-800 lg:px-10">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-[32px] bg-white shadow-[0_24px_80px_rgba(88,28,135,0.14)] ring-1 ring-purple-100">
        <div className="bg-gradient-to-r from-purple-900 via-violet-800 to-fuchsia-700 px-8 py-10 text-white">
          <div className="text-sm font-medium uppercase tracking-[0.24em] text-purple-200">Access</div>
          <h1 className="mt-3 text-3xl font-semibold leading-tight lg:text-4xl">QA Dashboard</h1>
          <p className="mt-3 text-sm leading-7 text-purple-100 lg:text-base">
            Demo login สำหรับดูตัวอย่าง dashboard รายบุคคล
          </p>
        </div>

        <div className="space-y-6 px-8 py-8">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Username</label>
            <input
              value={username}
              onChange={(e) => onUsernameChange(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-purple-400"
              placeholder="qa / supervisor / senior / ชื่อ agent แบบอังกฤษติดกัน"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onLogin()
              }}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-purple-400"
              placeholder="Enter password"
            />
            {error ? <div className="mt-2 text-sm font-medium text-red-600">{error}</div> : null}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            ตัวอย่างรหัส:
            <div className="mt-2">QA = qa / qa1234</div>
            <div>Supervisor = supervisor / super1234</div>
            <div>Senior = senior / senior1234</div>
            <div>Agent = ชื่ออังกฤษติดกัน / agent1234</div>
          </div>

          <button
            onClick={onLogin}
            className="inline-flex items-center justify-center rounded-2xl bg-purple-700 px-5 py-3 text-sm font-semibold text-white hover:bg-purple-800"
          >
            Unlock Dashboard
          </button>
        </div>
      </div>
    </div>
  )
}

export default function DashboardMockup() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null)

  const [selectedAgent, setSelectedAgent] = useState('Suphitcha Keawliam')
  const [selectedWeek, setSelectedWeek] = useState('all')
  const [selectedCaseKey, setSelectedCaseKey] = useState('')
  const [dateFrom, setDateFrom] = useState(formatInputDate(new Date(2026, 2, 1)))
  const [dateTo, setDateTo] = useState(formatInputDate(TODAY))

  const visibleAgentList = useMemo(() => {
    if (!currentUser) return []
    if (currentUser.role === 'Agent' && currentUser.agentName) return [currentUser.agentName]
    return [...AGENTS]
  }, [currentUser])

  const agentCases = useMemo(() => CASES.filter((item) => item.agent === selectedAgent), [selectedAgent])

  const weekLabels = useMemo(() => Array.from(new Set(agentCases.map((item) => item.weekLabel))), [agentCases])

  const dateFilteredCases = useMemo(() => {
    const fromDate = new Date(dateFrom)
    const toDate = new Date(dateTo)

    return agentCases.filter((item) => {
      const audit = parseDMY(item.auditDate)
      return audit >= fromDate && audit <= toDate
    })
  }, [agentCases, dateFrom, dateTo])

  const visibleCases = useMemo(() => {
    if (selectedWeek === 'all') return dateFilteredCases
    return dateFilteredCases.filter((item) => item.weekLabel === selectedWeek)
  }, [dateFilteredCases, selectedWeek])

  const selectedCase = useMemo(() => {
    return visibleCases.find((item) => item.key === selectedCaseKey) ?? visibleCases[0] ?? null
  }, [visibleCases, selectedCaseKey])

  const summary = useMemo(() => buildAgentSummary(dateFilteredCases), [dateFilteredCases])

  const incentiveDisplay = useMemo(() => {
    const avg = summary.average
    if (avg >= 90) return '1,000 THB'
    if (avg >= 80) return '700 THB'
    if (avg >= 70) return '300 THB'
    return '0 THB'
  }, [summary.average])

  const incentiveRemark = useMemo(() => {
    const evaluated = dateFilteredCases.length
    if (evaluated < CASE_TARGET) return `ยังประเมินไม่ครบ ${CASE_TARGET} เคส`
    return 'พร้อมใช้คำนวณ incentive'
  }, [dateFilteredCases.length])

  useEffect(() => {
    if (!currentUser) return

    if (currentUser.role === 'Agent' && currentUser.agentName) {
      setSelectedAgent(currentUser.agentName)
      return
    }

    if (!visibleAgentList.includes(selectedAgent)) {
      setSelectedAgent(visibleAgentList[0] || '')
    }
  }, [currentUser, selectedAgent, visibleAgentList])

  useEffect(() => {
    if (!visibleCases.some((item) => item.key === selectedCaseKey)) {
      setSelectedCaseKey(visibleCases[0]?.key ?? '')
    }
  }, [visibleCases, selectedCaseKey])

  const handleLogin = () => {
    const matched = USER_ACCOUNTS.find(
      (user) =>
        user.username === username.trim().toLowerCase() &&
        user.password === password
    )

    if (!matched) {
      setLoginError('Username หรือ Password ไม่ถูกต้อง')
      return
    }

    setCurrentUser(matched)
    setLoginError('')

    if (matched.role === 'Agent' && matched.agentName) {
      setSelectedAgent(matched.agentName)
    } else {
      setSelectedAgent(AGENTS[0] || '')
    }

    setSelectedWeek('all')
    setSelectedCaseKey('')
  }

  const handleLogout = () => {
    setUsername('')
    setPassword('')
    setLoginError('')
    setCurrentUser(null)
    setSelectedAgent('Suphitcha Keawliam')
    setSelectedWeek('all')
    setSelectedCaseKey('')
    setDateFrom(formatInputDate(new Date(2026, 2, 1)))
    setDateTo(formatInputDate(TODAY))
  }

  if (!currentUser) {
    return (
      <LoginScreen
        username={username}
        password={password}
        error={loginError}
        onUsernameChange={setUsername}
        onPasswordChange={setPassword}
        onLogin={handleLogin}
      />
    )
  }

  const isAgentView = currentUser.role === 'Agent'
  const weeklyCards = [
    {
      key: 'all',
      label: 'All Weeks',
      caseCount: dateFilteredCases.length,
      averageDisplay: summary.averageDisplay,
    },
    ...weekLabels.map((week) => {
      const weekCases = dateFilteredCases.filter((item) => item.weekLabel === week)
      const weekSummary = buildAgentSummary(weekCases)
      return {
        key: week,
        label: week,
        caseCount: weekCases.length,
        averageDisplay: weekSummary.averageDisplay,
      }
    }),
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-slate-50 to-fuchsia-50 text-slate-800">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <section className="mb-6 overflow-hidden rounded-[28px] bg-white shadow-[0_20px_60px_rgba(88,28,135,0.10)] ring-1 ring-violet-200">
          <div className="bg-gradient-to-r from-violet-900 via-purple-800 to-fuchsia-700 px-6 py-6 text-white">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-sm font-medium uppercase tracking-[0.2em] text-violet-200">QA Dashboard</div>
                <h1 className="mt-2 text-3xl font-bold">QA Individual Dashboard</h1>
                <p className="mt-2 text-sm text-violet-100">
                  Logged in as {currentUser.displayName} · {currentUser.role}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <SmallButton onClick={() => setSelectedWeek('all')} dark>
                  Reset Week
                </SmallButton>
                <SmallButton onClick={handleLogout} dark>
                  Log out
                </SmallButton>
              </div>
            </div>
          </div>

          <div className="grid gap-4 bg-white px-6 py-5 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Average Score"
              value={summary.averageDisplay}
              sub={`Date range: ${dateFrom} → ${dateTo}`}
              className="border-violet-200 bg-violet-50/60"
            />
            <MetricCard
              title="Cases Evaluated"
              value={`${dateFilteredCases.length}`}
              sub={`Target ${CASE_TARGET} cases`}
              className="border-sky-200 bg-sky-50/60"
            />
            <MetricCard
              title="Incentive"
              value={incentiveDisplay}
              sub={incentiveRemark}
              className="border-emerald-200 bg-emerald-50/60"
            />
            <MetricCard
              title="Selected Week"
              value={selectedWeek === 'all' ? 'All' : selectedWeek}
              sub={selectedCase ? selectedCase.caseId : 'No case selected'}
              className="border-fuchsia-200 bg-fuchsia-50/60"
            />
          </div>
        </section>

        <section className="mb-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Panel>
            <PanelHeader title="Filters" />
            <PanelBody className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <div className="mb-2 text-sm font-semibold text-slate-700">Agent</div>
                <select
                  value={selectedAgent}
                  onChange={(e) => setSelectedAgent(e.target.value)}
                  disabled={isAgentView}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-400 disabled:bg-slate-100"
                >
                  {visibleAgentList.map((agent) => (
                    <option key={agent} value={agent}>
                      {agent}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="mb-2 text-sm font-semibold text-slate-700">Week</div>
                <select
                  value={selectedWeek}
                  onChange={(e) => setSelectedWeek(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-400"
                >
                  <option value="all">All Weeks</option>
                  {weekLabels.map((week) => (
                    <option key={week} value={week}>
                      {week}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="mb-2 text-sm font-semibold text-slate-700">Date From</div>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-400"
                />
              </div>

              <div>
                <div className="mb-2 text-sm font-semibold text-slate-700">Date To</div>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-400"
                />
              </div>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Data Health Checks" />
            <PanelBody>
              <DataHealthChecks />
            </PanelBody>
          </Panel>
        </section>

        <section className="mb-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <Panel>
            <PanelHeader title="Weekly Snapshot" />
            <PanelBody className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {weeklyCards.map((card) => (
                <WeeklySnapshotCard
                  key={card.key}
                  label={card.label}
                  caseCount={card.caseCount}
                  averageDisplay={card.averageDisplay}
                  isActive={selectedWeek === card.key}
                  onClick={() => setSelectedWeek(card.key)}
                />
              ))}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Grade Mix" />
            <PanelBody>
              <GradeMix gradeCounts={summary.gradeCounts} />
            </PanelBody>
          </Panel>
        </section>

        <section className="mb-6">
          <Panel>
            <PanelHeader title="Case Navigator" />
            <PanelBody className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {visibleCases.length ? (
                visibleCases.map((item) => (
                  <CaseNavigatorCard
                    key={item.key}
                    item={item}
                    isSelected={selectedCase?.key === item.key}
                    onSelect={() => setSelectedCaseKey(item.key)}
                  />
                ))
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                  ไม่พบเคสในช่วงวันที่ที่เลือก
                </div>
              )}
            </PanelBody>
          </Panel>
        </section>

        <section className="mb-6">
          <Panel>
            <PanelHeader title="Topic Performance % - Team Weekly" />
            <PanelBody>
              <TopicPerformanceTable items={summary.topicPerformance} />
            </PanelBody>
          </Panel>
        </section>

        <section>
          <Panel>
            <PanelHeader title="Case Detail" />
            <PanelBody>
              {selectedCase ? (
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Agent</div>
                      <div className="mt-2 text-lg font-semibold text-slate-900">{selectedCase.agent}</div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Audit Date</div>
                      <div className="mt-2 text-lg font-semibold text-slate-900">{selectedCase.auditDate}</div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Final Score</div>
                      <div className="mt-2 text-lg font-semibold text-slate-900">{formatScore(selectedCase.finalScore)}</div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Grade</div>
                      <div className="mt-2">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${gradeTone(selectedCase.grade)}`}>
                          {selectedCase.grade}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{selectedCase.caseId}</div>
                        <div className="mt-1 text-sm text-slate-600">{selectedCase.inquiryTh}</div>
                        <div className="mt-1 text-xs text-slate-500">{selectedCase.inquiryEn}</div>
                      </div>

                      <ReviewStatusBadge item={selectedCase} />
                    </div>
                  </div>

                  <CaseDetailTopicTable
                    topics={selectedCase.topics}
                    revisedTopics={selectedCase.revisedTopics}
                    reviewStatus={selectedCase.reviewStatus}
                  />
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                  ยังไม่ได้เลือกเคส
                </div>
              )}
            </PanelBody>
          </Panel>
        </section>
      </div>
    </div>
  )
}
