export type RubricVersion = "MAR_2026" | "APR_2026";

export type ReviewStatus = "Draft" | "Finalized" | "Revised" | "Appeal";

export type DeductionLevel = "None" | "Minor" | "Moderate" | "Severe";

export type ToneCheck = "Good" | "Fair" | "Poor" | "N/A";

export type FinalGrade = "A" | "B" | "C" | "D" | "F" | "G";

export interface CaseMaster {
  caseId: string;
  auditDate: string;
  monthLabel: string;
  weekLabel?: string;
  agentName: string;
  qaReviewer?: string;
  channel?: string;
  contactType?: string;
  sourceType: "text" | "image" | "mixed" | "voice";
  hasOutboundCall: boolean;
  voiceFileUploaded: boolean;
  rubricVersion: RubricVersion;
  reviewStatus: ReviewStatus;
  caseSummary: string;
  customerIntent?: string;
  agentActionSummary?: string;
  resolutionStatus?: string;
  potentialRisk?: string;
  finalScore: number;
  weightedFinalScore?: number;
  finalGrade: FinalGrade;
  incentiveTotal: number;
  incentiveCash: number;
  incentiveRbhCode: number;
  criticalErrorFlag: boolean;
  criticalErrorType?: string;
  criticalErrorNote?: string;
  overallQaSummary?: string;
  coachingSummary?: string;
}

export interface RubricTopicDefinition {
  rubricVersion: RubricVersion;
  topicCode: string;
  topicLabel: string;
  topicGroup: string;
  maxScore: number;
  focus: string;
  practicalCheckpoints: string[];
  boundaryRule: string;
}

export interface EvaluationTopicResult {
  topicCode: string;
  topicLabel: string;
  topicGroup: string;
  maxScore: number;
  deductionLevel: DeductionLevel;
  suggestedScoreMin?: number;
  suggestedScoreMax?: number;
  reviewerFinalScore: number;
  reasonFormalTh: string;
  evidenceQuote?: string;
  improvementGuidance?: string;
  boundaryRuleApplied?: string;
  reviewerComment?: string;
  languageQualityCheck?: ToneCheck;
  chatToneCheck?: ToneCheck;
  voiceToneCheck?: ToneCheck;
}

export interface GradeIncentiveResult {
  finalScore: number;
  finalGrade: FinalGrade;
  incentiveTotal: number;
  incentiveCash: number;
  incentiveRbhCode: number;
  incentiveEligible: boolean;
  incentiveScheme: string;
}
