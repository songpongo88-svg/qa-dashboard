import type { DeductionLevel } from "./evaluationTypes";

export type DeductionBand = {
  min: number;
  max: number;
};

export type TopicDeductionRule = {
  none: DeductionBand;
  minor: DeductionBand;
  moderate: DeductionBand;
  severe: DeductionBand;
};

export const APR_2026_DEDUCTION_RULES: Record<string, TopicDeductionRule> = {
  "1.1": {
    none: { min: 10, max: 10 },
    minor: { min: 8, max: 9 },
    moderate: { min: 6, max: 7 },
    severe: { min: 2, max: 5 },
  },
  "1.2": {
    none: { min: 10, max: 10 },
    minor: { min: 8, max: 9 },
    moderate: { min: 5, max: 7 },
    severe: { min: 0, max: 4 },
  },
  "1.3": {
    none: { min: 10, max: 10 },
    minor: { min: 8, max: 9 },
    moderate: { min: 5, max: 7 },
    severe: { min: 0, max: 4 },
  },
  "2.1": {
    none: { min: 10, max: 10 },
    minor: { min: 8, max: 9 },
    moderate: { min: 5, max: 7 },
    severe: { min: 0, max: 4 },
  },
  "2.2": {
    none: { min: 10, max: 10 },
    minor: { min: 8, max: 9 },
    moderate: { min: 5, max: 7 },
    severe: { min: 0, max: 4 },
  },
  "2.3": {
    none: { min: 5, max: 5 },
    minor: { min: 4, max: 5 },
    moderate: { min: 2, max: 3 },
    severe: { min: 0, max: 1 },
  },
  "3.1": {
    none: { min: 15, max: 15 },
    minor: { min: 12, max: 14 },
    moderate: { min: 8, max: 11 },
    severe: { min: 0, max: 7 },
  },
  "3.2": {
    none: { min: 10, max: 10 },
    minor: { min: 8, max: 9 },
    moderate: { min: 5, max: 7 },
    severe: { min: 0, max: 4 },
  },
  "4.1": {
    none: { min: 5, max: 5 },
    minor: { min: 4, max: 5 },
    moderate: { min: 2, max: 3 },
    severe: { min: 0, max: 1 },
  },
  "4.2": {
    none: { min: 5, max: 5 },
    minor: { min: 4, max: 5 },
    moderate: { min: 2, max: 3 },
    severe: { min: 0, max: 1 },
  },
  "4.3": {
    none: { min: 10, max: 10 },
    minor: { min: 8, max: 9 },
    moderate: { min: 5, max: 7 },
    severe: { min: 0, max: 4 },
  },
};

export function getDeductionBand(
  topicCode: string,
  level: DeductionLevel
): DeductionBand | null {
  const topicRule = APR_2026_DEDUCTION_RULES[topicCode];
  if (!topicRule) return null;

  switch (level) {
    case "None":
      return topicRule.none;
    case "Minor":
      return topicRule.minor;
    case "Moderate":
      return topicRule.moderate;
    case "Severe":
      return topicRule.severe;
    default:
      return null;
  }
}

export function getSuggestedScoreFromLevel(
  topicCode: string,
  level: DeductionLevel
): number | null {
  const band = getDeductionBand(topicCode, level);
  if (!band) return null;
  return band.max;
}
