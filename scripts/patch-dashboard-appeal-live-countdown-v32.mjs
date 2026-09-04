import fs from "node:fs";

const filePath = "src/DashboardMockup.tsx";
const marker = "// dashboard-appeal-live-countdown-v32";
let source = fs.readFileSync(filePath, "utf8");

if (source.includes(marker)) {
  console.log("Dashboard Appeal live countdown v32 already applied");
  process.exit(0);
}

function replaceOnce(label, search, replacement) {
  if (!source.includes(search)) {
    throw new Error(`Dashboard Appeal v32 anchor not found: ${label}`);
  }
  source = source.replace(search, replacement);
}

const helperAnchor = "function formatBangkokDateTime(value: Date | string | null) {";
const helperIndex = source.indexOf(helperAnchor);
if (helperIndex < 0) {
  throw new Error("Dashboard Appeal v32 formatBangkokDateTime anchor not found");
}

const helperCode = String.raw`${marker}
function formatAppealCountdownV32(deadline: Date | null, nowMs: number) {
  if (!deadline) {
    return { text: "ไม่พบกำหนดเวลา", level: "expired" as const, expired: true };
  }

  const remainingMs = deadline.getTime() - nowMs;
  if (remainingMs <= 0) {
    return { text: "หมดเวลาอุทธรณ์", level: "expired" as const, expired: true };
  }

  const totalSeconds = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const clock = [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
  const text = days > 0 ? `เหลือ ${days} วัน ${clock}` : `เหลือ ${clock}`;
  const level = remainingMs <= 24 * 60 * 60 * 1000
    ? "critical"
    : remainingMs <= 3 * 24 * 60 * 60 * 1000
      ? "warning"
      : "normal";

  return { text, level, expired: false } as const;
}

`;
source = source.slice(0, helperIndex) + helperCode + source.slice(helperIndex);

const appealLogicStart = source.indexOf("  const appealDeadline = getAppealDeadline(caseItem.auditDateObj);");
const appealEffectStart = source.indexOf("  useEffect(() => {", appealLogicStart);
if (appealLogicStart < 0 || appealEffectStart < 0) {
  throw new Error("Dashboard Appeal v32 appeal logic block not found");
}

const appealLogic = String.raw`  const appealDeadline = getAppealDeadline(caseItem.auditDateObj);
  const [appealClockNowV32, setAppealClockNowV32] = useState(() => Date.now());
  useEffect(() => {
    setAppealClockNowV32(Date.now());
    if (!appealDeadline) return;
    const timer = window.setInterval(() => setAppealClockNowV32(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [caseItem.caseId, appealDeadline?.getTime()]);

  const isOwnAppealCase = isCurrentUserCaseOwner(currentUser, caseItem.agent);
  const isAppealObserverRoleV32 = isQualityAssuranceRole(currentUser?.role) && !isOwnAppealCase;
  const isAppealWindowOpenLive = !!appealDeadline && appealClockNowV32 <= appealDeadline.getTime();
  const appealCountdownV32 = formatAppealCountdownV32(appealDeadline, appealClockNowV32);
  const canSubmitAppeal =
    isOwnAppealCase &&
    (isAppealWindowOpenLive || appealOverrideAllowed) &&
    !appealRequestExists;
  const shouldShowAppealActionV32 =
    !appealRequestExists && (isOwnAppealCase || isAppealObserverRoleV32);
  const appealActionDisabledV32 = !canSubmitAppeal;
  const appealActionLabelV32 =
    appealOverrideAllowed && !isAppealWindowOpenLive
      ? "Appeal Override"
      : appealCountdownV32.expired
        ? "หมดเวลาอุทธรณ์"
        : `Appeal · ${appealCountdownV32.text}`;
  const appealActionToneV32 =
    appealOverrideAllowed && !isAppealWindowOpenLive
      ? "border-amber-300 bg-amber-50 text-amber-800"
      : appealCountdownV32.level === "critical"
        ? "border-rose-300 bg-rose-50 text-rose-700"
        : appealCountdownV32.level === "warning"
          ? "border-amber-300 bg-amber-50 text-amber-800"
          : appealCountdownV32.level === "expired"
            ? "border-slate-200 bg-slate-100 text-slate-500"
            : "border-teal-200 bg-teal-50 text-teal-700";
  const appealActionTooltipV32 = isAppealObserverRoleV32
    ? "ดูเวลาคงเหลือสำหรับ Appeal เท่านั้น · Role Quality Assurance ไม่สามารถ Submit Appeal แทนผู้ถูกประเมินได้"
    : appealCountdownV32.expired && !appealOverrideAllowed
      ? "หมดเวลาอุทธรณ์แล้ว"
      : appealOverrideAllowed && !isAppealWindowOpenLive
        ? "เคสนี้ได้รับสิทธิ์ Late Appeal Override"
        : `ส่งคำขออุทธรณ์เคสนี้ · ${appealCountdownV32.text}`;
`;
source = source.slice(0, appealLogicStart) + appealLogic + source.slice(appealEffectStart);

const buttonStart = source.indexOf('                {canSubmitAppeal ? (');
const approvedStart = source.indexOf('                {hasApprovedAppealReport ? (', buttonStart);
if (buttonStart < 0 || approvedStart < 0) {
  throw new Error("Dashboard Appeal v32 Submit Appeal button block not found");
}

const newButton = String.raw`                {shouldShowAppealActionV32 ? (
                  <CaseActionTooltip text={appealActionTooltipV32}>
                    <button
                      type="button"
                      onClick={canSubmitAppeal ? openAppealSubmitForm : undefined}
                      disabled={appealActionDisabledV32}
                      aria-disabled={appealActionDisabledV32}
                      className={
                        "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-[12px] font-extrabold shadow-sm transition " +
                        appealActionToneV32 +
                        (appealActionDisabledV32
                          ? " cursor-not-allowed opacity-80"
                          : " hover:-translate-y-0.5")
                      }
                    >
                      <span aria-hidden="true" className="text-base">＋</span>
                      <span>{appealActionLabelV32}</span>
                      {isAppealObserverRoleV32 ? (
                        <span className="rounded-full border border-current/20 bg-white/70 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide">
                          View only
                        </span>
                      ) : null}
                    </button>
                  </CaseActionTooltip>
                ) : null}

`;
source = source.slice(0, buttonStart) + newButton + source.slice(approvedStart);

replaceOnce(
  "live override badge",
  "appealOverrideAllowed && !isAppealWindowOpen(caseItem.auditDateObj)",
  "appealOverrideAllowed && !isAppealWindowOpenLive"
);

replaceOnce(
  "modal live deadline",
  "Deadline: {formatBangkokDateTime(appealDeadline)}",
  "Deadline: {formatBangkokDateTime(appealDeadline)} · {appealOverrideAllowed && !isAppealWindowOpenLive ? \"Appeal Override\" : appealCountdownV32.text}"
);

fs.writeFileSync(filePath, source, "utf8");
console.log("Dashboard Appeal live countdown and QA observer button v32 applied");
