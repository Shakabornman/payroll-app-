"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { logAudit } from "@/lib/audit";

const AuthContext = createContext(undefined);

// Layer 2 access gate: only people holding this level may use the app.
// Source of truth is access_control/{uid}.accessLevels (plural array) in
// Firestore; it is mirrored into Supabase for row-level security.
const REQUIRED_ACCESS_LEVEL = "payroll_admin";

// Layer 1 access gate: is this signed-in person HAE staff at all?
// The `employees` collection is keyed by employeeNumber, not email/uid, so
// Firestore rules can't enforce this match themselves (they only require
// request.auth != null to read it) - the frontend is responsible for it.
async function findEmployeeByEmail(email) {
  const q = query(collection(db, "employees"), where("email", "==", email));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

// Fails closed: a missing document, a wrong field name or a read error all
// mean "no access levels", never "allowed".
async function readAccessLevels(uid) {
  try {
    const snapshot = await getDoc(doc(db, "access_control", uid));
    const levels = snapshot.exists() ? snapshot.data().accessLevels : null;
    return Array.isArray(levels) ? levels : [];
  } catch (err) {
    console.error("Failed to read access levels:", err.code, err.message);
    return [];
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [employee, setEmployee] = useState(null);
  const [accessLevels, setAccessLevels] = useState([]);
  const [accessChecked, setAccessChecked] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthResolved(true);

      if (!firebaseUser) {
        setEmployee(null);
        setAccessLevels([]);
        setAccessChecked(true);
        return;
      }

      setAccessChecked(false);
      const [match, levels] = await Promise.all([
        findEmployeeByEmail(firebaseUser.email),
        readAccessLevels(firebaseUser.uid),
      ]);
      setEmployee(match);
      setAccessLevels(levels);
      setAccessChecked(true);
    });
    return unsubscribe;
  }, []);

  const signIn = async (email, password) => {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    await logAudit({ action: "sign_in" });
    return credential;
  };
  const signOut = async () => {
    await logAudit({ action: "sign_out" });
    return firebaseSignOut(auth);
  };

  const loading = !authResolved || (Boolean(user) && !accessChecked);
  const hasStaffRecord = Boolean(user && employee);
  const hasPayrollAccess = accessLevels.includes(REQUIRED_ACCESS_LEVEL);
  const authorized = hasStaffRecord && hasPayrollAccess;

  return (
    <AuthContext.Provider
      value={{
        user,
        employee,
        authorized,
        hasStaffRecord,
        hasPayrollAccess,
        loading,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
