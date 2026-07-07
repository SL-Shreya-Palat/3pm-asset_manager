'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface DateFieldProps {
  id?: string;
  label?: string;
  /** Date value as "yyyy-MM-dd" string. */
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  startMonth?: Date;
  endMonth?: Date;
}

export function DateField({
  id,
  label,
  value,
  onChange,
  onBlur,
  placeholder = 'Pick a date',
  error,
  required = false,
  disabled = false,
  className,
  startMonth = new Date(1900, 0),
  endMonth = new Date(new Date().getFullYear() + 50, 11),
}: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const selectedDate = value ? new Date(value) : undefined;

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      onChange(format(date, 'yyyy-MM-dd'));
      setOpen(false);
      onBlur?.();
    }
  };

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <Label htmlFor={id} className="mb-1.5 block text-sm font-medium">
          {label}
          {required && <span className="text-destructive"> *</span>}
        </Label>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="outline"
            type="button"
            disabled={disabled}
            className={cn(
              'w-full justify-start text-left font-normal h-9',
              !value && 'text-muted-foreground',
              error && 'border-destructive',
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {selectedDate ? selectedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : <span>{placeholder}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleDateSelect}
            autoFocus
            captionLayout="dropdown"
            startMonth={startMonth}
            endMonth={endMonth}
          />
        </PopoverContent>
      </Popover>
      {error && <p className="text-xs mt-1 font-medium text-destructive">{error}</p>}
    </div>
  );
}
