type DemoUser = {
  label: string;
  password: string;
  role: 'supervisor' | 'senior' | 'qa_management' | 'agent';
  agentName?: string;
};

const DEMO_USERS: DemoUser[] = [
  { label: 'Phrommarin Thaithorn', password: 'Phrommarin2026', role: 'supervisor' },
  { label: 'Krivut Vongkampang', password: 'Krivut2026', role: 'senior' },
  { label: 'Songpon Phothong', password: 'Songpon2026', role: 'qa_management' },
  { label: 'Anucha Makundin', password: 'Anucha2026', role: 'agent', agentName: 'Anucha Makundin' },
  { label: 'Arisa aiemrit', password: 'Arisa2026', role: 'agent', agentName: 'Arisa aiemrit' },
  { label: 'Chatkonnaphat Bhusomya', password: 'Chatkonnaphat2026', role: 'agent', agentName: 'Chatkonnaphat Bhusomya' },
  { label: 'Jariyawadee Taboodda', password: 'Jariyawadee2026', role: 'agent', agentName: 'Jariyawadee Taboodda' },
  { label: 'Jureeporn Piddum', password: 'Jureeporn2026', role: 'agent', agentName: 'Jureeporn Piddum' },
  { label: 'Natcha Chai-in', password: 'Natcha2026', role: 'agent', agentName: 'Natcha Chai-in' },
  { label: 'Nattapol Suprom', password: 'Nattapol2026', role: 'agent', agentName: 'Nattapol Suprom' },
  { label: 'Sunijtra Siritip', password: 'Sunijtra2026', role: 'agent', agentName: 'Sunijtra Siritip' },
  { label: 'Supakrit Promkhamnoi', password: 'Supakrit2026', role: 'agent', agentName: 'Supakrit Promkhamnoi' },
  { label: 'Suphitcha Keawliam', password: 'Suphitcha2026', role: 'agent', agentName: 'Suphitcha Keawliam' },
  { label: 'Wachiraporn chailittichai', password: 'Wachiraporn2026', role: 'agent', agentName: 'Wachiraporn chailittichai' },
  { label: 'Wassana Phothong', password: 'Wassana2026', role: 'agent', agentName: 'Wassana Phothong' },
].sort((a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }));

function hasFullAccess(user: any) {
  return Boolean(user && user.role !== 'agent');
}

