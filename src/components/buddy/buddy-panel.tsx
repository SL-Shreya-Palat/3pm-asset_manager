"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  ArrowUp,
  X,
  Loader2,
  Check,
  Ban,
  AlertCircle,
  ShieldQuestion,
  History,
  Maximize2,
  Minimize2,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useBuddyStore } from "@/store/buddy/store";
import { useAuth } from "@/hooks/useAuth";
import { Markdown } from "./markdown";
import { ToolResultCards, isCardTool } from "./tool-result-cards";

const SUGGESTIONS = [
  "How's my fleet today?",
  "Which assets are out of service?",
  "Show me open critical defects",
  "What services are overdue?",
];

const BuddyAvatar = ({ size = 36 }: { size?: number }) => (
  <Image
    src="/images/Buddy.png"
    alt="Buddy AI"
    width={size}
    height={size}
    className="object-contain"
  />
);

type ThreadSummary = { id: string; title: string; updatedAt: string };

/** Loose view over a tool UI part — we only read a handful of fields. */
type ToolPartLike = {
  type: string;
  state?: string;
  input?: Record<string, unknown>;
  output?: {
    ok?: boolean;
    error?: string;
    summary?: string;
    items?: unknown[];
    total?: number;
  } & Record<string, unknown>;
  errorText?: string;
  approval?: { id: string; approved?: boolean };
};

function textOf(m: UIMessage): string {
  return m.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
    .trim();
}

function toolPartsOf(m: UIMessage): ToolPartLike[] {
  return m.parts.filter(
    (p) => typeof p.type === "string" && p.type.startsWith("tool-"),
  ) as unknown as ToolPartLike[];
}

function toolPartVisible(p: ToolPartLike): boolean {
  if (
    p.state === "approval-requested" ||
    p.state === "approval-responded" ||
    p.state === "output-denied" ||
    p.state === "output-error"
  )
    return true;
  if (p.state === "output-available" && p.output && typeof p.output === "object") {
    if ("ok" in p.output) return true;
    if (isCardTool(p.type) && Array.isArray(p.output.items)) return true;
  }
  return false;
}

function humanizeKey(k: string): string {
  return k
    .replace(/Id$/, "")
    .replace(/([A-Z])/g, " $1")
    .trim()
    .toLowerCase();
}

function actionLabel(type: string, input: Record<string, unknown> = {}): string {
  const name = type.replace(/^tool-/, "").replace(/_/g, " ");
  const fields = Object.keys(input)
    .filter((k) => k !== "id" && input[k] !== undefined && input[k] !== "")
    .map(humanizeKey)
    .join(", ");
  return fields ? `${name} — ${fields}` : name;
}

