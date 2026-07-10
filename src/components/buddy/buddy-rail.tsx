"use client";

import Image from "next/image";
import { useBuddyStore } from "@/store/buddy/store";
import { useIsMobile } from "@/hooks/use-is-mobile";

/**
 * Entry point to the Buddy assistant. Desktop gets an always-visible right
 * rail (mirrors the construction portal's RightSidebar); on phones/narrow
 * PWA windows that rail would permanently eat width from content, so it
 * collapses to a small floating button instead (removed from flex flow via
 * `fixed`, so it costs zero layout width).
 */
export function BuddyRail() {
  const open = useBuddyStore((s) => s.open);
  const setOpen = useBuddyStore((s) => s.setOpen);
  const isMobile = useIsMobile();

  if (isMobile) {
    if (open) return null;
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Open Buddy AI"
        aria-label="Open Buddy AI"
        className="fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-card shadow-lg ring-1 ring-border transition-transform hover:scale-105"
      >
        <Image
          src="/images/Buddy.png"
          alt="Buddy AI"
          width={32}
          height={32}
          className="h-8 w-8"
        />
      </button>
    );
  }

  return (
    <aside className="flex w-16 shrink-0 flex-col items-center border-l border-border bg-card py-4 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Open Buddy AI"
        aria-label="Open Buddy AI"
        className="group flex w-full items-center justify-center rounded-sm py-2 transition-colors hover:bg-primary/10"
      >
        <Image
          src="/images/Buddy.png"
          alt="Buddy AI"
          width={36}
          height={36}
          className="h-9 w-9 transition-transform duration-200 group-hover:scale-105"
        />
      </button>
    </aside>
  );
}
