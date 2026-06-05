import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBn03smavKzc0l761okJQqCSyT0Wq022DQ",
  authDomain: "qa-dashboard-b0b5d.firebaseapp.com",
  projectId: "qa-dashboard-b0b5d",
  storageBucket: "qa-dashboard-b0b5d.firebasestorage.app",
  messagingSenderId: "441715183213",
  appId: "1:441715183213:web:4e00da66b84546ff03964"
};

export const firebaseApp = initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const firebaseDb = getFirestore(firebaseApp);

