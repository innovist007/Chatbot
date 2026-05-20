import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

const COLLECTION = "user_permissions";

// All pages available in the dashboard
export const ALL_PAGES = [
  { route: "/d2c-overview", label: "Overview",           tab: "D2C" },
  { route: "/web-cr",       label: "Web CR",             tab: "D2C" },
  { route: "/app-cr",       label: "App CR",             tab: "D2C" },
  { route: "/rto",          label: "D2C RTO",            tab: "D2C" },
  { route: "/repeat",       label: "Repeat & retention", tab: "D2C" },
  { route: "/promo",        label: "Promo & basket",     tab: "D2C" },
  { route: "/supply",       label: "Supply chain",       tab: "D2C" },
  { route: "/acquisition",  label: "Acquisition",        tab: "D2C" },
];

// Encode email as safe Firestore doc ID
function emailToDocId(email) {
  return email.toLowerCase().replace(/\./g, "_dot_").replace(/@/g, "_at_");
}

// Register user on first login — creates doc if missing
export async function registerUser(email, name) {
  const id = emailToDocId(email);
  const ref = doc(db, COLLECTION, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      email,
      name: name || email,
      permitted_routes: [],
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });
  }
}

// Fetch permitted routes for a user (["/web-cr", "/supply", ...])
export async function getUserPermissions(email) {
  const id = emailToDocId(email);
  const snap = await getDoc(doc(db, COLLECTION, id));
  if (!snap.exists()) return [];
  return snap.data().permitted_routes || [];
}

// Update permitted routes for a user (admin only)
export async function setUserPermissions(email, permittedRoutes) {
  const id = emailToDocId(email);
  await updateDoc(doc(db, COLLECTION, id), {
    permitted_routes: permittedRoutes,
    updated_at: serverTimestamp(),
  });
}

// Fetch all users (for admin UI)
export async function getAllUsers() {
  const snap = await getDocs(collection(db, COLLECTION));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
