import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, setDoc, serverTimestamp } from "firebase/firestore";

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

const rolesToGenerate = new Set(["Admin Live Chat", "Senior", "Supervisor"]);

function generateTemporaryPassword() {
  const letters = Math.random().toString(36).replace(/[^a-z0-9]/g, "").slice(2, 8);
  const number = Math.floor(100 + Math.random() * 900);
  return `Qa#${number}${letters}A`;
}

const issuedAt = new Date();
const expiresAt = new Date(issuedAt);
expiresAt.setDate(expiresAt.getDate() + 15);

const snapshot = await getDocs(collection(db, "qa_user_profiles"));
const exported = [];

for (const item of snapshot.docs) {
  const data = item.data();
  const role = String(data.role || "");
  const status = String(data.status || "Active");
  const username = String(data.username || item.id);

  if (!rolesToGenerate.has(role)) continue;
  if (status !== "Active") continue;

  const password = generateTemporaryPassword();

  await setDoc(doc(db, "qa_user_profiles", item.id), {
    password,
    passwordKind: "temporary",
    passwordIssuedAt: issuedAt.toISOString(),
    passwordExpiresAt: expiresAt.toISOString(),
    updatedAt: issuedAt.toISOString(),
    updatedAtServer: serverTimestamp()
  }, { merge: true });

  exported.push({
    username,
    displayName: String(data.displayName || data.agentName || username),
    agentName: String(data.agentName || ""),
    email: String(data.email || ""),
    teamName: String(data.teamName || ""),
    role,
    status,
    password,
    passwordExpiresAt: expiresAt.toISOString()
  });
}

console.table(exported.map((item) => ({
  Username: item.username,
  Name: item.displayName,
  Role: item.role,
  Password: item.password,
  Expires: item.passwordExpiresAt.slice(0, 10)
})));

console.log(`Done. Generated ${exported.length} temporary passwords.`);
