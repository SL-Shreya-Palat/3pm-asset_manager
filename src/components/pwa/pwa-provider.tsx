'use client';

/**
 * PWA bootstrap — registers the service worker and shows a lightweight
 * install banner on mobile. Android/Chrome uses the native install prompt
 * (beforeinstallprompt); iOS Safari never fires it, so we show a
 * "Share → Add to Home Screen" hint instead. Rendered once in the root layout.
 */
import { useEffect, useState } from 'react';
import { X, Share } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-is-mobile';

const DISMISS_KEY = 'pwa-install-dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaProvider() {
  const isMobile = useIsMobile();
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);

  // Register the service worker (production only — caching breaks dev HMR).
  // In dev, unregister any SW left over from a local production test so it
  // can't serve stale build assets against the dev server.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    } else {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) return;
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true;
    if (isStandalone) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) setShowIosHint(true);

    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setInstallEvent(null);
    setShowIosHint(false);
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    dismiss();
  };

  if (!isMobile || (!installEvent && !showIosHint)) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 flex items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-lg">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
        3PM
      </div>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">Install 3PM Drive</p>
        {installEvent ? (
          <p className="text-xs text-muted-foreground">
            Add to your home screen for quick inspections.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Tap <Share className="inline h-3.5 w-3.5" /> then &ldquo;Add to Home
            Screen&rdquo;.
          </p>
        )}
      </div>
      {installEvent && (
        <Button size="sm" onClick={install}>
          Install
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={dismiss}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
