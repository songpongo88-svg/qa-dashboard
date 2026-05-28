import { FinalGrade, GradeIncentiveResult } from "./evaluationTypes";
import { getIncentiveByScore, scoreToGrade } from "../scoreIncentivePolicy";

export function calculateApril2026Incentive(
  finalScore: number,
  monthKey = "2026-04"
): GradeIncentiveResult {
  const finalGrade = scoreToGrade(finalScore, monthKey) as FinalGrade;
  const incentive = getIncentiveByScore(finalScore, monthKey);
  return {
    finalScore,
    finalGrade,
    incentiveTotal: incentive.total,
    incentiveCash: incentive.cash,
    incentiveRbhCode: incentive.promo,
    incentiveEligible: incentive.total > 0,
    incentiveScheme: incentive.scheme,
  };
}
