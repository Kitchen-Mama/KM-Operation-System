// Firebase 共用配置
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-analytics.js";

const firebaseConfig = {
    apiKey: "AIzaSyD4_hDnbpKJOKQp1W3uNrhHfUgu2HQSQAk",
    authDomain: "vibe-coding-w1-b6d4f.firebaseapp.com",
    projectId: "vibe-coding-w1-b6d4f",
    storageBucket: "vibe-coding-w1-b6d4f.firebasestorage.app",
    messagingSenderId: "983349290518",
    appId: "1:983349290518:web:c54fc87b066a0fa8237737",
    measurementId: "G-EBMCC04F9L"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const analytics = getAnalytics(app);

// 暴露到全域
window.firebaseApp = app;
window.firestore = db;

export { app, db, analytics };