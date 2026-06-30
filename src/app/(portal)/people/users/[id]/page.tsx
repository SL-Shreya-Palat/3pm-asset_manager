'use client';

import { useParams } from 'next/navigation';
import { UserDetailPage } from '@/components/users/user-detail-page';

export default function UserDetailRoute() {
  const params = useParams<{ id: string }>();
  return <UserDetailPage userId={params.id} />;
}
