import { useCallback, useEffect, useState } from 'react';
import type { ProxyLease } from '@landscape/shared';
import { ApiRequestError, api, errorMessage } from '../Api/Http';

const RENEW_MS = 20_000;

export type LeaseState = { status: 'pending' } | { status: 'ready'; port: number } | { status: 'error'; message: string };

function releaseLease(leaseId: string): void {
  // keepalive lets the request finish while the page unloads.
  void fetch(`/api/proxy/leases/${leaseId}`, { method: 'DELETE', credentials: 'same-origin', keepalive: true }).catch(() => undefined);
}

/**
 * Keeps the shortcut's embed proxy port open while the window shows it.
 * The server opens a port only while a lease on it is alive (see
 * Server/src/Proxy/ProxyManager.ts): this hook leases it before the iframe
 * loads, renews it, re-leases transparently when it expired (a laptop that
 * slept), and releases it when the window closes.
 */
export function useProxyLease(shortcutId: string, enabled: boolean): { state: LeaseState; retry: () => void } {
  const [state, setState] = useState<LeaseState>({ status: 'pending' });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let leaseId: string | null = null;
    let timer: number | null = null;

    const acquire = async () => {
      const lease = await api.post<ProxyLease>('/api/proxy/leases', { shortcutId });
      if (cancelled) {
        releaseLease(lease.leaseId);
        return;
      }
      leaseId = lease.leaseId;
      setState({ status: 'ready', port: lease.port });
    };

    const renew = async () => {
      if (!leaseId) return;
      try {
        await api.post(`/api/proxy/leases/${leaseId}/renew`);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiRequestError && error.status === 404) {
          leaseId = null;
          await acquire().catch((err: unknown) => setState({ status: 'error', message: errorMessage(err) }));
        }
        // Other failures (network blips) are retried on the next tick.
      }
    };

    setState({ status: 'pending' });
    acquire()
      .then(() => {
        if (cancelled) return;
        timer = window.setInterval(() => void renew(), RENEW_MS);
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: 'error', message: errorMessage(error) });
      });

    const onVisible = () => {
      if (document.visibilityState === 'visible') void renew();
    };
    const onPageHide = () => {
      if (leaseId) releaseLease(leaseId);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', onPageHide);
      if (leaseId) releaseLease(leaseId);
    };
  }, [shortcutId, enabled, attempt]);

  return { state, retry };
}
