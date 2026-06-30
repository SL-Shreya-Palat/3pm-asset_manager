'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import { DriverForm } from '@/components/drivers/driver-form';
import { Spinner } from '@/components/ui/spinner';

export default function EditDriverPage() {
  const params = useParams();
  const router = useRouter();
  const [driver, setDriver] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDriver() {
      try {
        const res = await axios.get(`/api/drivers/${params.id}`, { withCredentials: true });
        setDriver(res.data.data);
      } catch {
        setDriver(null);
      } finally {
        setLoading(false);
      }
    }
    if (params.id) fetchDriver();
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Driver not found.</p>
        <button
          onClick={() => router.push('/people/drivers')}
          className="text-sm text-primary hover:underline mt-2"
        >
          Back to Drivers
        </button>
      </div>
    );
  }

  return <DriverForm mode="edit" initialData={driver} driverId={params.id as string} />;
}
