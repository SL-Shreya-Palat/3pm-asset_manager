'use client';

/**
 * Header notification bell — polls /api/notifications, shows an unread badge,
 * and clears unread when the dropdown opens. Clicking an item opens its link.
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { Bell, AlertTriangle, Wrench, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  isRead: boolean;
  createdAt: string | null;
}

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function NotificationIcon({ type }: { type: string }) {
  if (type === 'work_order_completed') return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (type === 'work_order_assigned') return <Wrench className="h-4 w-4 text-primary" />;
  return <AlertTriangle className="h-4 w-4 text-destructive" />;
}

export function NotificationBell() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  // Track `open` in a ref so the SSE handler can read it without re-subscribing.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const load = useCallback(async () => {
    try {
      const res = await axios.get('/api/notifications', { withCredentials: true });
      const data = res.data?.data;
      setItems(data?.items ?? []);
      setUnread(data?.unreadCount ?? 0);
    } catch {
      // Silent — bell just stays as-is on transient errors.
    }
  }, []);

  // Poll every 30s. `load` only setStates after an await, so it's lint-safe.
  useEffect(() => {
    let active = true;
    const tick = async () => { if (active) await load(); };
    tick();
    const t = setInterval(tick, 30000);
    return () => { active = false; clearInterval(t); };
  }, [load]);

  // Real-time updates via SSE. Instant delivery; the 30s poll above stays as a
  // fallback (covers reconnects / multi-instance deploys). EventSource auto-reconnects.
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/notifications/stream', { withCredentials: true });
      es.addEventListener('notification', (e) => {
        try {
          const n = JSON.parse((e as MessageEvent).data) as NotificationItem;
          setItems((prev) =>
            prev.some((p) => p.id === n.id) ? prev : [n, ...prev].slice(0, 50),
          );
          if (!openRef.current) setUnread((u) => u + 1);
        } catch {
          // Ignore malformed events.
        }
      });
    } catch {
      // EventSource unsupported — the poll fallback keeps the bell working.
    }
    return () => es?.close();
  }, []);

  const handleOpenChange = async (next: boolean) => {
    setOpen(next);
    if (next && unread > 0) {
      try {
        await axios.put('/api/notifications/read', { all: true }, { withCredentials: true });
        setUnread(0);
        setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      } catch {
        // Silent
      }
    }
  };

  const handleClick = (n: NotificationItem) => {
    setOpen(false);
    if (n.link) router.push(n.link);
  };

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="px-3 py-2 border-b border-border">
          <p className="text-sm font-semibold">Notifications</p>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={cn(
                  'flex w-full gap-2.5 px-3 py-2.5 text-left border-b border-border last:border-0 hover:bg-muted/50 transition-colors',
                  !n.isRead && 'bg-primary/5',
                )}
              >
                <div className="mt-0.5 shrink-0"><NotificationIcon type={n.type} /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{n.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{n.body}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(n.createdAt)}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
