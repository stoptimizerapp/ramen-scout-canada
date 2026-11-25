export const MEASUREMENT_ID = 'G-KKD42WHEGE';

type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};

export function createBrowserAnalytics() {
  let pending: Promise<void> | undefined;
  let configured = false;
  return {
    start(): Promise<void> {
      if (!['ramenscout.ca', 'www.ramenscout.ca'].includes(location.hostname)) return Promise.resolve();
      if (pending) return pending;
      const browser = window as AnalyticsWindow;
      if (!configured) {
        browser.dataLayer ??= [];
        // Preserve the documented gtag queue format.
        // eslint-disable-next-line prefer-rest-params
        browser.gtag ??= function () { browser.dataLayer!.push(arguments); };
        browser.gtag('js', new Date());
        // The standard config sends the initial page_view; do not also send it manually.
        browser.gtag('config', MEASUREMENT_ID, { allow_google_signals: false, allow_ad_personalization_signals: false });
        configured = true;
      }
      pending = new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.id = 'ramen-scout-google-analytics';
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
        const timer = window.setTimeout(() => finish(false), 15000);
        function finish(success: boolean) {
          window.clearTimeout(timer);
          script.onload = script.onerror = null;
          if (success) resolve();
          else { script.remove(); reject(new Error('Google Analytics tag did not load')); }
        }
        script.onload = () => finish(true);
        script.onerror = () => finish(false);
        document.head.appendChild(script);
      }).catch(error => {
        pending = undefined;
        throw error;
      });
      return pending;
    },
  };
}
