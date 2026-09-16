import { collection, doc, getDocsFromServer, runTransaction, serverTimestamp } from "firebase/firestore";
import { firebaseDb } from "../firebaseClient";
import { documentHash, KNOWLEDGE_BUILD, type KnowledgeUser } from "./model";
import { knowledgeManagerScope } from "./termsStore";
import { cleanGuideContent, MANUAL, type GuideChapter } from "./guideModel";

export const guideRepository = {
  async load() {
    const rows = await getDocsFromServer(collection(firebaseDb, "qa_user_guide_chapters"));
    const saved = new Map(rows.docs.map((item) => [item.id, item.data()]));
    const stale: string[] = [];
    const chapters = await Promise.all(MANUAL.chapters.map(async (base) => {
      const row = saved.get(base.id);
      if (!row) return base as GuideChapter;
      if (row.baseContentHash !== await documentHash(base)) { stale.push(base.id); return { ...base, revision: Number(row.revision || 0) } as GuideChapter; }
      const content = cleanGuideContent(base, row.content);
      return { ...content, updatedAt: row.publishedAtServer?.toDate?.().toISOString() || base.updatedAt, revision: Number(row.revision || 1), publishedBy: String(row.publishedBy || "") };
    }));
    return { chapters, stale };
  },
  async publish(user: KnowledgeUser, edited: GuideChapter, expectedRevision: number) {
    const { identity } = await knowledgeManagerScope(user, "guide");
    const base = MANUAL.chapters.find((chapter) => chapter.id === edited.id);
    if (!base) throw new Error("ไม่พบบทคู่มือในเวอร์ชันนี้");
    const content = cleanGuideContent(base, edited);
    const baseContentHash = await documentHash(base);
    const reference = doc(firebaseDb, "qa_user_guide_chapters", base.id);
    await runTransaction(firebaseDb, async (transaction) => {
      const previous = await transaction.get(reference);
      const existing = previous.data();
      const actualRevision = Number(existing?.revision || 0);
      if (actualRevision !== expectedRevision) throw new Error("มีผู้เผยแพร่บทนี้ระหว่างที่คุณแก้ไข กรุณารีเฟรชและตรวจฉบับล่าสุดก่อนเผยแพร่");
      const next = { chapterId: base.id, content, baseContentHash, revision: actualRevision + 1, publishedAtServer: serverTimestamp(),
        publishedBy: identity.displayName, publishedByUsername: identity.username, buildCommit: KNOWLEDGE_BUILD.commitHash || "" };
      transaction.set(doc(firebaseDb, "qa_user_guide_history", `${base.id}__${next.revision}`), next);
      transaction.set(reference, next);
    });
  },
};
export type GuideRepository = typeof guideRepository;
