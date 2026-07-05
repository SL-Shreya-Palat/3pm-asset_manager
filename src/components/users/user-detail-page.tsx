'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageBackButton } from '@/components/ui/page-back-button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import type { UserRow } from './types';

const USER_TABS = ['General Details', 'Notifications', 'Team Management', 'Permissions'] as const;
type UserTab = (typeof USER_TABS)[number];

interface UserDetailPageProps {
  userId: string;
}

export function UserDetailPage({ userId }: UserDetailPageProps) {
  const router = useRouter();
  const [user, setUser] = useState<UserRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<UserTab>('General Details');

  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await axios.get(`/api/users/${userId}`, { withCredentials: true });
        setUser(res.data.data);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    fetchUser();
  }, [userId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">User not found.</p>
        <button
          onClick={() => router.push('/people/users')}
          className="text-sm text-primary hover:underline mt-2"
        >
          Back to Users
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 pt-6 pb-4">
        <PageBackButton href="/people/users" />
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <User className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              {user.firstName} {user.lastName}
            </h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border px-6">
        <div className="flex gap-0">
          {USER_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
                activeTab === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'General Details' && <GeneralDetailsTab user={user} />}
        {activeTab === 'Notifications' && <PlaceholderTab label="Notifications" />}
        {activeTab === 'Team Management' && <PlaceholderTab label="Team Management" />}
        {activeTab === 'Permissions' && <PlaceholderTab label="Permissions" />}
      </div>
    </div>
  );
}

function GeneralDetailsTab({ user }: { user: UserRow }) {
  return (
    <div className="max-w-2xl">
      <div className="rounded-lg border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold text-foreground mb-4">General Information</h2>
        <Separator className="mb-4" />

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <DetailField label="First Name" value={user.firstName} />
            <DetailField label="Last Name" value={user.lastName} />
          </div>
          <DetailField label="Email" value={user.email} />
          <DetailField label="Role" value={user.roleName} />
          <DetailField label="Mobile Number" value={user.mobileNumber} />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Status</p>
              <div className="mt-1">
                <Badge variant={user.isActive ? 'default' : 'secondary'}>
                  {user.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </div>
            <DetailField
              label="Portal User"
              value={user.portalUser ? 'Yes' : 'No'}
            />
          </div>
          <DetailField label="Created At" value={user.createdAt ? new Date(user.createdAt).toLocaleDateString() : undefined} />
        </div>
      </div>
    </div>
  );
}

function PlaceholderTab({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-48 rounded-lg border border-dashed border-border">
      <p className="text-sm text-muted-foreground">{label} — coming soon</p>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground mt-0.5">{value || '—'}</p>
    </div>
  );
}
