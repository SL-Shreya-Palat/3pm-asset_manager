'use client';

import { useSearchParams } from 'next/navigation';
import { AssetForm } from '@/components/assets/asset-form';

export default function NewAssetPage() {
  const searchParams = useSearchParams();

  // Build initialData from the CarJam lookup query params if present. A plate
  // lookup may not return a VIN, so key off any identifying field.
  const hasPrefill =
    !!searchParams.get('vin') || !!searchParams.get('make') || !!searchParams.get('licensePlate');
  const initialData = hasPrefill
    ? {
        vin: searchParams.get('vin') || '',
        licensePlate: searchParams.get('licensePlate') || '',
        make: searchParams.get('make') || '',
        model: searchParams.get('model') || '',
        year: searchParams.get('year') ? Number(searchParams.get('year')) : undefined,
        vehicleType: searchParams.get('vehicleType') || '',
        color: searchParams.get('color') || '',
      }
    : undefined;

  return <AssetForm mode="create" initialData={initialData} />;
}
