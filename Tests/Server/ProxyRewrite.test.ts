import { describe, expect, it } from 'vitest';
import {
  cookiePrefix,
  filterRequestCookies,
  forwardRequestHeaders,
  proxyOriginFromHost,
  rewriteLocation,
  rewriteResponseHeaders,
  rewriteSetCookie,
  stripFramingDirectives,
} from '@server/Proxy/Rewrite';

const target = 'http://10.0.0.5:3000';
const proxy = 'http://landscape.lan:8081';
const prefix = cookiePrefix(8081, 'ab12');

describe('framing headers', () => {
  it('removes X-Frame-Options and only the frame-ancestors directive', () => {
    const { headers } = rewriteResponseHeaders(
      {
        'x-frame-options': 'DENY',
        'content-security-policy': "default-src 'self'; frame-ancestors 'none'; script-src 'self' 'unsafe-eval'",
        'content-type': 'text/html',
      },
      { targetOrigin: target, proxyOrigin: proxy, cookiePrefix: prefix },
    );
    expect(headers['x-frame-options']).toBeUndefined();
    expect(headers['content-security-policy']).toBe("default-src 'self'; script-src 'self' 'unsafe-eval'");
    expect(headers['content-type']).toBe('text/html');
  });

  it('handles several policies, case and a policy that becomes empty', () => {
    expect(stripFramingDirectives("Frame-Ancestors 'self'")).toBeNull();
    expect(stripFramingDirectives("frame-ancestors 'none', img-src *; frame-ancestors 'self'")).toBe('img-src *');
    expect(stripFramingDirectives("default-src 'self';;  object-src 'none' ")).toBe("default-src 'self'; object-src 'none'");
    // The proxy is plain http, so upgrading subresources would break https targets.
    expect(stripFramingDirectives("default-src 'self'; upgrade-insecure-requests")).toBe("default-src 'self'");
    const { headers } = rewriteResponseHeaders({ 'content-security-policy': "frame-ancestors 'none'" }, { targetOrigin: target, proxyOrigin: proxy, cookiePrefix: prefix });
    expect(headers).not.toHaveProperty('content-security-policy');
  });

  it('drops hop-by-hop headers but keeps upgrade headers on a switched connection', () => {
    const incoming = { connection: 'keep-alive, x-private', 'keep-alive': 'timeout=5', 'x-private': '1', 'transfer-encoding': 'chunked', etag: '"1"' };
    const { headers } = rewriteResponseHeaders(incoming, { targetOrigin: target, proxyOrigin: proxy, cookiePrefix: prefix });
    expect(headers).toEqual({ etag: '"1"' });
    const upgraded = rewriteResponseHeaders({ connection: 'Upgrade', upgrade: 'websocket', 'sec-websocket-accept': 'x' }, { targetOrigin: target, proxyOrigin: proxy, cookiePrefix: prefix }, { upgrade: true });
    expect(upgraded.headers).toEqual({ connection: 'Upgrade', upgrade: 'websocket', 'sec-websocket-accept': 'x' });
  });
});

describe('Location rewriting', () => {
  it('maps absolute redirects to the target onto the proxy origin', () => {
    expect(rewriteLocation('http://10.0.0.5:3000/login?next=%2F#top', target, proxy)).toEqual({ value: 'http://landscape.lan:8081/login?next=%2F#top', foreign: false });
    expect(rewriteLocation('//10.0.0.5:3000/a', target, proxy)).toEqual({ value: 'http://landscape.lan:8081/a', foreign: false });
  });

  it('keeps relative redirects and passes other origins through', () => {
    expect(rewriteLocation('/login', target, proxy)).toEqual({ value: '/login', foreign: false });
    expect(rewriteLocation('../up', target, proxy)).toEqual({ value: '../up', foreign: false });
    expect(rewriteLocation('https://auth.example/sso', target, proxy)).toEqual({ value: 'https://auth.example/sso', foreign: true });
    // Same host, other scheme or port is another origin.
    expect(rewriteLocation('https://10.0.0.5:3000/', target, proxy).foreign).toBe(true);
    expect(rewriteLocation('http://10.0.0.5:3001/', target, proxy).foreign).toBe(true);
  });

  it('reports foreign redirects from the response rewriter', () => {
    const result = rewriteResponseHeaders({ location: 'https://elsewhere.example/' }, { targetOrigin: target, proxyOrigin: proxy, cookiePrefix: prefix });
    expect(result.headers.location).toBe('https://elsewhere.example/');
    expect(result.foreignRedirect).toBe('https://elsewhere.example/');
  });
});

