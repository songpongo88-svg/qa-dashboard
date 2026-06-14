export type Grade = "A" | "B" | "C" | "D" | "F" | "G";

export type GradeLevel =
  | "Excellent"
  | "Strong"
  | "Standard"
  | "Improvement Needed"
  | "Unsatisfactory"
  | "Written Warning";

export type IncentivePolicyKey = "JAN_FEB_2026" | "MAR_2026" | "APR_2026_ONWARD";

export type IncentiveResult = {
  total: number;
  cash: number;
  promo: number;
  label: string;
  remark: GradeLevel | string;
  scheme: IncentivePolicyKey;
};

export function normalizeMonthKey(monthKey?: string | null) {
  const text = String(monthKey ?? "").trim();
  const match = text.match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : "unknown";
}

export function getIncentivePolicyKey(monthKey?: string | null): IncentivePolicyKey {
  const normalized = normalizeMonthKey(monthKey);
  if (normalized === "2026-01" || normalized === "2026-02") return "JAN_FEB_2026";
  if (normalized === "2026-03") return "MAR_2026";
  return "APR_2026_ONWARD";
}

function hasRbhPromo(monthKey?: string | null) {
  const normalized = normalizeMonthKey(monthKey);
  return normalized === "2026-01" || normalized === "2026-04";
}

function formatIncentiveLabel(cash: number, promo: number) {
  const cashText = `${cash.toLocaleString("en-US")} THB`;
  if (promo <= 0) return cashText;
  return `${cash.toLocaleString("en-US")} Cash + ${promo.toLocaleString("en-US")} RBH Promo Code`;
}

function makeIncentive(cash: number, promo: number, remark: GradeLevel | string, scheme: IncentivePolicyKey): IncentiveResult {
  return {
    total: cash,
    cash,
    promo,
    label: formatIncentiveLabel(cash, promo),
    remark,
    scheme,
  };
}

export function scoreToGrade(score: number, monthKey?: string | null, criticalError = false): Grade {
  const safeScore = Number.isFinite(score) ? score : 0;
  if (criticalError) return "G";

  switch (getIncentivePolicyKey(monthKey)) {
    case "JAN_FEB_2026":
      if (safeScore >= 80) return "A";
      if (safeScore >= 70) return "B";
      if (safeScore >= 60) return "C";
      return "D";
    case "MAR_2026":
      if (safeScore >= 90) return "A";
      if (safeScore >= 80) return "B";
      if (safeScore >= 70) return "C";
      if (safeScore >= 60) return "D";
      return "F";
    default:
      if (safeScore >= 90) return "A";
      if (safeScore >= 85) return "B";
      if (safeScore >= 80) return "C";
      return "D";
  }
}

export function getGradeLevel(grade: Grade): GradeLevel {
  switch (grade) {
    case "A":
      return "Excellent";
    case "B":
      return "Strong";
    case "C":
      return "Standard";
    case "D":
      return "Improvement Needed";
    case "G":
      return "Written Warning";
    default:
      return "Unsatisfactory";
  }
}

export function getGradeMeaning(grade: Grade) {
  switch (grade) {
    case "A":
      return "Meets all key standards";
    case "B":
      return "Meets most standards";
    case "C":
      return "Acceptable with improvement points";
    case "D":
      return "Below company standard";
    case "G":
      return "Critical error / written warning";
    default:
      return "Below minimum scoring criteria";
  }
}

export function getIncentiveByGrade(grade: Grade, monthKey?: string | null): IncentiveResult {
  const scheme = getIncentivePolicyKey(monthKey);
  const promoByGrade: Record<"A" | "B" | "C", number> = hasRbhPromo(monthKey)
    ? { A: 500, B: 300, C: 150 }
    : { A: 0, B: 0, C: 0 };

  if (scheme === "JAN_FEB_2026") {
    switch (grade) {
      case "A":
        return makeIncentive(1000, promoByGrade.A, "Excellent", scheme);
      case "B":
        return makeIncentive(500, promoByGrade.B, "Strong", scheme);
      case "C":
        return makeIncentive(300, promoByGrade.C, "Standard", scheme);
      default:
        return { total: 0, cash: 0, promo: 0, label: "No Incentive", remark: getGradeLevel(grade), scheme };
    }
  }

  if (scheme === "MAR_2026") {
    switch (grade) {
      case "A":
        return { total: 1000, cash: 1000, promo: 0, label: "1,000 THB", remark: "Excellent", scheme };
      case "B":
        return { total: 700, cash: 700, promo: 0, label: "700 THB", remark: "Strong", scheme };
      case "C":
        return { total: 300, cash: 300, promo: 0, label: "300 THB", remark: "Standard", scheme };
      default:
        return { total: 0, cash: 0, promo: 0, label: "No Incentive", remark: getGradeLevel(grade), scheme };
    }
  }

  switch (grade) {
    case "A":
      return makeIncentive(1000, promoByGrade.A, "Excellent", scheme);
    case "B":
      return makeIncentive(700, promoByGrade.B, "Strong", scheme);
    case "C":
      return makeIncentive(500, promoByGrade.C, "Standard", scheme);
    default:
      return { total: 0, cash: 0, promo: 0, label: "No Incentive", remark: getGradeLevel(grade), scheme };
  }
}

export function getIncentiveByScore(score: number, monthKey?: string | null, criticalError = false) {
  return getIncentiveByGrade(scoreToGrade(score, monthKey, criticalError), monthKey);
}
