'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import apiClient, { unwrapResponse } from '@/lib/api-client';
import type { BaseResponse } from '@/types/auth';
import { FileText, LayoutDashboard, Inbox } from 'lucide-react';
import { PermissionGuard } from '@/components/auth/permission-guard';

const FORM_BUILDER_URL =
  process.env.NEXT_PUBLIC_FORM_BUILDER_URL || 'http://localhost:3002';

const TABS = [
  { id: 'forms', label: 'Forms', icon: FileText },
  { id: 'form-builder', label: 'Builder', icon: LayoutDashboard },
  { id: 'submissions', label: 'Submissions', icon: Inbox },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function InspectionFormsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  // ─── Tab state ───────────────────────────────────────────────────────
  const getValidTab = (): TabId => {
    const tabFromUrl = searchParams.get('tab');
    if (tabFromUrl && TABS.some((t) => t.id === tabFromUrl)) {
      return tabFromUrl as TabId;
    }
    return 'forms';
  };

  const [activeTab, setActiveTab] = useState<TabId>(getValidTab);

  useEffect(() => {
    const valid = getValidTab();
    if (valid !== activeTab) setActiveTab(valid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`/inspections/forms?${params.toString()}`, { scroll: false });
  };

  // ─── Form-builder session state ──────────────────────────────────────
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const sessionFetchedRef = useRef(false);

  const fetchFormBuilderSession = useCallback(async () => {
    if (sessionFetchedRef.current) return;
    sessionFetchedRef.current = true;
    setSessionLoading(true);
    setSessionError(null);

    try {
      const response = await apiClient.post<
        BaseResponse<{ sessionId: string; expiresAt: string }>
      >('/api/embed/form-builder-session');
      const data = unwrapResponse(response.data);

      if (data?.sessionId) {
        setSessionId(data.sessionId);
      } else {
        setSessionError(
          'Form Builder session not returned. Please contact your administrator.',
        );
      }
    } catch (error: unknown) {
      console.error('Failed to fetch form-builder session:', error);
      const typed = error as {
        response?: { status?: number; data?: { error?: string } };
      };
      const status = typed?.response?.status;
      const serverMessage = typed?.response?.data?.error;

      if (status === 404) {
        setSessionError(
          serverMessage ||
            'Form Builder integration is not configured for your organization.',
        );
      } else if (status === 401) {
        setSessionError(
          serverMessage || 'You are not authorized to access the Form Builder.',
        );
      } else {
        setSessionError(
          serverMessage ||
            'Unable to connect to Form Builder. Please try again later.',
        );
      }
    } finally {
      setSessionLoading(false);
    }
  }, []);

  // Fetch session on mount
  useEffect(() => {
    if (user?.id && !sessionFetchedRef.current) {
      fetchFormBuilderSession();
    }
  }, [user?.id, fetchFormBuilderSession]);

  const retrySession = () => {
    sessionFetchedRef.current = false;
    setSessionId(null);
    setSessionError(null);
    fetchFormBuilderSession();
  };

  // ─── Iframe builder ─────────────────────────────────────────────────
  const buildEmbedIframe = (path: string, title: string) => {
    if (sessionLoading) {
      return (
        <div className="h-full flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">
              Preparing form-builder session...
            </p>
          </div>
        </div>
      );
    }

    if (sessionError) {
      return (
        <div className="h-full flex items-center justify-center">
          <div className="max-w-md text-center space-y-4">
            <div className="rounded-lg border bg-card p-6">
              <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <h3 className="font-semibold mb-1">Form Builder Unavailable</h3>
              <p className="text-sm text-muted-foreground">{sessionError}</p>
            </div>
            <button
              onClick={retrySession}
              className="text-sm text-primary hover:underline"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    if (!sessionId) {
      return (
        <div className="h-full flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">
              Waiting for authentication...
            </p>
          </div>
        </div>
      );
    }

    const params = new URLSearchParams();
    params.append('sessionId', sessionId);
    const iframeUrl = `${FORM_BUILDER_URL}/embed${path}?${params.toString()}`;

    return (
      <div className="h-full overflow-y-auto">
        <iframe
          src={iframeUrl}
          className="w-full h-full border-0"
          title={title}
          allow="clipboard-write"
          style={{ border: 'none' }}
        />
      </div>
    );
  };

  // ─── Loading state ───────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────
  return (
    <PermissionGuard permission="inspections:forms:view">
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <h1 className="text-2xl font-semibold text-foreground">Forms</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create and manage inspection form templates
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-border px-6">
        <div className="flex gap-0">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'forms' && (
          <div className="h-[calc(100vh-180px)] min-h-[500px]">
            {buildEmbedIframe('/forms', 'Forms')}
          </div>
        )}

        {activeTab === 'form-builder' && (
          <div className="h-[calc(100vh-180px)] min-h-[500px]">
            {buildEmbedIframe('/form-builder', 'Form Builder')}
          </div>
        )}

        {activeTab === 'submissions' && (
          <div className="h-[calc(100vh-180px)] min-h-[500px]">
            {buildEmbedIframe('/submissions', 'Submissions')}
          </div>
        )}
      </div>
    </div>
    </PermissionGuard>
  );
}
