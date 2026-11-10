/**
 * Portable local-only QA Evaluation Draft backup.
 * Important: this is NOT a server submission or a substitute for score history.
 * A backup contains potentially confidential case text and voice recordings.
 * All operations are synchronous and local: no Firestore or network requests.
 */
export const QA_DRAFT_BACKUP_KIND = "qa-dashboard:private-evaluation-draft-backup";
export const QA_DRAFT_BACKUP_VERSION = 1;

export type PortableQaDraft = {
  draftId?: string;
  caseId?: string;
  agentName?: string;
  auditDate?: string;
  savedAtMs?: number;
};

export function makeQaDraftBackup<T extends PortableQaDraft>(
  drafts: readonly T[],
  username: string,
  at: Date = new Date(),
) {
  if (!Array.isArray(drafts) || !drafts.length) {
    throw new Error("ไม่พบ Draft สำหรับสำรองข้อมูล");
  }
  if (!String(username || "").trim()) {
    throw new Error("ไม่พบผู้ใช้งานสำหรับสำรอง Draft");
  }
  if (!Number.isFinite(at.getTime())) {
    throw new Error("วันเวลาสำรองข้อมูลไม่ถูกต้อง");
  }
  return {
    format: QA_DRAFT_BACKUP_KIND,
    schemaVersion: QA_DRAFT_BACKUP_VERSION,
    exportedAt: at.toISOString(),
    ownerUsername: String(username).trim(),
    draftCount: drafts.length,
    // Note: evidence upload URLs may be present, but pending local image files
    // that were not saved into the queue cannot be reconstructed from a backup.
    note: "PRIVATE BACKUP ONLY — NOT SUBMITTED TO QA DASHBOARD. Keep attachments separately.",
    drafts,
  };
}

export function makeQaDraftBackupFilename(username: string, at: Date = new Date()) {
  const safeOwner = String(username || "qa").replace(/[^a-z0-9_-]/gi, "_").slice(0, 48);
  const stamp = at.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return `QA_Private_Draft_Backup_${safeOwner}_${stamp}.json`;
}
