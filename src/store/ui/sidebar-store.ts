/**
 * Zustand UI store — mobile sidebar drawer open/close state.
 *
 * On phones the sidebar is a hidden off-canvas drawer: the header's hamburger
 * toggles `mobileOpen`, and the sidebar renders as a fixed slide-in overlay.
 * Shared here so the Header (trigger) and Sidebar (drawer) stay in sync without
 * threading props through the server-rendered portal layout.
 */
'use client';

import { create } from 'zustand';

interface SidebarUiState {
  /** True when the mobile drawer is open. Ignored on desktop. */
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  toggleMobile: () => void;
}

export const useSidebarStore = create<SidebarUiState>((set) => ({
  mobileOpen: false,
  setMobileOpen: (open) => set({ mobileOpen: open }),
  toggleMobile: () => set((s) => ({ mobileOpen: !s.mobileOpen })),
}));
