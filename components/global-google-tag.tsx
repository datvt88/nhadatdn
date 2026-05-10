'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Script from 'next/script';

type GlobalGoogleTagProps = {
  googleTagId: string;
};

const DEFAULT_LOAD_DELAY_MS = 1500;
const CATEGORY_LOAD_DELAY_MS = 12000;
const IDLE_TIMEOUT_MS = 4000;

function getLoadDelay(pathname: string | null): number {
  const normalizedPath = pathname || '/';
  if (normalizedPath === '/mua-ban-nha-dat' || normalizedPath === '/cho-thue-nha-dat') {
    return CATEGORY_LOAD_DELAY_MS;
  }
  return DEFAULT_LOAD_DELAY_MS;
}

export function GlobalGoogleTag({ googleTagId }: GlobalGoogleTagProps) {
  const [shouldLoad, setShouldLoad] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const loadDelayMs = getLoadDelay(pathname);
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
            timeoutId = window.setTimeout(enableLoad, loadDelayMs);
          },
          { timeout: IDLE_TIMEOUT_MS },
        );
        return;
      }

      timeoutId = window.setTimeout(enableLoad, IDLE_TIMEOUT_MS + loadDelayMs);
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
  }, [pathname]);

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
