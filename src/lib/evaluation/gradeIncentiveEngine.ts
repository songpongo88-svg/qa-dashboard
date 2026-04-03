import { FinalGrade, GradeIncentiveResult } from "./evaluationTypes";

function calculateGrade(finalScore: number): FinalGrade {
  if (finalScore >= 90) return "A";
  if (finalScore >= 85) return "B";
  if (finalScore >= 80) return "C";
  return "D";
}

export function calculateApril2026Incentive(
  finalScore: number
): GradeIncentiveResult {
  const finalGrade = calculateGrade(finalScore);

  switch (finalGrade) {
    case "A":
      return {
        finalScore,
        finalGrade,
        incentiveTotal: 1000,
        incentiveCash: 700,
        incentiveRbhCode: 300,
        incentiveEligible: true,
        incentiveScheme: "APR_2026_SPECIAL",
      };
    case "B":
      return {
        finalScore,
        finalGrade,
        incentiveTotal: 700,
        incentiveCash: 500,
        incentiveRbhCode: 200,
        incentiveEligible: true,
        incentiveScheme: "APR_2026_SPECIAL",
      };
    case "C":
      return {
        finalScore,
        finalGrade,
        incentiveTotal: 500,
        incentiveCash: 350,
        incentiveRbhCode: 150,
        incentiveEligible: true,
        incentiveScheme: "APR_2026_SPECIAL",
      };
    default:
      return {
        finalScore,
        finalGrade,
        incentiveTotal: 0,
        incentiveCash: 0,
        incentiveRbhCode: 0,
        incentiveEligible: false,
        incentiveScheme: "APR_2026_SPECIAL",
      };
  }
}
