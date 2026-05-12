'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Script from 'next/script';

type GlobalGoogleTagProps = {
  googleTagId: string;
};

const DEFAULT_LOAD_DELAY_MS = 1500;
const CATEGORY_LOAD_DELAY_MS = 12000;
const DETAIL_FALLBACK_DELAY_MS = 30000;
const IDLE_TIMEOUT_MS = 4000;

type LoadStrategy =
  | { mode: 'delay'; delayMs: number }
  | { mode: 'interaction'; fallbackDelayMs: number };

function isListingDetailPath(pathname: string): boolean {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length < 3) return false;
  const [category] = parts;
  return category === 'mua-ban-nha-dat' || category === 'cho-thue-nha-dat';
}

function getLoadStrategy(pathname: string | null): LoadStrategy {
  const normalizedPath = pathname || '/';
  if (isListingDetailPath(normalizedPath)) {
    return { mode: 'interaction', fallbackDelayMs: DETAIL_FALLBACK_DELAY_MS };
  }
  if (normalizedPath === '/mua-ban-nha-dat' || normalizedPath === '/cho-thue-nha-dat') {
    return { mode: 'delay', delayMs: CATEGORY_LOAD_DELAY_MS };
  }
  return { mode: 'delay', delayMs: DEFAULT_LOAD_DELAY_MS };
}

export function GlobalGoogleTag({ googleTagId }: GlobalGoogleTagProps) {
  const [shouldLoad, setShouldLoad] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const loadStrategy = getLoadStrategy(pathname);
    let cancelled = false;
    let timeoutId: number | undefined;
    let idleId: number | undefined;
    const cleanups: Array<() => void> = [];

    const enableLoad = () => {
      if (!cancelled) {
        setShouldLoad(true);
      }
    };

    const registerInteractionListeners = () => {
      const pointerEvents: Array<keyof WindowEventMap> = ['pointerdown', 'touchstart', 'scroll'];
      const keyboardEvents: Array<keyof WindowEventMap> = ['keydown'];
      const onInteraction = () => enableLoad();

      pointerEvents.forEach((eventName) => {
        window.addEventListener(eventName, onInteraction, { once: true, passive: true });
        cleanups.push(() => window.removeEventListener(eventName, onInteraction));
      });
      keyboardEvents.forEach((eventName) => {
        window.addEventListener(eventName, onInteraction, { once: true });
        cleanups.push(() => window.removeEventListener(eventName, onInteraction));
      });
    };

    const scheduleLoad = () => {
      if (typeof idleWindow.requestIdleCallback === 'function') {
        idleId = idleWindow.requestIdleCallback(
          () => {
            if (loadStrategy.mode === 'interaction') {
              registerInteractionListeners();
              timeoutId = window.setTimeout(enableLoad, loadStrategy.fallbackDelayMs);
              return;
            }
            timeoutId = window.setTimeout(enableLoad, loadStrategy.delayMs);
          },
          { timeout: IDLE_TIMEOUT_MS },
        );
        return;
      }

      if (loadStrategy.mode === 'interaction') {
        registerInteractionListeners();
        timeoutId = window.setTimeout(enableLoad, IDLE_TIMEOUT_MS + loadStrategy.fallbackDelayMs);
        return;
      }
      timeoutId = window.setTimeout(enableLoad, IDLE_TIMEOUT_MS + loadStrategy.delayMs);
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
      cleanups.forEach((cleanup) => cleanup());
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
