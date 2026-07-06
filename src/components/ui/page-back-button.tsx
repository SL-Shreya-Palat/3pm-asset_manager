'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PageBackButtonProps {
  /** Route to navigate back to. Provide either href or onClick. */
  href?: string;
  /** Custom click handler (alternative to href). */
  onClick?: () => void;
  className?: string;
}

/**
 * Circular back-navigation button with a chevron icon.
 * Place inline before a page title for consistent back navigation.
 */
export function PageBackButton({ href, onClick, className }: PageBackButtonProps) {
  const router = useRouter();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (href) {
      router.push(href);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors shrink-0',
        className,
      )}
    >
      <ChevronLeft className="h-4 w-4 text-primary" />
    </button>
  );
}
