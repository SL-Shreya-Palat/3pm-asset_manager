'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import { ServiceProgramForm } from '@/components/service-programs/service-program-form';
import { Spinner } from '@/components/ui/spinner';

export default function EditServiceProgramPage() {
  const params = useParams();
  const router = useRouter();
  const [program, setProgram] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProgram() {
      try {
        const res = await axios.get(`/api/service-programs/${params.id}`, { withCredentials: true });
        setProgram(res.data.data);
      } catch {
        setProgram(null);
      } finally {
        setLoading(false);
      }
    }
    if (params.id) fetchProgram();
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!program) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Service program not found.</p>
        <button
          onClick={() => router.push('/maintenance/service-programs')}
          className="text-sm text-primary hover:underline mt-2"
        >
          Back to Service Programs
        </button>
      </div>
    );
  }

  return <ServiceProgramForm mode="edit" initialData={program} programId={params.id as string} />;
}
