// lib/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";
import { getVertexAI }    from "firebase/vertexai-preview";  // ← preview

const firebaseConfig = {
  apiKey: "AIzaSyB6UXHfZdbn_jSJauHhbTwBvrFGsKnPeTw",
  authDomain: "gautami-55545.firebaseapp.com",
  databaseURL: "https://gautami-55545-default-rtdb.firebaseio.com",
  projectId: "gautami-55545",
  storageBucket: "gautami-55545.appspot.com",
  messagingSenderId: "328668763634",
  appId: "1:328668763634:web:5cd1be7de0e5e08aaa476b",
  measurementId: "G-FZ93TQS67R"
};

// Initialize Firebase

export const app = initializeApp(firebaseConfig);

export const auth     = getAuth(app);
export const provider = new GoogleAuthProvider();
export { signInWithPopup, signOut };

export const db        = getDatabase(app);
export const storage   = getStorage(app);
export const vertexAI  = getVertexAI(app);