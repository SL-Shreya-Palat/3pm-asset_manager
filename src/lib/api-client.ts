/**
 * Configured Axios instance — one client for all API calls.
 *
 * Components use typed wrapper functions (e.g. `getAsset(id)`), never raw
 * `fetch` or `axios.get` inline.
 */
import axios from 'axios';
import type { BaseResponse } from '@/types/auth';

const apiClient = axios.create({
  baseURL: '',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Redirect to login on 401
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 &&
      typeof window !== 'undefined' &&
      !window.location.pathname.startsWith('/api/auth')
    ) {
      window.location.href = `/api/auth/login?returnUrl=${encodeURIComponent(window.location.pathname)}`;
    }
    return Promise.reject(error);
  },
);

export default apiClient;

/** Unwrap the `{ data, error }` envelope, throw on error. */
export function unwrapResponse<T>(response: BaseResponse<T>): T {
  if (response.error || !response.data) {
    throw new Error(response.error || 'Unknown error');
  }
  return response.data;
}
