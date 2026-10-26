import React, { createContext, useContext } from 'react';
import type { EvaluationActivityState } from './evaluationActivity';
export const EMPTY_EVALUATION_ACTIVITY: EvaluationActivityState = { ready: true, error: false, records: [], now: 0 };
export const EvaluationActivityContext = createContext<EvaluationActivityState | undefined>(undefined);
export const useOptionalEvaluationActivity = () => useContext(EvaluationActivityContext);
export const useEvaluationActivity = () => useContext(EvaluationActivityContext) || EMPTY_EVALUATION_ACTIVITY;
export function EvaluationActivityUnavailable({ label = 'Editing in Progress' }: { label?: string }) {
  return <div role="status" data-evaluation-case-blocked="true" className="my-4 rounded-2xl border border-sky-200 bg-sky-50 p-5 text-sky-800">
    <div className="text-base font-semibold">{label}</div>
    <p className="mt-2 text-sm leading-6">{label === 'Evaluation Status Unavailable' ? 'Evaluation status could not be verified. Refresh to try again.' : label === 'Evaluation in Progress' ? 'QA is evaluating cases in this audit period. Scores will be available after submission.' : 'QA is updating an evaluation. Case details and scores will be available after the updated result is saved.'}</p>
  </div>;
}
