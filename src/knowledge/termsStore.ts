import { collection, doc, getDocFromCache, getDocFromServer, getDocsFromServer, query, runTransaction, serverTimestamp, where } from "firebase/firestore";
import { firebaseDb } from "../firebaseClient";
import { validateStoredUserSession } from "../sessionStore";
import { fetchStoredSignatureLibraryEntry } from "../signatureStore";
import { acceptanceId, CURRENT_TERMS, documentHash, KNOWLEDGE_BUILD, normalizeUsername, validateTermsInput, type AcceptTermsInput, type KnowledgeUser, type TermsAcceptance } from "./model";

export const TERMS_COLLECTION = "qa_terms_acceptances";
const TERMS_CURRENT_TIMEOUT_MS = 6000;
const profileId = (value: string) => value.trim().replace(/\//g, "__").replace(/\s+/g, " ");

async function withTimeout<T>(promise: Promise<T>, ms = TERMS_CURRENT_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("การเชื่อมต่อฐานข้อมูลใช้เวลานานเกินไป กรุณากดลองอีกครั้ง")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Use the existing central session/profile; a local session fallback cannot create acknowledgements. */
export async function verifiedKnowledgeUser(user: KnowledgeUser) {
  const result = await validateStoredUserSession(user.sessionId || "", user.username);
  if (!result.valid) throw new Error("ไม่สามารถยืนยันบัญชีได้ กรุณาออกจากระบบแล้วเข้าสู่ระบบอีกครั้ง");
  const snapshot = await getDocFromServer(doc(firebaseDb, "qa_user_profiles", profileId(result.session.username)));
  const profile = snapshot.exists() ? snapshot.data() : {};
  if (profile.status === "Suspended") throw new Error("บัญชีนี้ถูกระงับการใช้งาน");
  return {
    username: result.session.username,
    displayName: String(profile.displayName || result.session.displayName),
    email: String(profile.email || result.session.email || ""),
    role: String(profile.role || result.session.role),
    teamName: String(profile.teamName || profile.team_name || ""),
  };
}

export async function knowledgeManagerScope(user: KnowledgeUser, purpose: "terms" | "guide") {
  const identity = await verifiedKnowledgeUser(user);
  const snap = await getDocFromServer(doc(firebaseDb, "qa_role_permissions", profileId(identity.role)));
  const permissions = snap.data()?.permissions || {};
  // QA's existing built-in administration rights are preserved; no additional roles are granted access.
  const isQa = ["Quality Assurance", "QA"].includes(identity.role);
  if (!isQa && permissions[purpose === "terms" ? "manageUsers" : "manageRubric"] !== true) throw new Error("บัญชีนี้ไม่มีสิทธิ์จัดการข้อมูลส่วนนี้");
  const allTeams = isQa || permissions.viewAllTeams === true;
  if (!allTeams && !identity.teamName) throw new Error("ยังไม่มีทีมที่กำหนดให้บัญชีนี้ กรุณาติดต่อผู้ดูแลสิทธิ์");
  return { identity, allTeams };
}

function parseAcceptance(id: string, data: any): TermsAcceptance {
  const acceptedAt = data.acceptedAtServer?.toDate?.().toISOString() || "";
  if (!data.document?.sections?.length || !data.contentHash || !acceptedAt || data.status !== "Accepted") {
    throw new Error("หลักฐานการยอมรับไม่สมบูรณ์ กรุณาแจ้งผู้ดูแลระบบ");
  }
  return { id, username: data.username, user: data.user, version: data.version, contentHash: data.contentHash,
    document: data.document, status: "Accepted", acceptedAt, signatureDataUrl: data.signatureDataUrl || "",
    signatureSource: data.signatureSource || "none", buildCommit: data.buildCommit || "" };
}

export const termsRepository = {
  async current(user: KnowledgeUser): Promise<TermsAcceptance | null> {
    const reference = doc(firebaseDb, TERMS_COLLECTION, acceptanceId(user.username, CURRENT_TERMS.version));
    try {
      const cached = await getDocFromCache(reference);
      if (cached.exists()) return parseAcceptance(cached.id, cached.data());
    } catch {}
    const snapshot = await withTimeout(getDocFromServer(reference));
    return snapshot.exists() ? parseAcceptance(snapshot.id, snapshot.data()) : null;
  },
  async accept(user: KnowledgeUser, input: AcceptTermsInput): Promise<TermsAcceptance> {
    validateTermsInput(input);
    const identity = await verifiedKnowledgeUser(user);
    const hash = await documentHash(CURRENT_TERMS);
    const reference = doc(firebaseDb, TERMS_COLLECTION, acceptanceId(identity.username, CURRENT_TERMS.version));
    await runTransaction(firebaseDb, async (transaction) => {
      const existing = await transaction.get(reference);
      if (existing.exists()) {
        if (existing.data().contentHash !== hash) throw new Error("ข้อความเวอร์ชันนี้เปลี่ยนแปลง กรุณาติดต่อผู้ดูแลให้ประกาศเวอร์ชันใหม่");
        return; // First acknowledgement wins, including its original time and signature.
      }
      transaction.set(reference, {
        schemaVersion: 1, username: normalizeUsername(identity.username), user: identity,
        teamName: identity.teamName, version: CURRENT_TERMS.version, contentHash: hash,
        document: CURRENT_TERMS, status: "Accepted", acceptedAtServer: serverTimestamp(),
        signatureDataUrl: input.signatureDataUrl, signatureSource: input.signatureSource,
        buildCommit: KNOWLEDGE_BUILD.commitHash || "", confirmationMethod: "explicit-checkbox-and-button",
      });
    });
    const saved = await withTimeout(getDocFromServer(reference));
    if (!saved.exists()) throw new Error("ยังยืนยันการบันทึกไม่ได้ กรุณาลองอีกครั้ง");
    return parseAcceptance(saved.id, saved.data());
  },
  async history(user: KnowledgeUser): Promise<TermsAcceptance[]> {
    await verifiedKnowledgeUser(user);
    const result = await getDocsFromServer(query(collection(firebaseDb, TERMS_COLLECTION), where("username", "==", normalizeUsername(user.username))));
    return result.docs.map((item) => parseAcceptance(item.id, item.data())).sort((a, b) => b.acceptedAt.localeCompare(a.acceptedAt));
  },
  async management(user: KnowledgeUser) {
    const { identity, allTeams } = await knowledgeManagerScope(user, "terms");
    const profiles = collection(firebaseDb, "qa_user_profiles");
    const acceptances = collection(firebaseDb, TERMS_COLLECTION);
    const accounts = await getDocsFromServer(allTeams ? profiles : query(profiles, where("teamName", "==", identity.teamName)));
    // Scope by current membership, not the historical team in the acceptance snapshot.
    const usernames = accounts.docs.map((item) => normalizeUsername(String(item.data().username || item.id)));
    const scopedRecords = [];
    if (allTeams) scopedRecords.push(await getDocsFromServer(acceptances));
    else for (let offset = 0; offset < usernames.length; offset += 30) {
      scopedRecords.push(await getDocsFromServer(query(acceptances, where("username", "in", usernames.slice(offset, offset + 30)))));
    }
    return {
      accounts: accounts.docs.map((item) => {
        const row = item.data();
        return { username: String(row.username || item.id), displayName: String(row.displayName || row.agentName || row.username || item.id),
          role: String(row.role || ""), teamName: String(row.teamName || ""), status: String(row.status || "Active") };
      }),
      records: scopedRecords.flatMap((result) => result.docs.map((item) => parseAcceptance(item.id, item.data()))),
    };
  },
  async savedSignatures(user: KnowledgeUser) {
    const identity = await verifiedKnowledgeUser(user);
    const compact = identity.username.trim().toLowerCase().replace(/[^a-z0-9ก-๙]/g, "");
    const entries = await Promise.all(["QA", "Supervisor", "Senior", "Agent"].map(async (role) => ({ role, image: await fetchStoredSignatureLibraryEntry(`${compact}::${role}`) })));
    return entries.filter((entry) => /^data:image\/png;base64,/.test(entry.image));
  },
};
export type TermsRepository = typeof termsRepository;