function validateCases(cases: AppealCase[]) {
  const seen = new Set<string>();
  const issues: string[] = [];

  for (const item of cases) {
    const key = `${item.agentName}-${item.caseId}`;
    if (seen.has(key)) issues.push(`Duplicate case found: ${key}`);
    seen.add(key);
    if (!item.items.length) issues.push(`Missing appeal items for ${key}`);
  }

  return issues;
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 whitespace-pre-line text-base font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function LoginScreen(props: {
  selectedLogin: string;
  accessCode: string;
  loginError: string;
  onSelectLogin: (value: string) => void;
  onChangeAccessCode: (value: string) => void;
  onUnlock: () => void;
}) {
  function LoginScreen(props: {
  selectedLogin: string;
  accessCode: string;
  loginError: string;
  onSelectLogin: (value: string) => void;
  onChangeAccessCode: (value: string) => void;
  onUnlock: () => void;
}) {
  const {
    selectedLogin,
    accessCode,
    loginError,
    onSelectLogin,
    onChangeAccessCode,
    onUnlock,
  } = props;

  return (
      );
}
  const {
    selectedLogin,
    accessCode,
    loginError,
    onSelectLogin,
    onChangeAccessCode,
    onUnlock,
  } = props;

  return (
    <div className="min-h-screen bg-[#f5f3ff] px-6 py-10 text-slate-800 lg:px-10">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-[32px] bg-white shadow-[0_24px_80px_rgba(88,28,135,0.14)] ring-1 ring-purple-100">
        <div className="bg-gradient-to-r from-purple-900 via-violet-800 to-fuchsia-700 px-8 py-10 text-white">
          <div className="text-sm font-medium uppercase tracking-[0.24em] text-purple-200">
            Access
          </div>
          <h1 className="mt-3 text-3xl font-semibold leading-tight lg:text-4xl">
            QA Appeal Results Portal
          </h1>
          <p className="mt-3 text-sm leading-7 text-purple-100 lg:text-base">
            โหมดนี้เป็นเดโม role visibility เท่านั้น
          </p>
        </div>

        <div className="space-y-6 px-8 py-8">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Demo User</label>
            <select
              value={selectedLogin}
              onChange={(e) => onSelectLogin(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-purple-400"
            >
              <option value="">Select demo user</option>
              {DEMO_USERS.map((user) => (
                <option key={user.label} value={user.label}>
                  {user.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Access Code</label>
            <input
              type="password"
              value={accessCode}
              onChange={(e) => onChangeAccessCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onUnlock();
              }}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-purple-400"
              placeholder="Enter access code"
            />
            {loginError ? (
              <div className="mt-2 text-sm font-medium text-red-600">{loginError}</div>
            ) : null}
          </div>

          <button
            onClick={onUnlock}
            className="inline-flex items-center justify-center rounded-2xl bg-purple-700 px-5 py-3 text-sm font-semibold text-white hover:bg-purple-800"
          >
            Unlock Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AppealMockup({ currentUser }: { currentUser: any }) {
  const [selectedagent, setSelectedagent] = useState('');
  const [selectedCaseId, setSelectedCaseId] = useState('');

  const validationIssues = useMemo(() => validateCases(APPEAL_CASES), []);

  const visibleCases = useMemo(() => {
    if (!currentUser) return [] as AppealCase[];
    return hasFullAccess(currentUser)
      ? APPEAL_CASES
      : APPEAL_CASES.filter((item) => item.agentName === currentUser.agentName);
  }, [currentUser]);

  const filteredCases = useMemo(() => {
    if (!selectedagent) return [] as AppealCase[];
    return visibleCases.filter((item) => item.agentName === selectedagent);
  }, [selectedagent, visibleCases]);

  const selectedCase = useMemo(() => {
    if (!selectedagent) return null;
    return filteredCases.find((item) => item.caseId === selectedCaseId) ?? filteredCases[0] ?? null;
  }, [filteredCases, selectedagent, selectedCaseId]);

  useEffect(() => {
  if (!currentUser) {
    setSelectedagent('');
    setSelectedCaseId('');
    return;
  }

  if (!hasFullAccess(currentUser)) {
    const own = currentUser.agentName ?? '';
    if (selectedagent !== own) {
      setSelectedagent(own);
      return;
    }
  }

  if (!selectedagent) {
    setSelectedCaseId('');
    return;
  }

  if (!filteredCases.some((item) => item.caseId === selectedCaseId)) {
    setSelectedCaseId(filteredCases[0]?.caseId ?? '');
  }
}, [currentUser, selectedagent, selectedCaseId, filteredCases]);

  const selectableagents = hasFullAccess(currentUser)
    ? agent_LIST
    : agent_LIST.filter((agent) => visibleCases.some((item) => item.agentName === agent));

  const resolvedAppealResultDate =
    (selectedCase && FILE_CREATED_AT_BY_CASE[selectedCase.caseId]) ||
    selectedCase?.appealResultDate ||
    '-';

  const notificationByline = `Songpon Phothong · ${resolvedAppealResultDate}`;

  return (
    <div className="min-h-screen bg-[#f5f3ff] text-slate-800">
      <div className="mx-auto max-w-7xl px-6 py-10 lg:px-10">
        <section className="mb-8 overflow-hidden rounded-[28px] bg-white shadow-[0_20px_60px_rgba(88,28,135,0.10)] ring-1 ring-purple-100">
          <div className="bg-gradient-to-r from-purple-900 via-violet-800 to-fuchsia-700 px-8 py-8 text-white">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h1 className="mt-2 text-3xl font-semibold leading-tight lg:text-4xl">
                  แจ้งผลการพิจารณาอุทธรณ์คะแนน QA รายบุคคล
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-purple-100 lg:text-base">
                  โหมดเดโม: agent เห็นเฉพาะข้อมูลของตัวเอง ส่วน Supervisor, Senior และ QA Management สามารถเลือกดูได้ทุกคน
                </p>
              </div>

            <div className="bg-gradient-to-r from-purple-900 via-violet-800 to-fuchsia-700 px-8 py-8 text-white">
  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
    <div>
      <h1 className="mt-2 text-3xl font-semibold leading-tight lg:text-4xl">
        แจ้งผลการพิจารณาอุทธรณ์คะแนน QA รายบุคคล
      </h1>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-purple-100 lg:text-base">
        โหมดเดโม: agent เห็นเฉพาะข้อมูลของตัวเอง ส่วน Supervisor, Senior และ QA Management สามารถเลือกดูได้ทุกคน
      </p>
    </div>

    <div className="text-sm text-purple-100">
      {currentUser?.displayName || currentUser?.label || '-'} ({currentUser?.role || '-'})
    </div>
  </div>
</div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 bg-[#fcfbff] px-8 py-5 lg:grid-cols-3">
            <Card label="Selected agent" value={selectedagent || '-'} />
            <Card label="Role" value="CS Customer (Non Voice)" />
            <Card label="Selected Case" value={selectedCase?.caseId || '-'} />
          </div>
        </section>

        {validationIssues.length > 0 ? (
          <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {validationIssues.map((issue) => (
              <div key={issue}>• {issue}</div>
            ))}
          </section>
        ) : null}

        <section className="mb-8 rounded-[28px] bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)] ring-1 ring-slate-200 lg:p-8">
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_0.8fr] lg:items-end">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">agent Name</label>
              <select
                value={selectedagent}
                disabled={currentUser?.role === 'agent'}
                onChange={(e) => setSelectedagent(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-purple-400 disabled:bg-slate-100"
              >
                <option value="">ยังไม่เลือกชื่อ agent</option>
                {selectableagents.map((agent) => (
                  <option key={agent} value={agent}>
                    {agent}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Case ID</label>
              <select
                value={selectedCase?.caseId || ''}
                onChange={(e) => setSelectedCaseId(e.target.value)}
                disabled={!selectedagent}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-purple-400 disabled:bg-slate-100"
              >
                {!selectedagent ? <option value="">กรุณาเลือก agent ก่อน</option> : null}
                {filteredCases.map((item) => (
                  <option key={item.caseId} value={item.caseId}>
                    {item.caseId} · {item.caseNo}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-2xl bg-purple-50 px-4 py-4 ring-1 ring-purple-100">
              <div className="text-xs uppercase tracking-wide text-purple-700">Current View</div>
              <div className="mt-2 text-lg font-semibold text-slate-900">
                {selectedCase?.caseId || '-'}
              </div>
              <div className="mt-1 text-sm text-slate-600">
                {selectedCase?.agentName || 'ยังไม่มีข้อมูล'}
              </div>
            </div>
          </div>
        </section>

        {selectedCase ? (
          <section className="rounded-[28px] bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.06)] ring-1 ring-purple-300 lg:p-8">
            <div className="space-y-4 border-b border-slate-200 pb-5">
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                <div className="text-sm font-semibold text-red-800">
                  {selectedCase.appealClosedNotice}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <Card label="Audit Date" value={selectedCase.auditDate || '-'} />
                <Card label="Appeal Submit Date & Time" value={selectedCase.appealSubmitDate || '-'} />
                <Card label="Appeal Result Date & Time" value={resolvedAppealResultDate} />
                <Card label="Original Score" value={`${selectedCase.originalScore} · ${selectedCase.originalGrade}`} />
                <Card label="Revised Score" value={`${selectedCase.revisedScore} · ${selectedCase.revisedGrade}`} />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card
                  label="Appeal Channel"
                  value={`${selectedCase.submissionChannel} | ${selectedCase.submissionEmail || '-'}`}
                />
                <Card
                  label="Appeal Result Notification"
                  value={`${DEFAULT_NOTIFICATION_TITLE} | ${notificationByline} | ${DEFAULT_NOTIFICATION_EMAIL}`}
                />
              </div>
            </div>

            <div className="mt-6 grid gap-6">
              {selectedCase.items.map((item) => (
                <div
                  key={item.topic}
                  className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)]"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">{item.topic}</h3>
                      <div className="mt-2 inline-flex rounded-full bg-rose-50 px-3 py-1 text-sm font-semibold text-rose-700 ring-1 ring-rose-200">
                        ผลพิจารณา: {item.result}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 lg:min-w-[220px]">
                      <Card label="Original" value={item.before} />
                      <Card label="Revised" value={item.after} />
                    </div>
                  </div>

                  {item.agentAppeal ? (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900 shadow-sm">
                      <div className="font-semibold">ประเด็นที่ agent ยื่นอุทธรณ์</div>
                      <div className="mt-2 whitespace-pre-line">{item.agentAppeal}</div>
                    </div>
                  ) : null}

                  <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm leading-7 text-indigo-950 shadow-sm">
                    <div className="font-semibold">คำชี้แจงผลพิจารณา</div>
                    <div className="mt-2 whitespace-pre-line">{item.reason}</div>
                  </div>

                  {item.guidance ? (
                    <div className="mt-4 rounded-2xl border border-purple-200 bg-purple-50 p-4 text-sm leading-7 text-purple-950 shadow-sm">
                      <div className="font-semibold">แนวทางการตอบ</div>
                      <div className="mt-2 whitespace-pre-line">{item.guidance}</div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
              <div className="text-sm font-semibold text-emerald-700">
                สรุปเคส {selectedCase.caseId}
              </div>
              <p className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-700">
                {selectedCase.summary}
              </p>
            </div>
          </section>
        ) : (
          <section className="rounded-[28px] bg-white p-8 text-center shadow-[0_20px_50px_rgba(15,23,42,0.06)] ring-1 ring-slate-200">
            <div className="text-lg font-semibold text-slate-900">กรุณาเลือกชื่อ agent</div>
          </section>
        )}
      </div>
    </div>
  );
}
