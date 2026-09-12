function replaceOrThrow(context, code, search, replacement, label) {
  if (!code.includes(search)) {
    context.error(`QA Access Check write fix could not find ${label}.`);
  }
  return code.replace(search, replacement);
}

export function qaAccessCheckWriteFixPatch() {
  let storePatched = false;
  let overviewPatched = false;
  let adminPatched = false;

  return {
    name: "qa-access-check-write-fix",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];

      if (cleanId.endsWith("/src/qaTypingChallengeStore.ts")) {
        let next = code;

        next = replaceOrThrow(
          this,
          next,
          `import { collection, deleteDoc, doc, getDoc, onSnapshot, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";`,
          `import { collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";`,
          "Firestore getDocs import"
        );

        const overviewTypeAnchor = `export type QaTypingChallengeQueueOverview = {\n  username: string;\n  displayName: string;\n  queue: QaTypingChallenge[];\n};`;
        const helperAndType = `async function resolveQaTypingChallengeDocumentIdV3(username: string, preferredDocumentId = "") {\n  const preferred = String(preferredDocumentId || "").trim();\n  if (preferred) return preferred;\n\n  const normalizedUsername = String(username || "").trim();\n  const fallbackDocumentId = safeDocId(normalizedUsername);\n  if (!normalizedUsername) return fallbackDocumentId;\n\n  try {\n    const directSnap = await getDoc(doc(firebaseDb, QA_TYPING_CHALLENGE_COLLECTION, fallbackDocumentId));\n    if (directSnap.exists()) return directSnap.id;\n\n    const snapshot = await getDocs(collection(firebaseDb, QA_TYPING_CHALLENGE_COLLECTION));\n    const lookup = normalizedUsername.toLowerCase();\n    const matched = snapshot.docs.find((item) =>\n      String(item.data()?.username || "").trim().toLowerCase() === lookup\n    );\n    return matched?.id || fallbackDocumentId;\n  } catch (error) {\n    console.warn("Resolve QA Access Check document failed; fallback to username key", error);\n    return fallbackDocumentId;\n  }\n}\n\nexport type QaTypingChallengeQueueOverview = {\n  documentId: string;\n  username: string;\n  displayName: string;\n  queue: QaTypingChallenge[];\n};`;
        next = replaceOrThrow(this, next, overviewTypeAnchor, helperAndType, "overview row type");

        next = replaceOrThrow(
          this,
          next,
          `          return {\n            username,\n            displayName: String(data?.displayName || queue[0]?.displayName || username).trim(),\n            queue,\n          };`,
          `          return {\n            documentId: item.id,\n            username,\n            displayName: String(data?.displayName || queue[0]?.displayName || username).trim(),\n            queue,\n          };`,
          "overview document id mapping"
        );

        next = replaceOrThrow(
          this,
          next,
          `export async function updateQaTypingChallengeRepeatCount(\n  username: string,\n  challengeId: string,\n  repeatCount: number\n) {`,
          `export async function updateQaTypingChallengeRepeatCount(\n  username: string,\n  challengeId: string,\n  repeatCount: number,\n  documentId = ""\n) {`,
          "update function signature"
        );

        next = replaceOrThrow(
          this,
          next,
          `  const challengeRef = doc(firebaseDb, QA_TYPING_CHALLENGE_COLLECTION, safeDocId(normalizedUsername));\n  await runTransaction(firebaseDb, async (transaction) => {`,
          `  const resolvedDocumentId = await resolveQaTypingChallengeDocumentIdV3(normalizedUsername, documentId);\n  const challengeRef = doc(firebaseDb, QA_TYPING_CHALLENGE_COLLECTION, resolvedDocumentId);\n  await runTransaction(firebaseDb, async (transaction) => {`,
          "update document resolution"
        );

        next = replaceOrThrow(
          this,
          next,
          `  const challengeRef = doc(firebaseDb, QA_TYPING_CHALLENGE_COLLECTION, safeDocId(username));\n\n  await runTransaction(firebaseDb, async (transaction) => {`,
          `  const challengeDocumentId = await resolveQaTypingChallengeDocumentIdV3(username);\n  const challengeRef = doc(firebaseDb, QA_TYPING_CHALLENGE_COLLECTION, challengeDocumentId);\n\n  await runTransaction(firebaseDb, async (transaction) => {`,
          "assign document resolution"
        );

        storePatched = true;
        return { code: next, map: null };
      }

      if (cleanId.endsWith("/src/QaAccessCheckOverview.tsx")) {
        let next = code;

        next = replaceOrThrow(
          this,
          next,
          `  const saveRepeatCount = async (username: string, challenge: QaTypingChallenge) => {`,
          `  const saveRepeatCount = async (username: string, challenge: QaTypingChallenge, documentId = "") => {`,
          "overview save signature"
        );

        next = replaceOrThrow(
          this,
          next,
          `      await updateQaTypingChallengeRepeatCount(username, challenge.id, nextCount);`,
          `      await updateQaTypingChallengeRepeatCount(username, challenge.id, nextCount, documentId);`,
          "overview save call"
        );

        next = replaceOrThrow(
          this,
          next,
          `                              onClick={() => void saveRepeatCount(row.username, challenge)}`,
          `                              onClick={() => void saveRepeatCount(row.username, challenge, row.documentId)}`,
          "overview save button"
        );

        overviewPatched = true;
        return { code: next, map: null };
      }

      if (cleanId.endsWith("/src/QaTypingChallengeAdmin.tsx")) {
        let next = code;

        next = replaceOrThrow(
          this,
          next,
          `      const detail = assignError instanceof Error ? assignError.message : "";\n      setError(detail.includes("queue limit") ? "Queue ของ Agent นี้เต็มแล้ว (สูงสุด 50 รายการ)" : "ส่ง QA Access Check ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");`,
          `      const detail = assignError instanceof Error ? assignError.message : String(assignError || "");\n      const normalizedDetail = detail.toLowerCase();\n      setError(\n        detail.includes("queue limit")\n          ? "Queue ของ Agent นี้เต็มแล้ว (สูงสุด 50 รายการ)"\n          : normalizedDetail.includes("permission-denied") || normalizedDetail.includes("insufficient permissions")\n            ? "ส่ง QA Access Check ไม่สำเร็จ เนื่องจากระบบจัดเก็บข้อมูลปฏิเสธสิทธิ์การบันทึก"\n            : normalizedDetail.includes("resource-exhausted") || normalizedDetail.includes("quota")\n              ? "ส่ง QA Access Check ไม่สำเร็จ เนื่องจากโควตาการจัดเก็บข้อมูลชั่วคราวเต็ม"\n              : "ส่ง QA Access Check ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"\n      );`,
          "admin write error mapping"
        );

        adminPatched = true;
        return { code: next, map: null };
      }

      return null;
    },

    buildEnd(error) {
      if (error) return;
      if (!storePatched) this.error("QA Access Check store write fix was not applied.");
      if (!overviewPatched) this.error("QA Access Check overview write fix was not applied.");
      if (!adminPatched) this.error("QA Access Check admin write fix was not applied.");
    },
  };
}
