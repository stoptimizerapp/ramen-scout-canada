"use client";

import { useEffect, useSyncExternalStore } from "react";

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
let collectionRequested = false;
let analyticsInstance: import('firebase/analytics').Analytics | undefined;
let visitChoice: string | undefined;
function readChoice() {
  if (visitChoice) return visitChoice;
  try { return localStorage.getItem('ramen-scout-analytics-choice') || 'unset'; } catch { return 'unset'; }
}
function subscribeChoice(notify: () => void) {
  window.addEventListener('ramen-analytics-choice', notify);
  return () => window.removeEventListener('ramen-analytics-choice', notify);
}

async function initializeFirebaseAnalytics() {
  const [{ getApps, initializeApp }, { getAnalytics, isSupported, setAnalyticsCollectionEnabled }] = await Promise.all([
    import("firebase/app"),
    import("firebase/analytics"),
  ]);

  if (!(await isSupported()) || !collectionRequested) return;

  const app = getApps()[0] ?? initializeApp(firebaseConfig);
  analyticsInstance = getAnalytics(app);
  setAnalyticsCollectionEnabled(analyticsInstance, collectionRequested);
}

export function FirebaseAnalytics() {
  const choice = useSyncExternalStore(subscribeChoice, readChoice, () => 'unset');
  useEffect(() => {
    if (choice !== 'allowed') return;
    collectionRequested = true;
    analyticsInitialization ??= initializeFirebaseAnalytics().catch(() => { analyticsInitialization = undefined; });
  }, [choice]);
  async function choose(value: string) {
    collectionRequested = value === 'allowed';
    try { localStorage.setItem('ramen-scout-analytics-choice', value); } catch { /* A choice still applies to this visit. */ }
    visitChoice = value;
    window.dispatchEvent(new Event('ramen-analytics-choice'));
    if (value === 'declined' && analyticsInitialization) {
      await analyticsInitialization;
      const { setAnalyticsCollectionEnabled } = await import('firebase/analytics');
      if (analyticsInstance) setAnalyticsCollectionEnabled(analyticsInstance, false);
      for (const cookie of document.cookie.split(';')) {
        const name = cookie.split('=')[0].trim();
        if (!/^_ga(?:_|$)/.test(name)) continue;
        for (const domain of ['', `; domain=${location.hostname}`, `; domain=.${location.hostname}`]) {
          document.cookie = `${name}=; Max-Age=0; path=/${domain}; SameSite=Lax`;
        }
      }
      analyticsInitialization = undefined;
    }
    if (value === 'allowed' && analyticsInitialization) {
      await analyticsInitialization;
      const { setAnalyticsCollectionEnabled } = await import('firebase/analytics');
      if (analyticsInstance) setAnalyticsCollectionEnabled(analyticsInstance, collectionRequested);
    }
  }
  return <section className="page-shell analytics-privacy" id="analytics-privacy" aria-label="Analytics privacy settings"><details><summary>Analytics privacy settings</summary><p>Optional Google Analytics is off until you allow it. Your choice does not affect search or location features. We save only this preference in your browser.</p><div className="record-links"><button className="button" onClick={() => void choose('allowed').catch(() => {})}>Allow analytics</button><button className="button" onClick={() => void choose('declined').catch(() => {})}>Decline or withdraw</button><a href="/privacy">Privacy policy</a></div><p role="status">{choice === 'allowed' ? 'Optional analytics allowed.' : 'Optional analytics off.'}</p></details></section>;
}
