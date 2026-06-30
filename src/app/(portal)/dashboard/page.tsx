import { Truck, CircleCheck, Wrench, CircleSlash } from 'lucide-react';
import { getSession } from '@/lib/auth-3pm';
import { StatCard } from '@/components/ui/stat-card';

export default async function DashboardPage() {
  const session = await getSession();

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Welcome back{session?.firstName ? `, ${session.firstName}` : ''}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Assets" value="—" icon={<Truck />} />
        <StatCard label="Active" value="—" icon={<CircleCheck />} accent="text-emerald-600" />
        <StatCard label="In Shop" value="—" icon={<Wrench />} accent="text-amber-600" />
        <StatCard label="Out of Service" value="—" icon={<CircleSlash />} accent="text-red-600" />
      </div>
    </div>
  );
}
