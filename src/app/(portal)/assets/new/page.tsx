'use client';

import { useSearchParams } from 'next/navigation';
import { AssetForm } from '@/components/assets/asset-form';

export default function NewAssetPage() {
  const searchParams = useSearchParams();

  // Build initialData from VIN-decoded query params if present
  const vin = searchParams.get('vin');
  const initialData = vin
    ? {
        vin: searchParams.get('vin') || '',
        make: searchParams.get('make') || '',
        model: searchParams.get('model') || '',
        year: searchParams.get('year') ? Number(searchParams.get('year')) : undefined,
        vehicleType: searchParams.get('vehicleType') || '',
        assetSubtype: searchParams.get('bodyClass') || '',
      }
    : undefined;

  return <AssetForm mode="create" initialData={initialData} />;
}
