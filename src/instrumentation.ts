/**
 * Next.js instrumentation — runs once on server startup.
 *
 * Used to auto-migrate pre-start form templates for all tenants whenever
 * the template schema version is bumped (e.g. fields added/removed).
 */
export async function register() {
  // Only run on the Node.js server runtime (not Edge).
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Ensure list/query indexes exist. `createIndex` is idempotent (a no-op when
    // the index is already present), so this is safe to run on every boot. Run
    // it fire-and-forget so a first-time build on a large collection can never
    // delay server startup; a failure only logs.
    import('@/lib/setup-indexes')
      .then(({ setupIndexes }) => setupIndexes())
      .catch((err) =>
        console.error('[INSTRUMENTATION] Index setup failed:', err),
      );

    // Fire-and-forget, like the index setup: this walks every tenant and can
    // call out to form-builder. On Render the service cold-starts after idle,
    // so awaiting it here made the FIRST user request of every wake pay for
    // the whole migration on top of the platform cold start.
    import('@/controller/seeding')
      .then(({ migrateAllTenantPrestartForms }) => migrateAllTenantPrestartForms())
      .then((results) => {
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
      })
      .catch((err) => {
        // Non-fatal — never blocks app startup.
        console.error('[INSTRUMENTATION] Pre-start template migration failed:', err);
      });
  }
}
