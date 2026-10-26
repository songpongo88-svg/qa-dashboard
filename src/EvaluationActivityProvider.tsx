import React, { useSyncExternalStore } from 'react';
import { EvaluationActivityContext } from './EvaluationActivityContext';
import { configureEvaluationResultRefresh, getEvaluationActivitySnapshot, subscribeEvaluationActivity } from './evaluationActivityStore';
import { refreshStoredEvaluation } from './evaluationStore';
configureEvaluationResultRefresh(async id => {
  await refreshStoredEvaluation(id);
  window.dispatchEvent(new CustomEvent('qa-dashboard-data-refresh', { detail: Date.now() }));
});
export default function EvaluationActivityProvider({ children }: { children: React.ReactNode }) {
  const state = useSyncExternalStore(subscribeEvaluationActivity, getEvaluationActivitySnapshot, getEvaluationActivitySnapshot);
  return <EvaluationActivityContext.Provider value={state}>{children}</EvaluationActivityContext.Provider>;
}
