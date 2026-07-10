'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

const MIN_VIN_LENGTH = 2;

interface VinLookupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VinLookupDialog({ open, onOpenChange }: VinLookupDialogProps) {
  const router = useRouter();
  const [vin, setVin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDecode = async () => {
    setError('');

    const trimmed = vin.trim().toUpperCase();
    if (trimmed.length < MIN_VIN_LENGTH) {
      setError(`Must be at least ${MIN_VIN_LENGTH} characters`);
      return;
    }

    try {
      setLoading(true);
      const res = await axios.get(`/api/vin-decode?vin=${encodeURIComponent(trimmed)}`, {
        withCredentials: true,
      });

      const data = res.data.data;
      if (!data) {
        setError(res.data.error || 'Failed to decode VIN');
        return;
      }

      // Build query params for pre-populating the form
      const params = new URLSearchParams();
      if (data.vin) params.set('vin', data.vin);
      if (data.make) params.set('make', data.make);
      if (data.model) params.set('model', data.model);
      if (data.year) params.set('year', data.year);
      if (data.vehicleType) params.set('vehicleType', data.vehicleType);
      if (data.bodyClass) params.set('bodyClass', data.bodyClass);
      if (data.fuelType) params.set('fuelType', data.fuelType);
      if (data.color) params.set('color', data.color);
      if (data.licensePlate) params.set('licensePlate', data.licensePlate);

      onOpenChange(false);
      resetState();
      router.push(`/assets/new?${params.toString()}`);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        setError(err.response.data.error);
      } else {
        setError('Failed to decode VIN. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    onOpenChange(false);
    resetState();
    router.push('/assets/new');
  };

  const resetState = () => {
    setVin('');
    setError('');
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && vin.trim().length >= MIN_VIN_LENGTH) {
      handleDecode();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) resetState();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Look up vehicle</DialogTitle>
          <DialogDescription>
            Enter a rego number, VIN or chassis number to auto-fill the vehicle&apos;s details
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="vin-lookup">Rego Number / VIN / Chassis</Label>
            <div className="relative mt-1.5">
              <Input
                id="vin-lookup"
                value={vin}
                onChange={(e) => {
                  setVin(e.target.value.toUpperCase());
                  if (error) setError('');
                }}
                onKeyDown={handleKeyDown}
                placeholder="e.g. ABC-123 or JM0KF4WLA00115724"
                className={`pr-10 font-mono tracking-wider ${error ? 'border-destructive' : ''}`}
                disabled={loading}
                autoFocus
              />
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex items-center justify-between mt-1.5">
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : (
                <p className="text-xs text-muted-foreground">{vin.trim().length} characters</p>
              )}
            </div>
          </div>

          <Button
            onClick={handleDecode}
            disabled={loading || vin.trim().length < MIN_VIN_LENGTH}
            className="w-full"
          >
            {loading ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Looking up...
              </>
            ) : (
              'Look up vehicle'
            )}
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">or</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSkip}
            className="w-full text-sm text-primary hover:underline font-medium py-2"
            disabled={loading}
          >
            Skip and fill manually
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
