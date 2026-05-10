'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';

type GlobalGoogleTagProps = {
  googleTagId: string;
};

export function GlobalGoogleTag({ googleTagId }: GlobalGoogleTagProps) {
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    let cancelled = false;
    let timeoutId: number | undefined;
    let idleId: number | undefined;

    const enableLoad = () => {
      if (!cancelled) {
        setShouldLoad(true);
      }
    };

    const scheduleLoad = () => {
      if (typeof idleWindow.requestIdleCallback === 'function') {
        idleId = idleWindow.requestIdleCallback(
          () => {
            timeoutId = window.setTimeout(enableLoad, 1500);
          },
          { timeout: 4000 },
        );
        return;
      }

      timeoutId = window.setTimeout(enableLoad, 4000);
    };

    if (document.readyState === 'complete') {
      scheduleLoad();
    } else {
      window.addEventListener('load', scheduleLoad, { once: true });
    }

    return () => {
      cancelled = true;
      if (typeof timeoutId === 'number') {
        window.clearTimeout(timeoutId);
      }
      if (typeof idleId === 'number' && typeof idleWindow.cancelIdleCallback === 'function') {
        idleWindow.cancelIdleCallback(idleId);
      }
      window.removeEventListener('load', scheduleLoad);
    };
  }, []);

  if (!shouldLoad) {
    return null;
  }

  return (
    <>
      <Script async src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(googleTagId)}`} strategy="afterInteractive" />
      <Script
        id="nhadatdn-google-tag"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('set', 'allow_ad_personalization_signals', false);
gtag('config', ${JSON.stringify(googleTagId)}, {
  allow_ad_personalization_signals: false,
  allow_google_signals: false
});`,
        }}
      />
    </>
  );
}
