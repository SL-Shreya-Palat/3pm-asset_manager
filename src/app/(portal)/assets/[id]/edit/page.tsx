'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import { AssetForm } from '@/components/assets/asset-form';
import { Spinner } from '@/components/ui/spinner';

export default function EditAssetPage() {
  const params = useParams();
  const router = useRouter();
  const [asset, setAsset] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAsset() {
      try {
        const res = await axios.get(`/api/assets/${params.id}`, { withCredentials: true });
        setAsset(res.data.data);
      } catch {
        setAsset(null);
      } finally {
        setLoading(false);
      }
    }
    if (params.id) fetchAsset();
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Asset not found.</p>
        <button
          onClick={() => router.push('/assets')}
          className="text-sm text-primary hover:underline mt-2"
        >
          Back to Assets
        </button>
      </div>
    );
  }

  return <AssetForm mode="edit" initialData={asset} assetId={params.id as string} />;
}
