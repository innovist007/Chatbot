import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey:            "AIzaSyCEBD6jaX1rDBBn_YRa3dgrNrEzLOCo9hk",
  authDomain:        "dashboard-analytics-495006.firebaseapp.com",
  projectId:         "dashboard-analytics-495006",
  storageBucket:     "dashboard-analytics-495006.firebasestorage.app",
  messagingSenderId: "894092456703",
  appId:             "1:894092456703:web:248d05b12e0562a54112ca",
  measurementId:     "G-8BVRYT935D",
};

const app = initializeApp(firebaseConfig);
export const db       = getFirestore(app, "default");
export const analytics = getAnalytics(app);
