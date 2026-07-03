"use client";

import Image from "next/image";
import { useBuddyStore } from "@/store/buddy/store";

/**
 * Always-visible right rail with the Buddy avatar — the entry point to the
 * assistant, mirroring the construction portal's RightSidebar.
 */
export function BuddyRail() {
  const setOpen = useBuddyStore((s) => s.setOpen);
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
