'use client';

/**
 * DEV-ONLY header button — manually runs the notification scan (service
 * due/overdue + work-order overdue) so you can test the notification flow
 * without the cron scheduler. Renders nothing outside development.
 */
import { useState } from 'react';
import axios from 'axios';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ScanState = 'idle' | 'running' | 'done' | 'error';

export function DevScanButton() {
  const [state, setState] = useState<ScanState>('idle');
  const [msg, setMsg] = useState('');

  // Compiled out of production bundles — the button only exists in dev.
  if (process.env.NODE_ENV !== 'development') return null;

  const run = async () => {
    setState('running');
    setMsg('');
    try {
      const res = await axios.post('/api/dev/run-notification-scan', {}, { withCredentials: true });
      const d = res.data?.data;
      setState('done');
      setMsg(`${d?.serviceAlerts ?? 0} service · ${d?.workOrderAlerts ?? 0} WO`);
    } catch {
      setState('error');
      setMsg('failed');
    }
    setTimeout(() => { setState('idle'); setMsg(''); }, 6000);
  };

  return (
    <div className="flex items-center gap-1.5">
      {msg && (
        <span className={cn('text-xs whitespace-nowrap', state === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
          {msg}
        </span>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={run}
        disabled={state === 'running'}
        title="DEV: run the notification scan now (service due/overdue + work-order overdue)"
        className="h-8 gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
      >
        <RefreshCw className={cn('h-3.5 w-3.5', state === 'running' && 'animate-spin')} />
        Run scan
      </Button>
    </div>
  );
}
