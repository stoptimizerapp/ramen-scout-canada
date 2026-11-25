"use client";

import { useEffect } from 'react';
import { createBrowserAnalytics } from '@/lib/browser-analytics';

const analytics = createBrowserAnalytics();

export function GoogleAnalytics() {
  useEffect(() => {
    const start = () => { void analytics.start().catch(() => console.warn('Google Analytics tag could not load.')); };
    start();
    window.addEventListener('online', start);
    return () => window.removeEventListener('online', start);
  }, []);
  return null;
}
