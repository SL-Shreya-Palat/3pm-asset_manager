/**
 * Next.js instrumentation — runs once on server startup.
 *
 * Used to auto-migrate pre-start form templates for all tenants whenever
 * the template schema version is bumped (e.g. fields added/removed).
 */
export async function register() {
  // Only run on the Node.js server runtime (not Edge).
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { migrateAllTenantPrestartForms } = await import('@/controller/seeding');

    try {
      const results = await migrateAllTenantPrestartForms();
      if (results.length > 0) {
        const updated = results.filter((r) => r.status === 'updated').length;
        const errors = results.filter((r) => r.status === 'error').length;
        console.log(
          `[INSTRUMENTATION] Pre-start template migration: ${updated} tenants updated, ${errors} errors`,
        );
        for (const r of results.filter((r) => r.status === 'error')) {
          console.error(`[INSTRUMENTATION]   ✗ ${r.tenantName}: ${r.error}`);
        }
      }
    } catch (err) {
      // Non-fatal — don't block app startup.
      console.error('[INSTRUMENTATION] Pre-start template migration failed:', err);
    }
  }
}
