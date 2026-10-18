import type { FastifyRequest } from 'fastify';

/** The origin a same-origin browser request should carry: scheme + host of this server. */
export function expectedOrigin(request: FastifyRequest): string | null {
  const host = request.headers.host;
  if (!host) return null;
  return `${request.protocol}://${host}`.toLowerCase();
}

/** True when the request's Origin header matches our own origin. Missing Origin counts as a mismatch. */
export function hasSameOrigin(request: FastifyRequest): boolean {
  const origin = request.headers.origin;
  if (typeof origin !== 'string' || origin.length === 0) return false;
  const expected = expectedOrigin(request);
  return expected !== null && origin.toLowerCase() === expected;
}

export function clientIp(request: FastifyRequest): string {
  return request.ip || 'unknown';
}
