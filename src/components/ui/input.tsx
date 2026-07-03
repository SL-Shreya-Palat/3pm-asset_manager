import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, value, ...props }, ref) => {
    return (
      <input
        type={type}
        // Coerce a null value to "" so a controlled input never trips React's
        // "`value` prop on `input` should not be null" warning — migrated docs
        // often bind a nullable field straight to the input. `undefined` is
        // preserved so refs/defaultValue (uncontrolled) inputs still work.
        value={value === null ? '' : value}
        className={cn(
          'file:text-gray-700 placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input min-h-9 h-9 w-full min-w-0 rounded border bg-white px-3 py-1 text-base shadow-xs transition-all outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          'hover:border-primary-400',
          'focus-visible:border-primary-500 focus-visible:ring-primary-500/20 focus-visible:ring-1',
          'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
