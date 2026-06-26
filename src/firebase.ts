import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCarwGvDaZdSJDmekoMQgrJGlFczPTOSME",
  authDomain: "calenadr-6425a.firebaseapp.com",
  projectId: "calenadr-6425a",
  storageBucket: "calenadr-6425a.firebasestorage.app",
  messagingSenderId: "412991799299",
  appId: "1:412991799299:web:3aa6cd28c5e30b602b8e36",
  measurementId: "G-ESHEWW0Q42"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
