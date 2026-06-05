import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, serverTimestamp } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBn03smavKzc0l761okJQqCSyT0Wq022DQ",
  authDomain: "qa-dashboard-b0b5d.firebaseapp.com",
  projectId: "qa-dashboard-b0b5d",
  storageBucket: "qa-dashboard-b0b5d.firebasestorage.app",
  messagingSenderId: "441715183213",
  appId: "1:441715183213:web:4e00da66b84546ff03964"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const issuedAt = new Date();
const expiresAt = new Date(issuedAt);
expiresAt.setDate(expiresAt.getDate() + 15);

await setDoc(doc(db, "qa_user_profiles", "Chatkonnaphat"), {
  password: "Qa#307ulh020A",
  passwordKind: "temporary",
  passwordIssuedAt: issuedAt.toISOString(),
  passwordExpiresAt: expiresAt.toISOString(),
  updatedAt: issuedAt.toISOString(),
  updatedAtServer: serverTimestamp()
}, { merge: true });

console.log("Done. Chatkonnaphat test password saved.");
