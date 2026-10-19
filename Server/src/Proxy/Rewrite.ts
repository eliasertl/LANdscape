import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'node:http';

/**
 * Pure header rewriting for the embed proxy. The proxy is transparent: bodies
 * are never touched, only the headers that stop a page from being framed or
 * that tie cookies and redirects to the target's own origin.
 */

/** Headers that describe one connection and must not be forwarded (RFC 9110 §7.6.1). */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

/** Request headers the proxy sets itself or never passes on. */
const REQUEST_DROP = new Set(['host', 'cookie', 'forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-port', 'x-real-ip']);

/** Cookie prefix for one proxy assignment, e.g. `lp8081_k3f9_`. */
export function cookiePrefix(port: number, tag: string): string {
  return `lp${port}_${tag}_`;
}

/** `http://<host>` the browser used to reach the proxy port, or null without a usable Host header. */
export function proxyOriginFromHost(host: string | undefined): string | null {
  if (!host || !/^[A-Za-z0-9.\-[\]:]+$/.test(host)) return null;
  return `http://${host.toLowerCase()}`;
}

function listedInConnection(headers: IncomingHttpHeaders): Set<string> {
  const value = headers.connection;
  if (typeof value !== 'string') return new Set();
  return new Set(
    value
      .split(',')
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean),
  );
}

export interface ForwardContext {
  /** Target origin, e.g. `http://192.168.1.10:3000`. */
  targetOrigin: string;
  /** Origin of the proxy port as seen by the browser, e.g. `http://server:8081`. */
  proxyOrigin: string;
  cookiePrefix: string;
}

/**
 * Builds the headers sent to the target. Host is the target's; Origin and
 * Referer are rewritten only when they point at the proxy origin itself, so a
 * request from some *other* origin keeps its foreign Origin and the target's
 * own CSRF checks still see it. Only this assignment's cookies are forwarded,
 * with the prefix removed — LANdscape's session cookie never leaves.
 */
export function forwardRequestHeaders(incoming: IncomingHttpHeaders, ctx: ForwardContext, options: { upgrade?: boolean } = {}): OutgoingHttpHeaders {
  const connectionListed = listedInConnection(incoming);
  const out: OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(incoming)) {
    if (value === undefined) continue;
    if (HOP_BY_HOP.has(name) || REQUEST_DROP.has(name) || connectionListed.has(name)) continue;
    out[name] = value;
  }
  out.host = new URL(ctx.targetOrigin).host;

  const origin = incoming.origin;
  if (typeof origin === 'string' && sameOrigin(origin, ctx.proxyOrigin)) out.origin = ctx.targetOrigin;

  const referer = incoming.referer;
  if (typeof referer === 'string') {
    const rewritten = rebaseUrl(referer, ctx.proxyOrigin, ctx.targetOrigin);
    if (rewritten !== null) out.referer = rewritten;
  }

  const cookie = filterRequestCookies(incoming.cookie, ctx.cookiePrefix);
  if (cookie) out.cookie = cookie;

  if (options.upgrade) {
    out.connection = 'Upgrade';
    if (typeof incoming.upgrade === 'string') out.upgrade = incoming.upgrade;
  }
  return out;
}

export interface ResponseContext {
  targetOrigin: string;
  proxyOrigin: string;
  cookiePrefix: string;
}

export interface RewrittenResponseHeaders {
  headers: OutgoingHttpHeaders;
  /** Set when a redirect pointed at another origin and was passed through untouched. */
  foreignRedirect: string | null;
}

/**
 * Builds the headers sent back to the browser: framing restrictions removed,
 * cookies renamed into this port's namespace, redirects to the target mapped
 * onto the proxy origin. Everything else passes through.
 */
export function rewriteResponseHeaders(incoming: IncomingHttpHeaders, ctx: ResponseContext, options: { upgrade?: boolean } = {}): RewrittenResponseHeaders {
  const connectionListed = listedInConnection(incoming);
  const out: OutgoingHttpHeaders = {};
  let foreignRedirect: string | null = null;
  for (const [name, value] of Object.entries(incoming)) {
    if (value === undefined) continue;
    if (options.upgrade && (name === 'connection' || name === 'upgrade')) {
      out[name as string] = value;
      continue;
    }
    if (HOP_BY_HOP.has(name) || connectionListed.has(name)) continue;
    switch (name) {
      case 'x-frame-options':
        break;
      case 'content-security-policy': {
        const policy = stripFramingDirectives(Array.isArray(value) ? value.join(', ') : value);
        if (policy) out[name] = policy;
        break;
      }
      case 'set-cookie': {
        const cookies = (Array.isArray(value) ? value : [value]).map((c) => rewriteSetCookie(c, ctx.cookiePrefix)).filter((c): c is string => c !== null);
        if (cookies.length > 0) out[name] = cookies;
        break;
      }
      case 'location': {
        const location = Array.isArray(value) ? (value[0] ?? '') : value;
        const result = rewriteLocation(location, ctx.targetOrigin, ctx.proxyOrigin);
        out[name] = result.value;
        if (result.foreign) foreignRedirect = location;
        break;
      }
      default:
        out[name] = value;
    }
  }
  return { headers: out, foreignRedirect };
}

