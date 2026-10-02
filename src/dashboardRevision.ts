import { collection, getCountFromServer, getDocs, limit, orderBy, query } from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";

const env = import.meta.env;
const evaluationCollection = String(env.VITE_FIREBASE_QA_EVALUATION_COLLECTION || env.VITE_QA_EVALUATION_TABLE || "qa_evaluations");

// A latest-change document plus a count detects creates, edits and deletions.
// Unchanged dashboards avoid downloading hundreds of results every five minutes.
export async function fetchDashboardRevision(): Promise<string | null> {
  if (!env.VITE_FIREBASE_API_KEY || !env.VITE_FIREBASE_PROJECT_ID || !env.VITE_FIREBASE_APP_ID) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const read = Promise.all([evaluationCollection, "qa_appeal_events"].map(async (name) => {
    const source = collection(firebaseDb, name);
    const [latest, count] = await Promise.all([
      getDocs(query(source, orderBy("updated_at", "desc"), limit(1))),
      getCountFromServer(source),
    ]);
    const item = latest.docs[0];
    return [name, item?.id || "", item?.data().updated_at || "", count.data().count];
  }));
  try {
    return JSON.stringify(await Promise.race([
      read,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Dashboard change check timed out")), 10_000); }),
    ]));
  } finally {
    clearTimeout(timer);
  }
}
