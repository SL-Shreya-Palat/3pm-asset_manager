'use client';

/**
 * Driver-inspection hard gate.
 *
 * When the current user is a driver who owes an inspection this period (per the
 * tenant's Driver Inspection policy), this renders a full-screen blocking
 * overlay with the assigned form embedded — the driver can't use the rest of the
 * app until they submit it. Mounted once in PortalGuard.
 *
 * Non-drivers, admins, and drivers who are up to date see nothing (the component
 * renders null). Fail-open: any error → no gate, so a glitch never locks a
 * driver out.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { ShieldAlert, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

const FORM_BUILDER_URL =
  process.env.NEXT_PUBLIC_FORM_BUILDER_URL || 'http://localhost:3002';

interface DueInfo {
  due: boolean;
  status: string;
  formId: string | null;
  formTitle: string | null;
  driverId: string | null;
}

export function DriverInspectionGate() {
  const { user, initialized } = useAuth();
  // Never gate admins — they manage the policy and must not be locked out.
  const isGatedDriver =
    initialized && !!user?.tenant?.isDriver && !user?.tenant?.isAdmin;

  const [due, setDue] = useState<DueInfo | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [rechecking, setRechecking] = useState(false);
  const [notYet, setNotYet] = useState(false);
  const launchKeyRef = useRef<string | null>(null);
  const openingRef = useRef(false);

  /** Ask the server whether an inspection is owed. Returns the due flag. */
  const check = useCallback(
    async (withSync: boolean): Promise<boolean> => {
      try {
        const res = await axios.get(
          `/api/inspections/my-due${withSync ? '?sync=1' : ''}`,
          { withCredentials: true },
        );
        const info = res.data?.data as DueInfo | undefined;
        if (info?.due && info.formId && info.driverId) {
          setDue(info);
          return true;
        }
        setDue(null);
        return false;
      } catch {
        setDue(null); // fail open
        return false;
      }
    },
    [],
  );

  // Initial check once auth is ready and the user is a gated driver.
  // Deferred so setState isn't called synchronously inside the effect body.
  useEffect(() => {
    const t = setTimeout(() => {
      if (!isGatedDriver) {
        setDue(null);
        return;
      }
      check(false);
    }, 0);
    return () => clearTimeout(t);
  }, [isGatedDriver, check]);

  // Record a launch + mint a form-builder session, so the submission that
  // comes back is correlated to this driver. Any failure is surfaced in the
  // overlay with a Retry button — never a silent infinite spinner.
  const openInspection = useCallback(async (info: DueInfo) => {
    if (!info.formId || !info.driverId || openingRef.current) return;
    openingRef.current = true;
    setLaunchError(null);
    try {
      await axios.post(
        '/api/inspections/launch',
        { formId: info.formId, driverId: info.driverId },
        { withCredentials: true },
      );
      const res = await axios.post(
        '/api/embed/form-builder-session',
        {},
        { withCredentials: true },
      );
      const sid = res.data?.data?.sessionId;
      if (sid) {
        setSessionId(sid);
      } else {
        setLaunchError('The inspection form could not be opened.');
      }
    } catch (err) {
      const serverMsg = axios.isAxiosError(err)
        ? (err.response?.data as { error?: unknown } | undefined)?.error
        : null;
      setLaunchError(
        typeof serverMsg === 'string' && serverMsg
          ? serverMsg
          : 'The inspection form could not be opened.',
      );
    } finally {
      openingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!due?.formId || !due.driverId) return;
    if (launchKeyRef.current === due.formId) return;
    launchKeyRef.current = due.formId;
    openInspection(due);
  }, [due, openInspection]);

  // While the gate is open, poll (cheap, no sync) so a webhook-processed
  // submission clears it automatically.
  useEffect(() => {
    if (!due) return;
    const id = setInterval(() => {
      check(false);
    }, 8000);
    return () => clearInterval(id);
  }, [due, check]);

  if (!isGatedDriver || !due?.formId) return null;

  const handleRecheck = async () => {
    setRechecking(true);
    setNotYet(false);
    // sync=1 pulls the just-submitted form even when no webhook worker is running.
    const stillDue = await check(true);
    if (stillDue) setNotYet(true);
    setRechecking(false);
  };

  return (
    <div className="fixed inset-0 z-200 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-3 sm:px-6">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          <ShieldAlert className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold text-foreground sm:text-lg">
            {due.status === 'overdue' ? 'Inspection overdue' : 'Inspection required'}
          </h1>
          <p className="truncate text-sm text-muted-foreground">
            Complete “{due.formTitle || 'your inspection'}” to continue.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRecheck} disabled={rechecking}>
          {rechecking ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
          <span className="hidden sm:inline">I&apos;ve completed it</span>
        </Button>
      </div>

      {notYet && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200 sm:px-6">
          We haven&apos;t received your submission yet. If you just submitted, give it a moment and
          tap “I&apos;ve completed it” again.
        </div>
      )}

      {/* Embedded form */}
      {sessionId ? (
        <iframe
          src={`${FORM_BUILDER_URL}/embed/forms/${due.formId}?sessionId=${sessionId}`}
          className="w-full flex-1 min-h-0 border-0"
          title="Driver inspection"
          allow="clipboard-write; camera"
        />
      ) : launchError ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="flex max-w-md flex-col items-center gap-4 text-center">
            <ShieldAlert className="h-8 w-8 text-destructive" />
            <div>
              <p className="text-sm font-medium text-foreground">
                We couldn&apos;t open your inspection
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{launchError}</p>
            </div>
            <Button onClick={() => due && openInspection(due)}>
              <RefreshCw className="h-4 w-4" />
              Try again
            </Button>
            <p className="text-xs text-muted-foreground">
              If this keeps happening, contact your administrator.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Spinner />
            <p className="text-sm text-muted-foreground">Opening your inspection…</p>
          </div>
        </div>
      )}
    </div>
  );
}
