// Release approval interlock. These are human signoffs, not proof that
// deployed Firebase rules, Supabase ACLs or real-browser tests are correct.
// Keep backend authorization tied to sessionPolicyEnabled while blocking
// accidental login before all independently verified security reviews.
export const SINGLE_SESSION_RELEASE_REQUIREMENTS = Object.freeze([
  "QA_SINGLE_SESSION_FIREBASE_RULES_APPROVED",
  "QA_SINGLE_SESSION_SUPABASE_ACCESS_APPROVED",
  "QA_SINGLE_SESSION_TWO_BROWSER_APPROVED",
]);

export function qaSingleSessionReleaseApproved(environment = process.env) {
  return SINGLE_SESSION_RELEASE_REQUIREMENTS.every(key => environment?.[key] === "true");
}
