import type { MonthlyKpiCase } from "./lib/monthlyKpi";

export type MonthlyKpiAgentOption = {
  agent: string;
  cases: readonly MonthlyKpiCase[];
};

// Retained as a compatibility export; KPI notifications are retired for every role.
export default function MonthlyKpiNotice(_props: {
  cases: readonly MonthlyKpiCase[];
  agent: string;
  monthKey: string;
  monthLabel: string;
  viewer: string;
  agentOptions?: readonly MonthlyKpiAgentOption[];
  canBrowseAgents?: boolean;
  autoOpen?: boolean;
}) {
  return null;
}
