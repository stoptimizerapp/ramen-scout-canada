"use client";

import { useEffect } from "react";

const firebaseConfig = {
  apiKey: "AIzaSyDxlEOQn57R7aADGXjnpXs9EZuUtQexmLY",
  authDomain: "ramen-scout-canada.firebaseapp.com",
  projectId: "ramen-scout-canada",
  storageBucket: "ramen-scout-canada.firebasestorage.app",
  messagingSenderId: "976036867172",
  appId: "1:976036867172:web:23358c00eee65bd5f6c371",
  measurementId: "G-KKD42WHEGE",
} as const;

let analyticsInitialization: Promise<void> | undefined;

async function initializeFirebaseAnalytics() {
  const [{ getApps, initializeApp }, { getAnalytics, isSupported }] = await Promise.all([
    import("firebase/app"),
    import("firebase/analytics"),
  ]);

  if (!(await isSupported())) return;

  const app = getApps()[0] ?? initializeApp(firebaseConfig);
  getAnalytics(app);
}

export function FirebaseAnalytics() {
  useEffect(() => {
    analyticsInitialization ??= initializeFirebaseAnalytics().catch(() => {
      analyticsInitialization = undefined;
    });
  }, []);

  return null;
}
