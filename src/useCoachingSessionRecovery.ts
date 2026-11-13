import { useEffect, useRef, useState } from "react";
import { QA_SINGLE_SESSION_CLIENT_ENABLED, qaServerSessionRequest } from "./qaSingleSessionClient";
import type { CoachingForm } from "./monthlyCoachingModel";

type Recovery = { form: CoachingForm; savedAt: string };
type Props = {
  agentUsername: string;
  month: string;
  form: CoachingForm;
  busy: boolean;
  onMessage: (message: string) => void;
};
export function useCoachingSessionRecovery({ agentUsername, month, form, busy, onMessage }: Props) {
  const key = "coaching-" + agentUsername.toLowerCase() + "-" + month;
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  const formRef = useRef(form);
  const busyRef = useRef(busy);
  const savingRef = useRef(false);
  const lastSavedRef = useRef("");
  formRef.current = form;
  busyRef.current = busy;

  useEffect(() => {
    if (!QA_SINGLE_SESSION_CLIENT_ENABLED) return;
    let active = true;
    void qaServerSessionRequest("draft-read", { documentKey: key }).then(response => {
      const draft = response.draft?.snapshot;
      if (!active || !draft || draft.agentUsername !== agentUsername || draft.month !== month ||
          !draft.form || typeof draft.form !== "object" || Array.isArray(draft.form)) return;
      setRecovery({ form: draft.form as CoachingForm, savedAt: response.draft!.savedAt });
    }).catch(error => { if (active) console.warn("Coaching draft recovery unavailable", error); });
    return () => { active = false; };
  }, [key, agentUsername, month]);

  useEffect(() => {
    if (!QA_SINGLE_SESSION_CLIENT_ENABLED) return;
    const timer = window.setInterval(() => {
      if (savingRef.current || recovery || busyRef.current) return;
      const snapshot = { agentUsername, month, form: formRef.current };
      const serialized = JSON.stringify(snapshot);
      if (serialized === lastSavedRef.current) return;
      savingRef.current = true;
      void qaServerSessionRequest("draft-save", { documentKey: key, revision: Date.now(), snapshot })
        .then(() => { lastSavedRef.current = serialized; })
        .catch(error => console.warn("Coaching autosave unavailable", error))
        .finally(() => { savingRef.current = false; });
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [key, agentUsername, month, recovery]);

  useEffect(() => {
    if (!QA_SINGLE_SESSION_CLIENT_ENABLED) return;
    const flush = (event: Event) => {
      const pendingId = (event as CustomEvent<{ pendingId?: string }>).detail?.pendingId;
      if (!pendingId) return;
      if (savingRef.current || busyRef.current || recovery) {
        onMessage("ยังมี Coaching ที่บันทึกไม่เสร็จ กรุณาตรวจสอบก่อนสลับ Browser");
        return;
      }
      const revision = Date.now();
      const snapshot = { agentUsername, month, form: formRef.current };
      savingRef.current = true;
      void qaServerSessionRequest("draft-save", { documentKey: key, revision, snapshot })
        .then(() => qaServerSessionRequest("ack", { pendingId, documentKey: key, revision }))
        .then(() => onMessage("สำรอง Coaching ลงเซิร์ฟเวอร์แล้ว พร้อมสลับ Browser"))
        .catch(error => {
          console.warn("Coaching takeover save failed", error);
          onMessage("สำรอง Coaching ไม่สำเร็จ ระบบจะไม่ตัด Session เดิม");
        })
        .finally(() => { savingRef.current = false; });
    };
    window.addEventListener("qa:single-session-save-request", flush);
    return () => window.removeEventListener("qa:single-session-save-request", flush);
  }, [key, agentUsername, month, onMessage, recovery]);

  return {
    recovery,
    dismissRecovery: () => setRecovery(null),
    restoreRecovery: () => {
      const current = recovery;
      if (!current) return null;
      setRecovery(null);
      return current.form;
    },
    clearServerRecovery: () => {
      if (!QA_SINGLE_SESSION_CLIENT_ENABLED) return;
      void qaServerSessionRequest("draft-clear", { documentKey: key })
        .catch(error => console.warn("Coaching draft cleanup unavailable", error));
    },
  };
}
