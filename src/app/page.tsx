import { redirect } from 'next/navigation';

/**
 * Root page — always redirects to /dashboard.
 * Middleware handles unauthenticated users by sending them to the IdP.
 */
export default function Home() {
  redirect('/dashboard');
}
