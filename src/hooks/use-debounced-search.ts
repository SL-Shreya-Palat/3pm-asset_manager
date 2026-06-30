import { useState, useEffect } from 'react';

/**
 * Manages a search input with debounce.
 * Returns [searchValue, setSearchValue, debouncedValue].
 */
export function useDebouncedSearch(delay = 300): [string, (v: string) => void, string] {
  const [value, setValue] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return [value, setValue, debounced];
}
