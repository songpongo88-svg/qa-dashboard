import React, { useEffect, useState } from "react";
import FirstLoginSparksModal from "./FirstLoginSparksModal";
import SparkJourneyModal, { sparkJourneyPendingKey } from "./SparkJourneyModal";
import {
  getSparksAccount, isWelcomeQuestOpen, type SparkJourneyPrize,
} from "./qaSparksStore";

type Phase = "checking" | "fruit" | "journey" | "done";
type Eligibility = { fruit: boolean; journey: boolean };
export const SPARKS_WELCOME_OPEN_EVENT = "qa:sparks-welcome-open";

/** Show only one quest overlay at a time, respecting each account's history. */
export default function SparksWelcomeQuests({
  username, sessionId = "",
}: { username: string; sessionId?: string }) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [eligible, setEligible] = useState<Eligibility>({ fruit: false, journey: false });
  const [recoveredPrize, setRecoveredPrize] = useState<SparkJourneyPrize | null>(null);
  useEffect(() => {
    let valid = true;
    setPhase("checking");
    setRecoveredPrize(null);
    if (!username || !isWelcomeQuestOpen()) { setPhase("done"); return; }
    void getSparksAccount(username, { historyLimit: 0, sessionId }).then((account) => {
      if (!valid) return;
      const fruit = !account.firstLogin;
      const journey = !account.sparkJourney2026;
      setEligible({ fruit, journey });
      let pending = false;
      try { pending = sessionStorage.getItem(sparkJourneyPendingKey(username)) === "1"; } catch {}
      if (pending && account.sparkJourney2026) {
        setRecoveredPrize(account.sparkJourney2026);
        setPhase("journey");
      } else {
        setPhase(fruit ? "fruit" : journey ? "journey" : "done");
      }
    }).catch((failure) => {
      // Do not display an unverified reward opportunity.
      console.warn("Unable to verify welcome quest eligibility", failure);
      if (valid) setPhase("done");
    });
    return () => { valid = false; };
  }, [username, sessionId]);
  useEffect(() => {
    const open = (event: Event) => {
      if (!isWelcomeQuestOpen()) return;
      const name = (event as CustomEvent<{ quest?: string }>).detail?.quest;
      if (name === "fruit" && eligible.fruit) setPhase("fruit");
      if (name === "journey" && eligible.journey) {
        setRecoveredPrize(null);
        setPhase("journey");
      }
    };
    window.addEventListener(SPARKS_WELCOME_OPEN_EVENT, open);
    return () => window.removeEventListener(SPARKS_WELCOME_OPEN_EVENT, open);
  }, [eligible]);
  if (phase === "checking" || phase === "done") return null;
  if (phase === "fruit") {
    return <FirstLoginSparksModal
      username={username} sessionId={sessionId} verifiedEligibility
      onDismiss={(claimed) => {
        if (claimed) setEligible((old) => ({ ...old, fruit: false }));
        setPhase(eligible.journey ? "journey" : "done");
      }}/>;
  }
  return <SparkJourneyModal username={username} sessionId={sessionId}
    initialPrize={recoveredPrize}
    onDismiss={(claimed) => {
      if (claimed) setEligible((old) => ({ ...old, journey: false }));
      setRecoveredPrize(null);
      setPhase("done");
    }}/>;
}
