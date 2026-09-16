import terms from "./terms.json";
import buildMeta from "../../public/build-meta.json";

export type KnowledgeUser = { username: string; displayName: string; role: string; agentName?: string; email?: string; sessionId?: string; teamName?: string };
export type TermsDocument = typeof terms;
export const CURRENT_TERMS: TermsDocument = terms;
// Bundled with the application: never label an old open tab using a newer deployment's metadata.
export const KNOWLEDGE_BUILD = buildMeta;
export type TermsAcceptance = {
  id: string;
  username: string;
  user: { username: string; displayName: string; role: string; email: string; teamName: string };
  version: string;
  contentHash: string;
  document: TermsDocument;
  status: "Accepted";
  acceptedAt: string;
  signatureDataUrl: string;
  signatureSource: "none" | "drawn" | "saved";
  buildCommit: string;
};
export type AcceptTermsInput = { confirmed: boolean; readToEnd: boolean; signatureDataUrl: string; signatureSource: TermsAcceptance["signatureSource"] };
export const normalizeUsername = (value: string) => value.trim().toLowerCase();
export const acceptanceId = (username: string, version: string) => `${encodeURIComponent(normalizeUsername(username))}__${encodeURIComponent(version)}`;
export async function documentHash(value: unknown) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
export function isCurrentAcceptance(record: TermsAcceptance | null, username: string, hash: string) {
  return Boolean(record && record.status === "Accepted" && normalizeUsername(record.username) === normalizeUsername(username)
    && record.version === CURRENT_TERMS.version && record.contentHash === hash && record.acceptedAt);
}
export function validateTermsInput(input: AcceptTermsInput) {
  if (!input.confirmed || !input.readToEnd) throw new Error("กรุณาอ่านข้อกำหนดให้ครบและเลือกยืนยันก่อนบันทึก");
  if (!["none", "drawn", "saved"].includes(input.signatureSource)) throw new Error("รูปแบบการลงนามไม่ถูกต้อง");
  if (input.signatureDataUrl && (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(input.signatureDataUrl) || input.signatureDataUrl.length > 180000)) {
    throw new Error("ลายเซ็นต้องเป็นภาพ PNG ขนาดไม่เกิน 135 KB");
  }
  if ((input.signatureSource === "none") !== !input.signatureDataUrl) throw new Error("กรุณาตรวจสอบลายเซ็นก่อนยืนยัน");
}
export function formatKnowledgeDate(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "medium" }).format(date) : value;
}
