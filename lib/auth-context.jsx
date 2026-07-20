"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { collection, getDocs, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

const AuthContext = createContext(undefined);

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

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [employee, setEmployee] = useState(null);
  const [accessChecked, setAccessChecked] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthResolved(true);

      if (!firebaseUser) {
        setEmployee(null);
        setAccessChecked(true);
        return;
      }

      setAccessChecked(false);
      const match = await findEmployeeByEmail(firebaseUser.email);
      setEmployee(match);
      setAccessChecked(true);
    });
    return unsubscribe;
  }, []);

  const signIn = (email, password) => signInWithEmailAndPassword(auth, email, password);
  const signOut = () => firebaseSignOut(auth);

  const loading = !authResolved || (Boolean(user) && !accessChecked);
  const authorized = Boolean(user && employee);

  return (
    <AuthContext.Provider value={{ user, employee, authorized, loading, signIn, signOut }}>
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
