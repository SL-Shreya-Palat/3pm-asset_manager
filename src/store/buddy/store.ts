"use client";

import { create } from "zustand";

/**
 * Open/close + full-page state for the Buddy AI panel, shared between the
 * header launcher and the panel itself. Chat/thread state lives in the panel
 * (via useChat) so it survives open/close without re-fetching.
 */
interface BuddyState {
  open: boolean;
  fullPage: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  setFullPage: (fullPage: boolean) => void;
}

export const useBuddyStore = create<BuddyState>((set) => ({
  open: false,
  fullPage: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
  setFullPage: (fullPage) => set({ fullPage }),
}));
