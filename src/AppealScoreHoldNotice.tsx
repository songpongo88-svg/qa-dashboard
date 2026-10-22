import { workflowStatusTone } from "./workflowStatusLabels";
import type { AppealScoreHold } from "./pendingAppealScore";

export default function AppealScoreHoldNotice({ hold }: { hold: AppealScoreHold }) {
  return (
    <div role="status" data-appeal-score-hold="true" className={`flex h-full min-h-[100px] flex-col justify-center rounded-xl border px-5 py-4 ${workflowStatusTone(hold.label)}`}>
      <div className="text-base font-semibold">{hold.label}</div>
      <p className="mt-2 text-xs leading-6">{hold.message}</p>
    </div>
  );
}
