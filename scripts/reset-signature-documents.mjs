import fs from "node:fs";
import path from "node:path";
import { initializeApp, getApps } from "firebase/app";
import { collection, deleteField, doc, getDocs, getFirestore, serverTimestamp, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyBn03smavKzc0l761okJQqCSyT0Wq022DQ",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "qa-dashboard-b0b5d.firebaseapp.com",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "qa-dashboard-b0b5d",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "qa-dashboard-b0b5d.firebasestorage.app",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "441715183213",
  appId: process.env.VITE_FIREBASE_APP_ID || "1:441715183213:web:4e00da66b84546ff03964",
};

const COLLECTION_NAME = "qa_signature_documents";
const DRY_RUN = process.argv.includes("--dry-run");

function safeDocId(value) {
  return String(value || "").trim().replace(/\//g, "__").replace(/\s+/g, " ") || "unknown";
}

function backupPath() {
  const dir = path.resolve("recovery");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(dir, `qa-signature-documents-backup-${stamp}.json`);
}

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
const snapshot = await getDocs(collection(db, COLLECTION_NAME));
const docs = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
const outPath = backupPath();
fs.writeFileSync(outPath, JSON.stringify(docs, null, 2), "utf8");

console.log(`Signature documents found: ${docs.length}`);
console.log(`Backup written: ${outPath}`);

if (DRY_RUN) {
  for (const item of docs) {
    const entries = Array.isArray(item.entries) ? item.entries.length : 0;
    console.log(`${item.id} | docId=${item.docId || item.id} | entries=${entries} | confirmedAt=${item.confirmedAt || ""}`);
  }
  process.exit(0);
}

let reset = 0;
for (const item of docs) {
  const docId = String(item.docId || item.id || "");
  await setDoc(
    doc(db, COLLECTION_NAME, safeDocId(docId)),
    {
      docId,
      entries: [],
      confirmedAt: deleteField(),
      resetAt: new Date().toISOString(),
      resetAtServer: serverTimestamp(),
      updatedAt: new Date().toISOString(),
      updatedAtServer: serverTimestamp(),
    },
    { merge: true }
  );
  reset += 1;
}

console.log(`Signature documents reset: ${reset}`);
