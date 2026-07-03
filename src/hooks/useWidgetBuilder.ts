/**
 * Widget Builder embed hook — loads the Widget Builder SDK, creates a
 * session via our backend broker, and renders the embedded dashboard
 * iframe. Mirrors construction-portal's hooks/useWidgetBuilder.ts.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import apiClient, { unwrapResponse } from '@/lib/api-client';
import type { BaseResponse } from '@/types/auth';
import { useAuth } from '@/hooks/useAuth';

declare global {
  interface Window {
    WidgetBuilder?: {
      init: (config: {
        sessionId: string;
        container: string | HTMLElement;
        baseUrl?: string;
        width?: string;
        height?: string;
        dashboardId?: string;
        theme?: string;
      }) => HTMLIFrameElement | undefined;
      openModal: (config: {
        sessionId: string;
        baseUrl?: string;
        dashboardId?: string;
        path?: string;
        theme?: string;
        onSave?: (widget: Record<string, unknown>) => void;
        onClose?: () => void;
      }) => unknown;
    };
  }
}

const WIDGET_BUILDER_URL =
  process.env.NEXT_PUBLIC_WIDGET_BUILDER_URL || 'http://localhost:3003';

interface UseWidgetBuilderOptions {
  /** Logical id used to scope widgets to this dashboard. */
  dashboardId: string;
  /** Set to false to defer iframe mounting (e.g., on an inactive tab). Defaults to true. */
  enabled?: boolean;
}

interface UseWidgetBuilderResult {
  /** Attach to the div that should host the embedded widget builder iframe. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** True once SDK is loaded and a session is established. */
  ready: boolean;
  /** SDK script failed to load (widget-builder service likely not running). */
  sdkError: boolean;
  /** Session creation failed — message is suitable for display. */
  sessionError: string | null;
  /** Open the "+ Add Widget" template-selector modal. */
  openAddModal: () => void;
}

/**
 * Loads the Widget Builder SDK, creates a session, and renders the embedded
 * dashboard iframe in `containerRef`. Reusable across modules — pass a unique
 * `dashboardId` to scope which widgets belong to which dashboard.
 *
 * @example
 *   const wb = useWidgetBuilder({ dashboardId: 'asset-manager-home' });
 *   <Button onClick={wb.openAddModal} disabled={!wb.ready}>+ Add Widget</Button>
 *   <div ref={wb.containerRef} className="h-[600px]" />
 */
export function useWidgetBuilder({
  dashboardId,
  enabled = true,
}: UseWidgetBuilderOptions): UseWidgetBuilderResult {
  const { user, loading: authLoading } = useAuth();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sdkLoaded, setSdkLoaded] = useState(
    () => typeof window !== 'undefined' && !!window.WidgetBuilder,
  );
  const [sdkError, setSdkError] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const initedRef = useRef(false);
  const fetchedRef = useRef(false);

  // Load the Widget Builder SDK script (once per page).
  useEffect(() => {
    if (typeof window === 'undefined' || sdkLoaded) return;

    const existing = document.querySelector(
      `script[src="${WIDGET_BUILDER_URL}/embed/sdk.js"]`,
    );
    if (existing) {
      const check = () => {
        if (window.WidgetBuilder) setSdkLoaded(true);
        else setTimeout(check, 100);
      };
      check();
      return;
    }

    const script = document.createElement('script');
    script.src = `${WIDGET_BUILDER_URL}/embed/sdk.js`;
    script.async = true;
    script.onload = () => setSdkLoaded(true);
    script.onerror = () => setSdkError(true);
    document.head.appendChild(script);
  }, [sdkLoaded]);

  // Create the embed session — only after auth resolves and a user is signed in.
  useEffect(() => {
    if (authLoading || !user || fetchedRef.current) return;
    fetchedRef.current = true;

    apiClient
      .post<BaseResponse<{ sessionId: string; expiresAt: string }>>(
        '/api/embed/widget-builder-session',
      )
      .then((response) => {
        const data = unwrapResponse<{ sessionId: string; expiresAt: string }>(
          response.data,
        );
        if (data?.sessionId) {
          setSessionId(data.sessionId);
        } else {
          setSessionError('Failed to create Widget Builder session');
        }
      })
      .catch((err: unknown) => {
        console.error('Failed to create widget builder session:', err);
        const axiosErr = err as {
          response?: { status?: number; data?: { error?: string } };
        };
        const status = axiosErr?.response?.status;
        if (status === 401) {
          setSessionError('You are not authorized to use the Widget Builder.');
        } else {
          setSessionError(
            axiosErr?.response?.data?.error ||
              'Widget Builder is not available. Please try again later.',
          );
        }
      });
  }, [authLoading, user]);

  // Mount the embedded dashboard iframe once everything is ready.
  useEffect(() => {
    if (
      !enabled ||
      !sessionId ||
      !sdkLoaded ||
      !window.WidgetBuilder ||
      !containerRef.current ||
      initedRef.current
    ) {
      return;
    }

    initedRef.current = true;
    window.WidgetBuilder.init({
      sessionId,
      container: containerRef.current,
      baseUrl: WIDGET_BUILDER_URL,
      dashboardId,
      height: '100%',
      width: '100%',
    });
  }, [enabled, sessionId, sdkLoaded, dashboardId]);

  const openAddModal = useCallback(() => {
    if (!sessionId || !sdkLoaded || !window.WidgetBuilder) return;
    window.WidgetBuilder.openModal({
      sessionId,
      baseUrl: WIDGET_BUILDER_URL,
      dashboardId,
      path: '/embed/add',
    });
  }, [sessionId, sdkLoaded, dashboardId]);

  return {
    containerRef,
    ready: !!sessionId && sdkLoaded && !sdkError && !sessionError,
    sdkError,
    sessionError,
    openAddModal,
  };
}
