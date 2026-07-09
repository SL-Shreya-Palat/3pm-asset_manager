'use client';

import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { getFlatNavItems } from '@/constants/navigation';
import { useRoleAccess } from '@/hooks/use-role-access';

export interface SearchResult {
  id: string;
  label: string;
  sublabel?: string;
  href: string;
  category: 'page' | 'asset' | 'driver' | 'vendor';
}

interface UseGlobalSearchReturn {
  query: string;
  setQuery: (v: string) => void;
  results: SearchResult[];
  loading: boolean;
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  activeIndex: number;
  setActiveIndex: (i: number) => void;
}

interface EndpointConfig {
  url: string;
  category: 'asset' | 'driver' | 'vendor';
  requiredModule: string;
  toResult: (item: Record<string, string>) => SearchResult;
}

const ENDPOINTS: EndpointConfig[] = [
  {
    url: '/api/assets',
    category: 'asset',
    requiredModule: 'assets',
    toResult: (item) => ({
      id: `asset-${item.id}`,
      label: item.name,
      sublabel: [item.assetNumber, item.make, item.model].filter(Boolean).join(' \u2022 '),
      href: `/assets/${item.id}`,
      category: 'asset',
    }),
  },
  {
    url: '/api/drivers',
    category: 'driver',
    requiredModule: 'drivers',
    toResult: (item) => ({
      id: `driver-${item.id}`,
      label: `${item.firstName} ${item.lastName}`,
      sublabel: item.email || item.employeeNumber || undefined,
      href: `/people/drivers/${item.id}/edit`,
      category: 'driver',
    }),
  },
  {
    url: '/api/vendors',
    category: 'vendor',
    requiredModule: 'vendors',
    toResult: (item) => ({
      id: `vendor-${item.id}`,
      label: item.name,
      sublabel: item.contactName || undefined,
      href: `/vendors`,
      category: 'vendor',
    }),
  },
];

export function useGlobalSearch(debounceMs = 300): UseGlobalSearchReturn {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const abortRef = useRef<AbortController | null>(null);
  const { isMobileOnly, canAccessModule, canAccessSubModule } = useRoleAccess();

  // Debounce
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), debounceMs);
    return () => clearTimeout(timer);
  }, [query, debounceMs]);

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(-1);
  }, [results]);

  // Search effect
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const search = async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setIsOpen(true);

      // Navigation matches (client-side, instant) — filtered by role
      const q = debouncedQuery.toLowerCase();
      const navMatches: SearchResult[] = getFlatNavItems()
        .filter((item) => {
          if (!item.label.toLowerCase().includes(q)) return false;
          if (item.requiredSubModule && item.requiredModule) {
            return canAccessSubModule(item.requiredModule, item.requiredSubModule);
          }
          if (item.requiredModule) return canAccessModule(item.requiredModule);
          return !isMobileOnly;
        })
        .slice(0, 5)
        .map((item) => ({
          id: `nav-${item.href}`,
          label: item.label,
          sublabel: item.parent ? `${item.parent}` : undefined,
          href: item.href,
          category: 'page' as const,
        }));

      // Filter endpoints by role
      const accessibleEndpoints = ENDPOINTS.filter((ep) => {
        return canAccessModule(ep.requiredModule);
      });

      // API searches (parallel, limit=5 each)
      try {
        const apiResults = await Promise.allSettled(
          accessibleEndpoints.map((ep) =>
            axios
              .get(
                `${ep.url}?search=${encodeURIComponent(debouncedQuery)}&limit=5&page=1`,
                { withCredentials: true, signal: controller.signal },
              )
              .then((res) => (res.data.data?.items || []).map(ep.toResult)),
          ),
        );

        if (controller.signal.aborted) return;

        const dataMatches: SearchResult[] = apiResults
          .filter(
            (r): r is PromiseFulfilledResult<SearchResult[]> => r.status === 'fulfilled',
          )
          .flatMap((r) => r.value);

        setResults([...navMatches, ...dataMatches]);
      } catch {
        if (!controller.signal.aborted) {
          setResults(navMatches);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    search();

    return () => {
      abortRef.current?.abort();
    };
  }, [debouncedQuery, isMobileOnly, canAccessModule, canAccessSubModule]);

  return { query, setQuery, results, loading, isOpen, setIsOpen, activeIndex, setActiveIndex };
}