export function BuddyPanel() {
  const open = useBuddyStore((s) => s.open);
  const setOpen = useBuddyStore((s) => s.setOpen);
  const fullPage = useBuddyStore((s) => s.fullPage);
  const setFullPage = useBuddyStore((s) => s.setFullPage);
  const { user } = useAuth();

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const activeThreadIdRef = useRef<string | null>(null);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [showThreads, setShowThreads] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const setActive = useCallback((id: string | null) => {
    activeThreadIdRef.current = id;
    setActiveThreadId(id);
  }, []);

  const refreshThreads = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/threads");
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json.threads)) setThreads(json.threads);
      }
    } catch {
      /* transient */
    }
  }, []);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/ai/chat",
        fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
          const res = await fetch(input, init);
          const tid = res.headers.get("X-Thread-Id");
          if (tid && activeThreadIdRef.current !== tid) {
            setActive(tid);
            void refreshThreads();
          }
          return res;
        }) as typeof fetch,
      }),
    [refreshThreads, setActive],
  );

  const { messages, sendMessage, status, setMessages, addToolApprovalResponse } =
    useChat({
      transport,
      onError: (e) =>
        setErrorText(e.message || "Buddy hit a problem. Please try again."),
    });

  const [input, setInput] = useState("");
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (open) void refreshThreads();
  }, [open, refreshThreads]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  const send = useCallback(
    (text?: string) => {
      const value = (text ?? input).trim();
      if (!value || busy) return;
      setErrorText(null);
      void sendMessage(
        { text: value },
        { body: { threadId: activeThreadIdRef.current ?? undefined } },
      );
      setInput("");
    },
    [input, busy, sendMessage],
  );

  const newChat = useCallback(() => {
    setMessages([]);
    setActive(null);
    setErrorText(null);
    setShowThreads(false);
  }, [setMessages, setActive]);

  const loadThread = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/ai/threads/${id}/messages`);
        if (!res.ok) return;
        const json = await res.json();
        setMessages((json.messages ?? []) as UIMessage[]);
        setActive(id);
        setErrorText(null);
        if (!fullPage) setShowThreads(false);
      } catch {
        /* ignore */
      }
    },
    [setMessages, setActive, fullPage],
  );

  const removeThread = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/ai/threads/${id}`, { method: "DELETE" });
      } catch {
        /* ignore */
      }
      if (activeThreadIdRef.current === id) newChat();
      void refreshThreads();
    },
    [newChat, refreshThreads],
  );

  if (!open) return null;

  const firstName = user?.firstName;
  const last = messages[messages.length - 1];
  const showThinking = busy && (!last || last.role === "user");
  const sidebarVisible = fullPage || showThreads;

  const ThreadList = (
    <div
      className={`flex flex-col border-r border-border bg-muted/30 ${
        fullPage ? "w-64" : "w-56"
      }`}
    >
      <div className="p-2">
        <Button onClick={newChat} className="w-full justify-start gap-2" size="sm">
          <Plus className="size-4" /> New chat
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {threads.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            No conversations yet.
          </p>
        ) : (
          threads.map((t) => (
            <div
              key={t.id}
              className={`group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm ${
                t.id === activeThreadId
                  ? "bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <button
                type="button"
                onClick={() => loadThread(t.id)}
                className="flex-1 truncate text-left"
                title={t.title}
              >
                {t.title}
              </button>
              <button
                type="button"
                onClick={() => removeThread(t.id)}
                aria-label="Delete conversation"
                className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const Conversation = (
    <div className="flex min-w-0 flex-1 flex-col bg-linear-to-b from-muted/40 to-card">
      {/* Header */}
      <div className="flex h-16 items-center gap-3 border-b border-border px-5">
        <span className="flex items-center justify-center rounded-sm bg-primary/10 p-1.5">
          <BuddyAvatar size={30} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold leading-tight text-foreground">
            Buddy AI
          </h2>
          <p className="truncate text-xs leading-tight text-muted-foreground">
            Your fleet assistant
          </p>
        </div>
        {!fullPage && (
          <IconButton
            onClick={() => setShowThreads((v) => !v)}
            label="Conversation history"
            active={showThreads}
          >
            <History className="size-4" />
          </IconButton>
        )}
        <IconButton
          onClick={() => setFullPage(!fullPage)}
          label={fullPage ? "Exit full screen" : "Full screen"}
        >
          {fullPage ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </IconButton>
        <IconButton
          onClick={() => {
            setFullPage(false);
            setOpen(false);
          }}
          label="Close"
        >
          <X className="size-4" />
        </IconButton>
      </div>

      {/* Body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5">
        {messages.length === 0 ? (
          <div className="flex h-full min-h-[280px] flex-col items-center justify-center text-center">
            <div className="relative mb-6">
              <div className="absolute inset-0 animate-pulse rounded-full bg-primary/20 blur-xl" />
              <div className="relative">
                <BuddyAvatar size={56} />
              </div>
            </div>
            <h3 className="mb-1 text-lg font-semibold text-foreground">
              Hi{firstName ? `, ${firstName}` : ""}! I&apos;m Buddy AI
            </h3>
            <p className="mb-6 max-w-[260px] text-sm text-muted-foreground">
              Your fleet assistant. Ask me about assets, defects, work orders,
              services, or how to navigate the app.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-lg border border-primary/20 bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary transition-all duration-200 hover:bg-primary/15 hover:shadow-sm active:scale-[0.98]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-4">
            {messages.map((m, i) => (
              <MessageBubble
                key={m.id}
                message={m}
                pending={busy && i === messages.length - 1}
                onApprove={(id) => addToolApprovalResponse({ id, approved: true })}
                onDeny={(id) => addToolApprovalResponse({ id, approved: false })}
              />
            ))}
            {showThinking && <ThinkingRow />}
          </div>
        )}
      </div>

      {/* Error */}
      {errorText && (
        <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="size-3.5 shrink-0" />
          <span className="flex-1">{errorText}</span>
          <button type="button" onClick={() => setErrorText(null)} aria-label="Dismiss">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Composer */}
      <div className="border-t border-border p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="mx-auto flex max-w-2xl items-end gap-2 rounded-xl border border-border bg-background px-2 py-1.5 transition-shadow focus-within:ring-2 focus-within:ring-primary/30"
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask Buddy anything…"
            rows={1}
            className="max-h-32 min-h-0 flex-1 resize-none border-0 bg-transparent px-1 py-1.5 text-sm shadow-none focus-visible:ring-0"
          />
          <Button
            type="submit"
            size="icon"
            disabled={busy || !input.trim()}
            className="size-8 shrink-0 rounded-lg"
            aria-label="Send"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ArrowUp className="size-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );

  return (
    <div
      className={
        fullPage
          ? "fixed inset-0 z-50 flex bg-card animate-in fade-in"
          : "fixed right-16 top-0 bottom-0 z-40 flex w-[430px] border-l border-border bg-card shadow-xl animate-in slide-in-from-right"
      }
    >
      {sidebarVisible && ThreadList}
      {Conversation}
    </div>
  );
}

function IconButton({
  children,
  onClick,
  label,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex size-9 items-center justify-center rounded-sm transition-colors hover:bg-muted hover:text-foreground ${
        active ? "bg-muted text-foreground" : "text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function MessageBubble({
  message,
  pending,
  onApprove,
  onDeny,
}: {
  message: UIMessage;
  pending: boolean;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
}) {
  const text = textOf(message);
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex animate-in fade-in slide-in-from-bottom-2 justify-end duration-300">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-lg rounded-br-none bg-primary px-3 py-2 text-sm leading-relaxed text-primary-foreground shadow-sm">
          {text}
        </div>
      </div>
    );
  }

  const visibleTools = toolPartsOf(message).filter(toolPartVisible);
  if (!text && visibleTools.length === 0 && !pending) return null;

  return (
    <div className="flex animate-in fade-in slide-in-from-bottom-2 justify-start duration-300">
      <div className="flex min-w-0 max-w-[85%] flex-col gap-2">
        {text && (
          <div className="rounded-lg rounded-bl-none border border-primary/10 bg-primary/5 px-3 py-2 shadow-sm">
            <Markdown>{text}</Markdown>
          </div>
        )}
        {visibleTools.map((part, i) => (
          <ToolPartView key={i} part={part} onApprove={onApprove} onDeny={onDeny} />
        ))}
        {!text && visibleTools.length === 0 && pending && <WorkingLine />}
      </div>
    </div>
  );
}

function ToolPartView({
  part,
  onApprove,
  onDeny,
}: {
  part: ToolPartLike;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
}) {
  if (part.state === "approval-requested" && part.approval?.id) {
    const id = part.approval.id;
    return (
      <div className="overflow-hidden rounded-xl border border-primary/20 bg-linear-to-b from-primary/5 to-transparent shadow-sm">
        <div className="flex items-start gap-2.5 px-3.5 pt-3">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldQuestion className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">
              Confirm action
            </div>
            <p className="mt-0.5 text-xs capitalize leading-snug text-muted-foreground">
              {actionLabel(part.type, part.input)}
            </p>
          </div>
        </div>
        <div className="mt-2.5 flex justify-end gap-2 border-t border-primary/10 bg-primary/5 px-3 py-2">
          <Button size="sm" variant="outline" className="h-7 gap-1 px-3 text-xs" onClick={() => onDeny(id)}>
            <X className="size-3.5" /> Cancel
          </Button>
          <Button size="sm" className="h-7 gap-1 px-3 text-xs" onClick={() => onApprove(id)}>
            <Check className="size-3.5" /> Confirm
          </Button>
        </div>
      </div>
    );
  }

  if (part.state === "approval-responded") return <WorkingLine label="Applying…" />;

  if (part.state === "output-denied") {
    return (
      <div className="inline-flex items-center gap-1.5 self-start rounded-lg bg-muted px-2.5 py-1 text-xs text-muted-foreground">
        <Ban className="size-3.5" /> Cancelled
      </div>
    );
  }

  if (part.state === "output-error") {
    return (
      <div className="inline-flex items-center gap-1.5 self-start rounded-lg bg-destructive/10 px-2.5 py-1 text-xs text-destructive">
        <AlertCircle className="size-3.5" /> {part.errorText ?? "Action failed"}
      </div>
    );
  }

  if (
    part.state === "output-available" &&
    part.output &&
    typeof part.output === "object" &&
    isCardTool(part.type) &&
    Array.isArray(part.output.items)
  ) {
    return (
      <ToolResultCards
        type={part.type}
        output={part.output as { items?: unknown[]; total?: number }}
      />
    );
  }

  if (
    part.state === "output-available" &&
    part.output &&
    typeof part.output === "object" &&
    "ok" in part.output
  ) {
    if (part.output.ok === false) {
      return (
        <div className="inline-flex items-center gap-1.5 self-start rounded-lg bg-destructive/10 px-2.5 py-1 text-xs text-destructive">
          <AlertCircle className="size-3.5" /> {part.output.error ?? "Action failed"}
        </div>
      );
    }
    return (
      <div className="inline-flex items-center gap-1.5 self-start rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
        <Check className="size-3.5" /> {part.output.summary ?? "Done"}
      </div>
    );
  }

  return null;
}

function ThinkingRow() {
  return (
    <div className="flex animate-in fade-in justify-start duration-300">
      <div className="flex items-center gap-2 rounded-lg rounded-bl-none border border-primary/10 bg-primary/5 px-3 py-2.5 shadow-sm">
        <span className="flex gap-1">
          <span className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
          <span className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
          <span className="size-1.5 animate-bounce rounded-full bg-primary" />
        </span>
        <span className="text-xs text-muted-foreground">Buddy is thinking…</span>
      </div>
    </div>
  );
}

function WorkingLine({ label = "Looking things up…" }: { label?: string }) {
  return (
    <div className="inline-flex items-center gap-2 self-start rounded-lg rounded-bl-none border border-primary/10 bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
      <Loader2 className="size-3.5 animate-spin" />
      <span>{label}</span>
    </div>
  );
}
