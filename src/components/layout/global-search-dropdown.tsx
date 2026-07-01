'use client';

import { forwardRef } from 'react';
import { Search, Truck, Users, Store, LayoutDashboard } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import type { SearchResult } from '@/hooks/use-global-search';

const CATEGORY_CONFIG: Record<
  SearchResult['category'],
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  page: { label: 'Pages', icon: LayoutDashboard },
  asset: { label: 'Assets', icon: Truck },
  driver: { label: 'Drivers', icon: Users },
  vendor: { label: 'Vendors', icon: Store },
};

const CATEGORY_ORDER: SearchResult['category'][] = ['page', 'asset', 'driver', 'vendor'];

interface Props {
  results: SearchResult[];
  loading: boolean;
  activeIndex: number;
  query: string;
  onSelect: (result: SearchResult) => void;
  onHover: (index: number) => void;
}

export const GlobalSearchDropdown = forwardRef<HTMLDivElement, Props>(
  ({ results, loading, activeIndex, query, onSelect, onHover }, ref) => {
    const grouped = CATEGORY_ORDER.map((cat) => ({
      category: cat,
      config: CATEGORY_CONFIG[cat],
      items: results.filter((r) => r.category === cat),
    })).filter((g) => g.items.length > 0);

    let flatIndex = 0;

    return (
      <div
        ref={ref}
        className="absolute top-full left-0 right-0 mt-1 z-50 rounded-md border bg-popover shadow-lg"
      >
        <ScrollArea className="max-h-80">
          {loading && results.length === 0 ? (
            <div className="flex items-center justify-center py-6">
              <Spinner size="sm" />
              <span className="ml-2 text-sm text-muted-foreground">Searching...</span>
            </div>
          ) : results.length === 0 && query.trim() ? (
            <div className="py-6 text-center">
              <Search className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No results for &ldquo;{query}&rdquo;</p>
            </div>
          ) : (
            <div className="py-1">
              {grouped.map((group) => {
                const Icon = group.config.icon;
                return (
                  <div key={group.category}>
                    <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {group.config.label}
                    </div>
                    {group.items.map((result) => {
                      const idx = flatIndex++;
                      return (
                        <button
                          key={result.id}
                          type="button"
                          onClick={() => onSelect(result)}
                          onMouseEnter={() => onHover(idx)}
                          className={cn(
                            'flex w-full items-center gap-3 px-3 py-2 text-sm text-left transition-colors',
                            idx === activeIndex
                              ? 'bg-accent text-accent-foreground'
                              : 'hover:bg-muted/50',
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-foreground truncate">{result.label}</p>
                            {result.sublabel && (
                              <p className="text-xs text-muted-foreground truncate">
                                {result.sublabel}
                              </p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
              {loading && results.length > 0 && (
                <div className="flex items-center justify-center py-2 border-t">
                  <Spinner size="sm" />
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </div>
    );
  },
);
GlobalSearchDropdown.displayName = 'GlobalSearchDropdown';
