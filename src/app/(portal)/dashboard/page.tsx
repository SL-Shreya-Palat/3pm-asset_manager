import { getSession } from '@/lib/auth-3pm';

export default async function DashboardPage() {
  const session = await getSession();

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Welcome back{session?.firstName ? `, ${session.firstName}` : ''}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">Total Assets</p>
          <p className="text-2xl font-bold mt-1">—</p>
        </div>
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">Active</p>
          <p className="text-2xl font-bold mt-1">—</p>
        </div>
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">In Shop</p>
          <p className="text-2xl font-bold mt-1">—</p>
        </div>
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">Out of Service</p>
          <p className="text-2xl font-bold mt-1">—</p>
        </div>
      </div>
    </div>
  );
}
