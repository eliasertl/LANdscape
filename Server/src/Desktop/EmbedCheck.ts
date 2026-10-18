import type { Embeddable, EmbedCheckResult } from '@landscape/shared';
import { assertHttpUrl, fetchFollowing, readBodyLimited } from './SafeFetch';

export interface HeaderVerdict {
  status: Embeddable;
  reason: string;
}

/**
 * Decides from response headers whether a page may be framed by `ourOrigin`.
 * frame-ancestors (CSP) wins over X-Frame-Options when both are present, as
 * browsers do.
 */
export function evaluateFrameHeaders(
  headers: { xFrameOptions: string | null; contentSecurityPolicy: string | null },
  ourOrigin: string | null,
  pageOrigin: string,
): HeaderVerdict {
  const frameAncestors = parseFrameAncestors(headers.contentSecurityPolicy);
  if (frameAncestors !== null) {
    if (frameAncestors.length === 0 || frameAncestors.includes("'none'")) {
      return { status: 'no', reason: "Content-Security-Policy frame-ancestors 'none' blocks embedding." };
    }
    if (frameAncestors.includes('*')) {
      return { status: 'yes', reason: 'Content-Security-Policy allows any frame ancestor.' };
    }
    for (const source of frameAncestors) {
      if (source === "'self'") {
        if (ourOrigin && sameOrigin(ourOrigin, pageOrigin)) return { status: 'yes', reason: 'Same origin as LANdscape.' };
        continue;
      }
      if (ourOrigin && sourceMatchesOrigin(source, ourOrigin)) {
        return { status: 'yes', reason: `Content-Security-Policy allows ${ourOrigin}.` };
      }
    }
    return {
      status: 'no',
      reason: `Content-Security-Policy frame-ancestors only allows: ${frameAncestors.join(' ')}.`,
    };
  }

  const xfo = headers.xFrameOptions?.split(',')[0]?.trim().toUpperCase() ?? null;
  if (xfo) {
    if (xfo === 'DENY') return { status: 'no', reason: 'X-Frame-Options: DENY blocks embedding.' };
    if (xfo === 'SAMEORIGIN') {
      if (ourOrigin && sameOrigin(ourOrigin, pageOrigin)) return { status: 'yes', reason: 'Same origin as LANdscape.' };
      return { status: 'no', reason: 'X-Frame-Options: SAMEORIGIN only allows framing from its own origin.' };
    }
    if (xfo.startsWith('ALLOW-FROM')) {
      return { status: 'no', reason: 'X-Frame-Options: ALLOW-FROM is treated as a block by modern browsers.' };
    }
    // Unknown/invalid values are ignored by browsers.
  }
  return { status: 'yes', reason: 'No framing restrictions found in the response headers.' };
}

/** Returns the frame-ancestors source list, or null if the directive is absent. */
export function parseFrameAncestors(csp: string | null): string[] | null {
  if (!csp) return null;
  // Multiple CSP headers may be joined with commas; the most restrictive wins,
  // so evaluate every policy and return the first one that defines the directive
  // as "blocked" if any does.
  const policies = csp.split(',');
  let found: string[] | null = null;
  for (const policy of policies) {
    for (const directive of policy.split(';')) {
      const tokens = directive.trim().split(/\s+/);
      if (tokens[0]?.toLowerCase() !== 'frame-ancestors') continue;
      const sources = tokens.slice(1).map((s) => s.toLowerCase()).filter(Boolean);
      if (found === null) found = sources;
      else found = intersectSources(found, sources);
    }
  }
  return found;
}

function intersectSources(a: string[], b: string[]): string[] {
  if (a.includes('*')) return b;
  if (b.includes('*')) return a;
  return a.filter((s) => b.includes(s));
}

function sameOrigin(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return ua.protocol === ub.protocol && ua.host === ub.host;
  } catch {
    return false;
  }
}

/** Matches a CSP host-source (with optional scheme and wildcard) against an origin. */
export function sourceMatchesOrigin(source: string, origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  const lowered = source.toLowerCase();
  if (lowered === 'http:' || lowered === 'https:') return url.protocol === lowered;
  let scheme: string | null = null;
  let hostPort = lowered;
  const schemeMatch = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/.exec(lowered);
  if (schemeMatch) {
    scheme = `${schemeMatch[1]}:`;
    hostPort = schemeMatch[2] ?? '';
  }
  if (scheme && scheme !== url.protocol && !(scheme === 'http:' && url.protocol === 'https:')) return false;
  hostPort = hostPort.replace(/\/.*$/, '');
  const [hostPart, portPart] = hostPort.split(':');
  const host = hostPart ?? '';
  const originPort = url.port || (url.protocol === 'https:' ? '443' : '80');
  if (portPart && portPart !== '*' && portPart !== originPort) return false;
  if (!portPart && url.port && scheme && !(scheme === 'http:' && url.protocol === 'https:')) {
    const defaultPort = scheme === 'https:' ? '443' : '80';
    if (url.port !== defaultPort) return false;
  }
  if (host.startsWith('*.')) {
    const suffix = host.slice(1);
    return url.hostname.endsWith(suffix) && url.hostname.length > suffix.length;
  }
  return host === url.hostname;
}

/**
 * Fetches the URL server-side (following redirects) and reports whether the
 * final document can be shown inside an iframe on LANdscape's origin.
 */
export async function checkEmbeddable(rawUrl: string, ourOrigin: string | null): Promise<EmbedCheckResult & { html: string | null }> {
  let url: URL;
  try {
    url = assertHttpUrl(rawUrl);
  } catch {
    return { status: 'unknown', reason: 'Invalid URL.', finalUrl: null, title: null, html: null };
  }
  try {
    const { response, finalUrl } = await fetchFollowing(url, {
      accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
    });
    const verdict = evaluateFrameHeaders(
      {
        xFrameOptions: response.headers.get('x-frame-options'),
        contentSecurityPolicy: response.headers.get('content-security-policy'),
      },
      ourOrigin,
      finalUrl.origin,
    );
    let html: string | null = null;
    let title: string | null = null;
    const contentType = response.headers.get('content-type') ?? '';
    if (/text\/html|application\/xhtml/i.test(contentType)) {
      try {
        html = (await readBodyLimited(response, 256 * 1024)).toString('utf8');
        title = extractTitle(html);
      } catch {
        html = null;
      }
    } else {
      await response.body?.cancel().catch(() => undefined);
    }
    let reason = verdict.reason;
    if (response.status >= 400) reason += ` (The server answered with HTTP ${response.status}.)`;
    return { status: verdict.status, reason, finalUrl: finalUrl.toString(), title, html };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: 'unknown',
      reason: `Could not reach the URL (${describeFetchError(message)}). The shortcut will be saved and can be re-checked later.`,
      finalUrl: null,
      title: null,
      html: null,
    };
  }
}

function describeFetchError(message: string): string {
  if (/abort/i.test(message)) return 'timed out';
  if (/ENOTFOUND|EAI_AGAIN/.test(message)) return 'host not found';
  if (/ECONNREFUSED/.test(message)) return 'connection refused';
  if (/ECONNRESET/.test(message)) return 'connection reset';
  if (/EHOSTUNREACH|ENETUNREACH/.test(message)) return 'host unreachable';
  if (/certificate/i.test(message)) return 'TLS error';
  return message.replace(/^fetch failed:?\s*/i, '') || 'network error';
}

export function extractTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match?.[1]) return null;
  const text = decodeEntities(match[1].replace(/\s+/g, ' ').trim());
  return text.length > 0 ? text.slice(0, 120) : null;
}

export function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}
