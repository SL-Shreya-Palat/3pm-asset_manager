'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Check, ChevronDown, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface SearchableSelectOption {
  label: string;
  value: string;
  meta?: string;
  disabled?: boolean;
}

interface SearchableSelectPropsBase {
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
  disabled?: boolean;
  loading?: boolean;
  isClearable?: boolean;
  maxDisplayed?: number;
  label?: string;
  error?: string;
  required?: boolean;
  renderOption?: (option: SearchableSelectOption, isSelected: boolean) => React.ReactNode;
}

interface SingleSelectProps extends SearchableSelectPropsBase {
  isMulti?: false;
  value?: string | null;
  onValueChange?: (value: string | null) => void;
  onSearch?: (value: string) => void;
}

interface MultiSelectProps extends SearchableSelectPropsBase {
  isMulti: true;
  value?: string[];
  onValueChange?: (value: string[]) => void;
  onSearch?: (value: string) => void;
}

type SearchableSelectProps = SingleSelectProps | MultiSelectProps;

function SearchableSelectComponent(props: SearchableSelectProps) {
  const {
    options: rawOptions = [],
    placeholder = 'Select an option...',
    searchPlaceholder = 'Search...',
    emptyMessage = 'No options found',
    className,
    disabled = false,
    loading = false,
    isClearable = true,
    maxDisplayed = 3,
    label,
    error,
    required,
    renderOption,
  } = props;

  const options: SearchableSelectOption[] = Array.isArray(rawOptions) ? rawOptions : [];

  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedSearchRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const { onValueChange, isMulti, value, onSearch } = props;

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (newOpen && loading) return;
      setOpen(newOpen);
      if (newOpen) setSearchTerm('');
    },
    [loading],
  );

  const debouncedSearch = useCallback(
    (searchValue: string) => {
      if (debouncedSearchRef.current) clearTimeout(debouncedSearchRef.current);
      debouncedSearchRef.current = setTimeout(() => {
        onSearch?.(searchValue);
      }, 300);
    },
    [onSearch],
  );

  const filteredOptions = useMemo(() => {
    if (!options.length) return [];
    if (!searchTerm.trim()) return options;
    const term = searchTerm.toLowerCase();
    return options.filter(
      (o) => o.label.toLowerCase().includes(term) || o.meta?.toLowerCase().includes(term),
    );
  }, [options, searchTerm]);

  const selectedOptions = useMemo((): SearchableSelectOption[] => {
    if (isMulti) {
      const values = value || [];
      return options.filter((o) => values.includes(o.value));
    }
    const selected = options.find((o) => o.value === value);
    return selected ? [selected] : [];
  }, [options, value, isMulti]);

  const handleValueChange = useCallback(
    (newValue: string | string[] | null) => {
      if (onValueChange) {
        if (isMulti) {
          (onValueChange as (v: string[]) => void)(newValue as string[]);
        } else {
          (onValueChange as (v: string | null) => void)(newValue as string | null);
        }
      }
    },
    [onValueChange, isMulti],
  );

  const handleToggleOption = useCallback(
    (optionValue: string) => {
      if (isMulti) {
        const currentValues = (value as string[]) || [];
        const newValues = currentValues.includes(optionValue)
          ? currentValues.filter((v) => v !== optionValue)
          : [...currentValues, optionValue];
        handleValueChange(newValues);
      } else {
        handleValueChange(optionValue);
        setOpen(false);
      }
    },
    [isMulti, value, handleValueChange],
  );

  const handleClearAll = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      handleValueChange(isMulti ? [] : null);
    },
    [isMulti, handleValueChange],
  );

  const handleRemoveItem = useCallback(
    (e: React.MouseEvent, optionValue: string) => {
      e.stopPropagation();
      e.preventDefault();
      if (isMulti) {
        const currentValues = (value as string[]) || [];
        handleValueChange(currentValues.filter((v) => v !== optionValue));
      }
    },
    [isMulti, value, handleValueChange],
  );

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const displayedOptions = useMemo(
    () => (isMulti ? selectedOptions.slice(0, maxDisplayed) : selectedOptions),
    [isMulti, selectedOptions, maxDisplayed],
  );

  const remainingCount = useMemo(
    () => (isMulti ? Math.max(0, selectedOptions.length - maxDisplayed) : 0),
    [isMulti, selectedOptions.length, maxDisplayed],
  );

  const renderTriggerContent = () => {
    if (isMulti) {
      if (selectedOptions.length === 0) {
        return <span className="text-muted-foreground text-sm">{placeholder}</span>;
      }
      return (
        <>
          {displayedOptions.map((option) => (
            <Badge
              key={option.value}
              variant="secondary"
              className="text-xs px-2 py-0.5 h-6 flex items-center gap-1 max-w-full rounded-full font-medium"
            >
              <span className="truncate max-w-[140px]">{option.label}</span>
              <div
                className="h-3.5 w-3.5 cursor-pointer hover:text-destructive flex items-center justify-center rounded-full shrink-0"
                onClick={(e) => handleRemoveItem(e, option.value)}
                role="button"
                aria-label={`Remove ${option.label}`}
              >
                <X className="h-2.5 w-2.5" />
              </div>
            </Badge>
          ))}
          {remainingCount > 0 && (
            <Badge variant="outline" className="text-xs px-2 py-0.5 h-6 rounded-full font-medium">
              +{remainingCount} more
            </Badge>
          )}
        </>
      );
    }

    if (selectedOptions.length > 0) {
      return (
        <span className="text-sm truncate flex-1 text-left">{selectedOptions[0].label}</span>
      );
    }
    return <span className="text-muted-foreground text-sm">{placeholder}</span>;
  };

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <Label className="mb-1.5 block">
          {label}
          {required && <span className="text-destructive"> *</span>}
        </Label>
      )}
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              'w-full justify-between text-left font-normal',
              isMulti ? 'h-auto min-h-9 py-1.5 items-start' : 'h-9 py-0 items-center',
              'px-3',
              !selectedOptions.length && 'text-muted-foreground',
              disabled && 'opacity-50',
              error && 'border-destructive',
            )}
            disabled={disabled}
          >
            <div className="flex flex-wrap gap-1 flex-1 min-w-0 items-center">
              {renderTriggerContent()}
            </div>
            <div className="flex items-center gap-1 ml-2 shrink-0">
              {selectedOptions.length > 0 && isClearable && (
                <div
                  className="h-5 w-5 cursor-pointer hover:text-destructive flex items-center justify-center rounded"
                  onClick={handleClearAll}
                  role="button"
                  aria-label="Clear selection"
                >
                  <X className="h-3.5 w-3.5" />
                </div>
              )}
              {loading ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              ) : (
                <ChevronDown
                  className={cn(
                    'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                    open && 'rotate-180',
                  )}
                />
              )}
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="p-0 shadow-lg"
          align="start"
          side="bottom"
          style={{
            width: 'var(--radix-popover-trigger-width)',
            maxWidth: 'var(--radix-popover-trigger-width)',
          }}
        >
          {loading ? (
            <div className="p-4 text-sm text-muted-foreground text-center">Loading...</div>
          ) : (
            <>
              <div className="p-2 border-b border-border">
                <Input
                  ref={inputRef}
                  placeholder={searchPlaceholder}
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    debouncedSearch(e.target.value);
                  }}
                  className="h-8 text-sm"
                />
              </div>
              <div className="overflow-y-auto max-h-[200px]">
                {filteredOptions.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground text-center">
                    {emptyMessage}
                  </div>
                ) : (
                  <div className="p-1">
                    {filteredOptions.map((option) => {
                      const isSelected = isMulti
                        ? ((value as string[]) || []).includes(option.value)
                        : value === option.value;

                      return renderOption ? (
                        <div
                          key={option.value}
                          onClick={() => !option.disabled && handleToggleOption(option.value)}
                        >
                          {renderOption(option, isSelected)}
                        </div>
                      ) : (
                        <div
                          key={option.value}
                          className={cn(
                            'flex items-center justify-between gap-2 px-2 py-1.5 cursor-pointer rounded transition-colors',
                            'hover:bg-muted/50',
                            isSelected && 'bg-primary/5 hover:bg-primary/10',
                            option.disabled && 'opacity-50 pointer-events-none',
                          )}
                          onClick={() => !option.disabled && handleToggleOption(option.value)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className={cn('text-sm text-foreground truncate', isSelected && 'font-medium')}>
                              {option.label}
                            </div>
                            {option.meta && (
                              <div className="text-xs text-muted-foreground truncate mt-0.5">
                                {option.meta}
                              </div>
                            )}
                          </div>
                          {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </PopoverContent>
      </Popover>
      {error && <p className="text-sm text-destructive mt-1">{error}</p>}
    </div>
  );
}

export const SearchableSelect = SearchableSelectComponent;
