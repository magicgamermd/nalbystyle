import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBpr3e4YRWozkPE2Lk49NeoXm84FSrfEZA",
  authDomain: "blade-bourbon-studio.firebaseapp.com",
  projectId: "blade-bourbon-studio",
  storageBucket: "blade-bourbon-studio.firebasestorage.app",
  messagingSenderId: "627479765301",
  appId: "1:627479765301:web:5cc51b21f5da70ddba2c7c"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

export { db, auth, app, storage };
