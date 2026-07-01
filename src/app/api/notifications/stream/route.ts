/**
 * GET /api/notifications/stream — Server-Sent Events (SSE) stream of real-time
 * notifications for the current user. The header bell opens this with EventSource
 * and updates instantly, instead of waiting for the next poll.
 *
 * One-way (server → client), runs over plain HTTP in a Node route — no custom
 * server or extra infrastructure. Auth uses the same cookie as every other route.
 */
import { NextRequest } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-helper';
import { subscribeNotifications } from '@/lib/notificationHub';

// Long-lived streaming connection — must run on the Node runtime and never be cached.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user?.currentTenantId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const tenantId = user.currentTenantId;
  const userId = user.id;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Controller already closed — stop pushing.
          closed = true;
        }
      };

      // Initial comment so the browser marks the connection open immediately.
      write(': connected\n\n');

      const unsubscribe = subscribeNotifications(tenantId, userId, (event) => {
        write(`event: notification\ndata: ${JSON.stringify(event)}\n\n`);
      });

      // Heartbeat keeps proxies from closing an idle connection.
      const heartbeat = setInterval(() => write(': ping\n\n'), 25000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      // Client navigated away / closed the tab.
      request.signal.addEventListener('abort', cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Disable proxy buffering (nginx) so events flush immediately.
      'X-Accel-Buffering': 'no',
    },
  });
}
