"use client";

import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders assistant replies as Markdown, styled for the narrow chat bubble.
 * Internal links (/assets/…) use next/link for client-side nav; external
 * links open in a new tab. Tables scroll rather than blow out the width.
 */
const components: Components = {
  p: ({ children }) => (
    <p className="leading-relaxed [&:not(:first-child)]:mt-2">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="list-disc space-y-1 pl-4 [&:not(:first-child)]:mt-2">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal space-y-1 pl-4 [&:not(:first-child)]:mt-2">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ children, href }) => {
    const isInternal = typeof href === "string" && href.startsWith("/");
    if (isInternal) {
      return (
        <Link
          href={href}
          className="font-medium text-primary underline underline-offset-2"
        >
          {children}
        </Link>
      );
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-primary underline underline-offset-2"
      >
        {children}
      </a>
    );
  },
  h1: ({ children }) => (
    <h3 className="text-sm font-semibold [&:not(:first-child)]:mt-3">{children}</h3>
  ),
  h2: ({ children }) => (
    <h3 className="text-sm font-semibold [&:not(:first-child)]:mt-3">{children}</h3>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-semibold [&:not(:first-child)]:mt-3">{children}</h3>
  ),
  code: ({ className, children }) => {
    const isBlock = /language-/.test(className ?? "");
    return isBlock ? (
      <code className="block overflow-x-auto rounded-md bg-background/70 p-2 font-mono text-[12px]">
        {children}
      </code>
    ) : (
      <code className="rounded bg-background/70 px-1 py-0.5 font-mono text-[12px]">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="overflow-x-auto [&:not(:first-child)]:mt-2">{children}</pre>
  ),
  hr: () => <hr className="my-2 border-border" />,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-border pl-3 text-muted-foreground">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto [&:not(:first-child)]:mt-2">
      <table className="w-full border-collapse text-[12px]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border px-2 py-1 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-border px-2 py-1 align-top">{children}</td>
  ),
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="text-sm text-foreground [word-break:break-word]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
