import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded text-sm font-medium transition-all cursor-pointer disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-primary-500 focus-visible:ring-primary-500/20 focus-visible:ring-1 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive ",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive:
          'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        outline:
          'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50',
        secondary:
          'bg-secondary/90 text-secondary-foreground/70 hover:bg-secondary/80',
        ghost:
          'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
        link: 'text-primary underline-offset-4 hover:underline',
        approve:
          'bg-green-600 text-white hover:bg-green-700 focus-visible:ring-green-600/20 dark:focus-visible:ring-green-600/40',
        'approve-ghost':
          'bg-green-50 text-green-700 border border-green-700/20 hover:bg-green-200/50 hover:text-green-800 transition-all hover:shadow dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50 dark:border-green-300/20',
        view: 'bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-600/20 dark:focus-visible:ring-blue-600/40',
        'view-ghost':
          'bg-blue-50 text-blue-700 border border-blue-700/20 hover:bg-blue-200/50 hover:text-blue-800 transition-all hover:shadow dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50 dark:border-blue-300/20',
        yellow:
          'bg-gray-50 text-gray-700 hover:bg-slate-50 hover:border-gray-400 text-gray-700 hover:text-gray-700 transition-all hover:shadow',
        edit: 'text-blue-600 hover:text-blue-700 hover:bg-blue-50 transition-colors',
        'edit-ghost':
          'bg-blue-50 text-blue-700 border border-blue-700/20 hover:bg-blue-200/50 hover:text-blue-800 transition-all hover:shadow dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50 dark:border-blue-300/20',
        'delete-ghost':
          'bg-red-50 text-red-700 border border-red-700/20 hover:bg-red-200/50 hover:text-red-800 transition-all hover:shadow dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50 dark:border-red-300/20',
        icon: 'bg-primary-50 text-primary-600 hover:bg-primary-200/50 text-primary-700 hover:text-primary-800 transition-all hover:shadow ',
        'import-ghost':
          'bg-blue-50 text-blue-700 border border-blue-700/20 hover:bg-blue-200/50 hover:text-blue-800 transition-all hover:shadow dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50 dark:border-blue-300/20',
        'export-ghost':
          'bg-green-50 text-green-700 border border-green-700/20 hover:bg-green-200/50 hover:text-green-800 transition-all hover:shadow dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50 dark:border-green-300/20',
        'download-ghost':
          'bg-blue-50 text-blue-700 border border-blue-700/20 hover:bg-blue-200/50 hover:text-blue-800 transition-all hover:shadow dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50 dark:border-blue-300/20',
        'preprint-ghost':
          'bg-purple-50 text-purple-700 border border-purple-700/20 hover:bg-purple-200/50 hover:text-purple-800 transition-all hover:shadow dark:bg-purple-900/30 dark:text-purple-300 dark:hover:bg-purple-900/50 dark:border-purple-300/20',
        'upload-ghost':
          'bg-yellow-50 text-yellow-700 border border-yellow-700/20 hover:bg-yellow-200/50 hover:text-yellow-800 transition-all hover:shadow dark:bg-yellow-900/30 dark:text-yellow-300 dark:hover:bg-yellow-900/50 dark:border-yellow-300/20',
        'primary-ghost':
          'bg-primary-50 text-primary-700 border border-primary-700/20 hover:bg-primary-200/50 hover:text-primary-800 transition-all hover:shadow dark:bg-primary-900/30 dark:text-primary-300 dark:hover:bg-primary-900/50 dark:border-primary-300/20',
        'archive-ghost':
          'bg-gray-100 text-gray-600 border border-gray-300/60 hover:bg-gray-200/70 hover:text-gray-700 transition-all hover:shadow dark:bg-gray-900/30 dark:text-gray-300 dark:hover:bg-gray-900/50 dark:border-gray-300/20',
        'unarchive-ghost':
          'bg-blue-50 text-blue-800 border border-blue-800/20 hover:bg-blue-200/50 hover:text-blue-900 transition-all hover:shadow dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/60 dark:border-blue-300/20',
        'share-ghost':
          'bg-indigo-50 text-indigo-700 border border-indigo-700/20 hover:bg-indigo-200/50 hover:text-indigo-800 transition-all hover:shadow dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50 dark:border-indigo-300/20',
        'schedule-ghost':
          'bg-amber-50 text-amber-700 border border-amber-700/20 hover:bg-amber-200/50 hover:text-amber-800 transition-all hover:shadow dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50 dark:border-amber-300/20',
        'submit-ghost':
          'bg-teal-50 text-teal-700 border border-teal-700/20 hover:bg-teal-200/50 hover:text-teal-800 transition-all hover:shadow dark:bg-teal-900/30 dark:text-teal-300 dark:hover:bg-teal-900/50 dark:border-teal-300/20',
        'reject-ghost':
          'bg-rose-50 text-rose-700 border border-rose-700/20 hover:bg-rose-200/50 hover:text-rose-800 transition-all hover:shadow dark:bg-rose-900/30 dark:text-rose-300 dark:hover:bg-rose-900/50 dark:border-rose-300/20',
        'revert-ghost':
          'bg-cyan-50 text-cyan-700 border border-cyan-700/20 hover:bg-cyan-200/50 hover:text-cyan-800 transition-all hover:shadow dark:bg-cyan-900/30 dark:text-cyan-300 dark:hover:bg-cyan-900/50 dark:border-cyan-300/20',
        'finance-ghost':
          'bg-sky-50 text-sky-700 border border-sky-700/20 hover:bg-sky-200/50 hover:text-sky-800 transition-all hover:shadow dark:bg-sky-900/30 dark:text-sky-300 dark:hover:bg-sky-900/50 dark:border-sky-300/20',
        'back-ghost':
          'text-primary-500 hover:text-primary-600 transition-colors hover:scale-105',
        'filter-ghost':
          'bg-primary-50 text-primary-700 border border-primary-700/20 hover:bg-primary-200/50 hover:text-primary-800 transition-all hover:shadow dark:bg-primary-900/30 dark:text-primary-300 dark:hover:bg-primary-900/50 dark:border-primary-300/20',
        'edit-icon':
          'bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800 transition-colors dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50',
        'delete-icon':
          'bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800 transition-colors dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50',
        'view-icon':
          'bg-sky-50 text-sky-700 hover:bg-sky-100 hover:text-sky-800 transition-colors dark:bg-sky-900/30 dark:text-sky-300 dark:hover:bg-sky-900/50',
        'schedule-icon':
          'bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800 transition-colors dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50',
        'submit-icon':
          'bg-teal-50 text-teal-700 hover:bg-teal-100 hover:text-teal-800 transition-colors dark:bg-teal-900/30 dark:text-teal-300 dark:hover:bg-teal-900/50',
        'approve-icon':
          'bg-green-50 text-green-700 hover:bg-green-100 hover:text-green-800 transition-colors dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50',
        'reject-icon':
          'bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-800 transition-colors dark:bg-rose-900/30 dark:text-rose-300 dark:hover:bg-rose-900/50',
        'revert-icon':
          'bg-cyan-50 text-cyan-700 hover:bg-cyan-100 hover:text-cyan-800 transition-colors dark:bg-cyan-900/30 dark:text-cyan-300 dark:hover:bg-cyan-900/50',
        'finance-icon':
          'bg-sky-50 text-sky-700 hover:bg-sky-100 hover:text-sky-800 transition-colors dark:bg-sky-900/30 dark:text-sky-300 dark:hover:bg-sky-900/50',
        'adjust-icon':
          'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800 transition-colors dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50',
        'transfer-icon':
          'bg-violet-50 text-violet-700 hover:bg-violet-100 hover:text-violet-800 transition-colors dark:bg-violet-900/30 dark:text-violet-300 dark:hover:bg-violet-900/50',
        'download-icon':
          'bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800 transition-colors dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50',
        'upload-icon':
          'bg-yellow-50 text-yellow-700 hover:bg-yellow-100 hover:text-yellow-800 transition-colors dark:bg-yellow-900/30 dark:text-yellow-300 dark:hover:bg-yellow-900/50',
        'preprint-icon':
          'bg-purple-50 text-purple-700 hover:bg-purple-100 hover:text-purple-800 transition-colors dark:bg-purple-900/30 dark:text-purple-300 dark:hover:bg-purple-900/50',
        'duplicate-icon':
          'bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-800 transition-colors dark:bg-slate-900/30 dark:text-slate-300 dark:hover:bg-slate-900/50',
        'share-icon':
          'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800 transition-colors dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50',
        'primary-icon':
          'bg-primary-50 text-primary-700 hover:bg-primary-100 hover:text-primary-800 transition-colors dark:bg-primary-900/30 dark:text-primary-300 dark:hover:bg-primary-900/50',
        'archive-icon':
          'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-700 transition-colors dark:bg-gray-900/30 dark:text-gray-300 dark:hover:bg-gray-900/50',
        'unarchive-icon':
          'bg-blue-50 text-blue-800 hover:bg-blue-100 hover:text-blue-900 transition-colors dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/60',
        'pause-icon':
          'bg-gray-50 text-gray-700 hover:bg-gray-100 hover:text-gray-800 transition-colors dark:bg-gray-900/30 dark:text-gray-300 dark:hover:bg-gray-900/50',
        'stop-icon':
          'bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800 transition-colors dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50',
        'sync-icon':
          'bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800 transition-colors dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50',
        'qr-icon':
          'bg-primary-50 text-primary-600 hover:bg-primary-100 hover:text-primary-700 transition-colors dark:bg-primary-900/30 dark:text-primary-300 dark:hover:bg-primary-900/50',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 rounded gap-1 px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded px-6 has-[>svg]:px-4',
        icon: 'h-9 w-9',
        'icon-sm': 'h-8 w-8',
        'icon-lg': 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        data-slot="button"
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export interface LoadingButtonProps extends ButtonProps {
  loading?: boolean;
}

const LoadingButton = React.forwardRef<HTMLButtonElement, LoadingButtonProps>(
  ({ loading, disabled, children, ...props }, ref) => {
    return (
      <Button ref={ref} disabled={disabled || loading} {...props}>
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </Button>
    );
  },
);
LoadingButton.displayName = 'LoadingButton';

export { Button, buttonVariants, LoadingButton };
