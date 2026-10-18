import { Agent, fetch as undiciFetch, type Response } from 'undici';

/**
 * Fetch for server-side checks of user-provided URLs: http(s) only, bounded
 * time and size, no credentials, and tolerant of self-signed LAN certificates
 * (nothing sensitive is sent, so a MITM only sees what the user asked for).
 */
const agent = new Agent({
  connect: { rejectUnauthorized: false, timeout: 8000 },
  headersTimeout: 8000,
  bodyTimeout: 8000,
});

export const FETCH_TIMEOUT_MS = 8000;
export const MAX_REDIRECTS = 5;

export class FetchLimitError extends Error {
  override name = 'FetchLimitError';
}

export function assertHttpUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http and https URLs can be fetched');
  }
  return url;
}

export interface SafeFetchOptions {
  accept?: string;
  method?: 'GET' | 'HEAD';
  timeoutMs?: number;
}

/** Performs a single request without following redirects (the caller handles hops). */
export async function fetchOnce(url: URL, options: SafeFetchOptions = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? FETCH_TIMEOUT_MS);
  try {
    return await undiciFetch(url, {
      method: options.method ?? 'GET',
      redirect: 'manual',
      dispatcher: agent,
      signal: controller.signal,
      headers: {
        'user-agent': 'LANdscape/1.0 (+https://github.com/eliasertl/LANdscape)',
        accept: options.accept ?? '*/*',
        'accept-language': 'en',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Follows up to MAX_REDIRECTS same-protocol-family redirects and returns the final response. */
export async function fetchFollowing(
  start: URL,
  options: SafeFetchOptions = {},
): Promise<{ response: Response; finalUrl: URL; hops: number }> {
  let current = start;
  for (let hops = 0; hops <= MAX_REDIRECTS; hops += 1) {
    const response = await fetchOnce(current, options);
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel().catch(() => undefined);
      const next = new URL(location, current);
      if (next.protocol !== 'http:' && next.protocol !== 'https:') throw new Error('Redirect to a non-http URL');
      current = next;
      continue;
    }
    return { response, finalUrl: current, hops };
  }
  throw new Error('Too many redirects');
}

/** Reads a body up to maxBytes; throws FetchLimitError when exceeded. */
export async function readBodyLimited(response: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new FetchLimitError(`Response larger than ${maxBytes} bytes`);
  }
  if (!response.body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  const body = response.body as unknown as AsyncIterable<Uint8Array>;
  let exceeded = false;
  for await (const chunk of body) {
    total += chunk.byteLength;
    if (total > maxBytes) {
      exceeded = true;
      break;
    }
    chunks.push(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength));
  }
  if (exceeded) {
    await response.body.cancel().catch(() => undefined);
    throw new FetchLimitError(`Response larger than ${maxBytes} bytes`);
  }
  return Buffer.concat(chunks);
}
