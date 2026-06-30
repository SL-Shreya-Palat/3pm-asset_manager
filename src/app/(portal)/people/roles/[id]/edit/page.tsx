'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import axios from 'axios';
import { RoleForm } from '@/components/roles/role-form';
import { Spinner } from '@/components/ui/spinner';

export default function EditRolePage() {
  const params = useParams<{ id: string }>();
  const [roleData, setRoleData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchRole() {
      try {
        const res = await axios.get(`/api/roles/${params.id}`, { withCredentials: true });
        setRoleData(res.data.data);
      } catch {
        setError('Failed to load role');
      } finally {
        setLoading(false);
      }
    }
    fetchRole();
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (error || !roleData) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-destructive">{error || 'Role not found'}</p>
      </div>
    );
  }

  return <RoleForm mode="edit" initialData={roleData} roleId={params.id} />;
}