describe('cookie isolation', () => {
  it('prefixes names and fixes attributes for plain-http, host-only cookies', () => {
    expect(rewriteSetCookie('session=abc; Path=/; Domain=10.0.0.5; Secure; HttpOnly; SameSite=None; Partitioned', prefix)).toBe(
      'lp8081_ab12_session=abc; Path=/; HttpOnly; SameSite=Lax',
    );
    expect(rewriteSetCookie('a=b=c; Max-Age=0; SameSite=Strict', prefix)).toBe('lp8081_ab12_a=b=c; Max-Age=0; SameSite=Strict');
    expect(rewriteSetCookie('theme=dark', prefix)).toBe('lp8081_ab12_theme=dark');
    expect(rewriteSetCookie('novalue', prefix)).toBeNull();
    expect(rewriteSetCookie('=x', prefix)).toBeNull();
  });

  it('round-trips __Host- and __Secure- cookies', () => {
    const set = rewriteSetCookie('__Host-sid=1; Path=/; Secure; HttpOnly', prefix);
    expect(set).toBe('lp8081_ab12___Host-sid=1; Path=/; HttpOnly');
    expect(filterRequestCookies('lp8081_ab12___Host-sid=1; lp8081_ab12___Secure-x=2', prefix)).toBe('__Host-sid=1; __Secure-x=2');
  });

  it('forwards only this assignment’s cookies, never LANdscape’s', () => {
    const header = 'landscape_session=s%3Aabc.sig; lp8081_ab12_session=mine; lp8082_cd34_session=other; lp8081_old1_session=stale; session=plain';
    expect(filterRequestCookies(header, prefix)).toBe('session=mine');
    expect(filterRequestCookies('landscape_session=x', prefix)).toBeNull();
    expect(filterRequestCookies(undefined, prefix)).toBeNull();
    expect(filterRequestCookies('lp8081_ab12_=x', prefix)).toBeNull();
  });

  it('rewrites every Set-Cookie of a response', () => {
    const { headers } = rewriteResponseHeaders({ 'set-cookie': ['a=1; Secure', 'bad', 'b=2'] }, { targetOrigin: target, proxyOrigin: proxy, cookiePrefix: prefix });
    expect(headers['set-cookie']).toEqual(['lp8081_ab12_a=1', 'lp8081_ab12_b=2']);
  });
});

describe('request headers', () => {
  const ctx = { targetOrigin: target, proxyOrigin: proxy, cookiePrefix: prefix };

  it('sets Host to the target and rewrites the proxy’s own Origin and Referer', () => {
    const out = forwardRequestHeaders(
      {
        host: 'landscape.lan:8081',
        origin: 'http://landscape.lan:8081',
        referer: 'http://landscape.lan:8081/page?x=1',
        cookie: 'landscape_session=secret; lp8081_ab12_sid=1',
        'x-forwarded-for': '1.2.3.4',
        connection: 'keep-alive',
        accept: 'text/html',
      },
      ctx,
    );
    expect(out).toEqual({
      host: '10.0.0.5:3000',
      origin: 'http://10.0.0.5:3000',
      referer: 'http://10.0.0.5:3000/page?x=1',
      cookie: 'sid=1',
      accept: 'text/html',
    });
  });

  it('leaves a foreign Origin alone so the target’s own CSRF checks still apply', () => {
    const out = forwardRequestHeaders({ host: 'landscape.lan:8081', origin: 'http://landscape.lan:8082', referer: 'http://landscape.lan:8080/' }, ctx);
    expect(out.origin).toBe('http://landscape.lan:8082');
    expect(out.referer).toBe('http://landscape.lan:8080/');
    expect(out).not.toHaveProperty('cookie');
  });

  it('keeps upgrade headers for WebSocket handshakes', () => {
    const out = forwardRequestHeaders({ host: 'landscape.lan:8081', connection: 'Upgrade', upgrade: 'websocket', 'sec-websocket-key': 'k' }, ctx, { upgrade: true });
    expect(out).toMatchObject({ connection: 'Upgrade', upgrade: 'websocket', 'sec-websocket-key': 'k', host: '10.0.0.5:3000' });
  });

  it('derives the proxy origin from a sane Host header only', () => {
    expect(proxyOriginFromHost('Server.LAN:8081')).toBe('http://server.lan:8081');
    expect(proxyOriginFromHost('[::1]:8081')).toBe('http://[::1]:8081');
    expect(proxyOriginFromHost(undefined)).toBeNull();
    expect(proxyOriginFromHost('evil.example/path')).toBeNull();
  });
});
