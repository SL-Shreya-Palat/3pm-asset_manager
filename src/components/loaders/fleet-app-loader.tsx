'use client';

import { Truck } from 'lucide-react';
import { cn } from '@/lib/utils';

const DASH_COUNT = 6;
const DASH_STAGGER_MS = 130;

export interface FleetAppLoaderProps {
  label?: string;
  className?: string;
}

export function FleetAppLoader({ label, className }: FleetAppLoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'relative flex min-h-screen flex-col items-center justify-center bg-white',
        className,
      )}
    >
      <style>{`
        @keyframes flLoaderDashPulse {
          0%   { opacity: 0; transform: scaleX(0.4); }
          20%  { opacity: 1; transform: scaleX(1); }
          75%  { opacity: 1; transform: scaleX(1); }
          100% { opacity: 0; transform: scaleX(0.4); }
        }
        @keyframes flLoaderHover {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-6px); }
        }
      `}</style>

      <div className="flex flex-col items-center gap-6">
        {/* Truck hovering directly above the road it's driving over */}
        <div className="flex flex-col items-center gap-4">
          <div style={{ animation: 'flLoaderHover 1.8s ease-in-out infinite' }}>
            <div className="rounded-full bg-white p-2 shadow-sm ring-1 ring-primary-100">
              <Truck
                className="h-8 w-8 text-primary"
                strokeWidth={2.2}
                aria-hidden
              />
            </div>
          </div>

          {/* Lane markings chasing left-to-right beneath the truck */}
          <div className="flex items-center gap-1.5">
            {Array.from({ length: DASH_COUNT }).map((_, i) => (
              <span
                key={i}
                className="block h-1.5 w-6 rounded-full bg-linear-to-r from-primary-400 to-primary-600"
                style={{
                  opacity: 0,
                  animation: 'flLoaderDashPulse 1.4s ease-out infinite both',
                  animationDelay: `${i * DASH_STAGGER_MS}ms`,
                }}
              />
            ))}
          </div>
        </div>

        <p className="text-center text-sm font-medium text-primary-700">
          {label ?? 'Loading your fleet…'}
        </p>
      </div>

      <span className="sr-only">Loading…</span>
    </div>
  );
}
