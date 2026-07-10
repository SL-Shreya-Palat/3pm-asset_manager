'use client';

/**
 * Inspection fill page — opens the chosen form in the embedded form-builder.
 * Supports both asset-first and driver-first flows:
 *   /inspections/fill?assetId=X&formId=Y   (asset inspection)
 *   /inspections/fill?driverId=X&formId=Y  (driver wellness check)
 *
 * Before opening, it records an inspection "launch" so the submission that
 * comes back via the webhook is linked to the correct entity.
 */
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import axios from 'axios';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

const FORM_BUILDER_URL =
  process.env.NEXT_PUBLIC_FORM_BUILDER_URL || 'http://localhost:3002';

function FillInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const assetId = sp.get('assetId') || '';
  const driverId = sp.get('driverId') || '';
  const formId = sp.get('formId') || '';
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const entityId = assetId || driverId;

  useEffect(() => {
    if (!entityId || !formId || startedRef.current) return;
    startedRef.current = true;
    let active = true;
    (async () => {
      try {
        // 1) Record the launch (correlates the submission → asset or driver).
        const launchBody: Record<string, string> = { formId };
        if (assetId) launchBody.assetId = assetId;
        if (driverId) launchBody.driverId = driverId;
        await axios.post('/api/inspections/launch', launchBody, { withCredentials: true });
        // 2) Mint a form-builder session bound to this tenant's org.
        const res = await axios.post('/api/embed/form-builder-session', {}, { withCredentials: true });
        const sid = res.data?.data?.sessionId;
        if (!sid) throw new Error('No form-builder session');
        if (active) setSessionId(sid);
      } catch (e: unknown) {
        const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
        if (active) setError(msg || 'Unable to open the inspection form.');
      }
    })();
    return () => { active = false; };
  }, [entityId, formId, assetId, driverId]);

  if (!entityId || !formId) {
    return <div className="p-6 text-muted-foreground">Missing asset/driver or form.</div>;
  }

  const backPath = driverId ? '/people/drivers' : `/assets/${assetId}`;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 md:px-6 md:pt-6 pb-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(backPath)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold">
          {driverId ? 'Driver Wellness Check' : 'Inspection'}
        </h1>
      </div>

      {error ? (
        <div className="p-6 text-sm text-red-500">{error}</div>
      ) : !sessionId ? (
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Opening form…</p>
          </div>
        </div>
      ) : (
        <iframe
          src={`${FORM_BUILDER_URL}/embed/forms/${formId}?sessionId=${sessionId}`}
          className="w-full flex-1 min-h-0 border-0"
          title="Inspection form"
          allow="clipboard-write; camera"
        />
      )}
    </div>
  );
}

export default function InspectionFillPage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Loading…</div>}>
      <FillInner />
    </Suspense>
  );
}