/**
 * Removes `frame-ancestors` from a CSP header value (possibly several
 * comma-joined policies) and keeps every other directive. Also drops
 * `upgrade-insecure-requests`, which would send every subresource of an
 * https target to https on the plain-http proxy port and break the page.
 * Returns null when nothing is left.
 */
export function stripFramingDirectives(csp: string): string | null {
  const policies = csp
    .split(',')
    .map((policy) =>
      policy
        .split(';')
        .map((directive) => directive.trim())
        .filter((directive) => {
          if (!directive) return false;
          const name = directive.split(/\s+/)[0]?.toLowerCase();
          return name !== 'frame-ancestors' && name !== 'upgrade-insecure-requests';
        })
        .join('; '),
    )
    .filter(Boolean);
  return policies.length > 0 ? policies.join(', ') : null;
}

/**
 * Renames a Set-Cookie into this assignment's namespace so proxied apps cannot
 * clobber each other's (or LANdscape's) cookies. Domain is dropped (host-only
 * cookie), Secure and Partitioned are dropped (the proxy is plain http), and
 * SameSite=None — which requires Secure — becomes Lax. `__Host-`/`__Secure-`
 * names stop being special once prefixed, so they work without Secure, and the
 * original name comes back on the way in. Returns null for malformed cookies.
 */
export function rewriteSetCookie(header: string, prefix: string): string | null {
  const parts = header.split(';');
  const pair = parts.shift()?.trim() ?? '';
  const eq = pair.indexOf('=');
  if (eq <= 0) return null;
  const name = pair.slice(0, eq).trim();
  const value = pair.slice(eq + 1).trim();
  if (!name) return null;
  const attributes: string[] = [];
  for (const raw of parts) {
    const attribute = raw.trim();
    if (!attribute) continue;
    const key = (attribute.split('=')[0] ?? '').trim().toLowerCase();
    if (key === 'domain' || key === 'secure' || key === 'partitioned') continue;
    if (key === 'samesite') {
      const mode = (attribute.split('=')[1] ?? '').trim().toLowerCase();
      attributes.push(mode === 'strict' ? 'SameSite=Strict' : 'SameSite=Lax');
      continue;
    }
    attributes.push(attribute);
  }
  return [`${prefix}${name}=${value}`, ...attributes].join('; ');
}

/** Keeps only cookies in this assignment's namespace and strips the prefix. Null when none remain. */
export function filterRequestCookies(header: string | undefined, prefix: string): string | null {
  if (!header) return null;
  const kept: string[] = [];
  for (const raw of header.split(';')) {
    const pair = raw.trim();
    if (!pair.startsWith(prefix)) continue;
    const rest = pair.slice(prefix.length);
    if (!rest || rest.startsWith('=')) continue;
    kept.push(rest);
  }
  return kept.length > 0 ? kept.join('; ') : null;
}

/**
 * Maps an absolute redirect to the target onto the proxy origin. Relative
 * redirects already stay on the proxy. Redirects to any other origin pass
 * through unchanged (the proxy never follows or forwards to other hosts).
 */
export function rewriteLocation(location: string, targetOrigin: string, proxyOrigin: string): { value: string; foreign: boolean } {
  const trimmed = location.trim();
  const isAbsolute = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith('//');
  if (!isAbsolute) return { value: location, foreign: false };
  const rewritten = rebaseUrl(trimmed, targetOrigin, proxyOrigin);
  if (rewritten !== null) return { value: rewritten, foreign: false };
  return { value: location, foreign: true };
}

/** If `url` belongs to origin `from`, returns the same path on origin `to`; otherwise null. */
function rebaseUrl(url: string, from: string, to: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url, from);
  } catch {
    return null;
  }
  if (!sameOrigin(parsed.origin, from)) return null;
  return `${to}${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}
