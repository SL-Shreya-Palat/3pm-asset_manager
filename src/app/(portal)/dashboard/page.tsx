import { getSession } from '@/lib/auth-3pm';
import { DashboardOverview } from '@/components/dashboard/dashboard-overview';
import { DashboardWidgets } from '@/components/dashboard/dashboard-widgets';

export default async function DashboardPage() {
  const session = await getSession();

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Welcome back{session?.firstName ? `, ${session.firstName}` : ''}
        </p>
      </div>

      <DashboardOverview />

      <DashboardWidgets />
    </div>
  );
}
