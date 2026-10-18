import { describe, expect, it } from 'vitest';
import { evaluateFrameHeaders, extractTitle, parseFrameAncestors, sourceMatchesOrigin } from '@server/Desktop/EmbedCheck';

const ours = 'http://landscape.lan:8080';
const page = 'https://service.example';

describe('frame header evaluation', () => {
  it('allows pages without restrictions', () => {
    expect(evaluateFrameHeaders({ xFrameOptions: null, contentSecurityPolicy: null }, ours, page).status).toBe('yes');
    expect(evaluateFrameHeaders({ xFrameOptions: null, contentSecurityPolicy: "default-src 'self'; script-src 'self'" }, ours, page).status).toBe('yes');
  });

  it('blocks on X-Frame-Options DENY and SAMEORIGIN', () => {
    expect(evaluateFrameHeaders({ xFrameOptions: 'DENY', contentSecurityPolicy: null }, ours, page).status).toBe('no');
    expect(evaluateFrameHeaders({ xFrameOptions: 'sameorigin', contentSecurityPolicy: null }, ours, page).status).toBe('no');
    expect(evaluateFrameHeaders({ xFrameOptions: 'ALLOW-FROM https://x', contentSecurityPolicy: null }, ours, page).status).toBe('no');
  });

  it('treats SAMEORIGIN as allowed when the page shares our origin', () => {
    expect(evaluateFrameHeaders({ xFrameOptions: 'SAMEORIGIN', contentSecurityPolicy: null }, ours, ours).status).toBe('yes');
  });

  it('ignores unknown X-Frame-Options values like browsers do', () => {
    expect(evaluateFrameHeaders({ xFrameOptions: 'ALLOWALL', contentSecurityPolicy: null }, ours, page).status).toBe('yes');
  });

  it('lets frame-ancestors win over X-Frame-Options', () => {
    expect(evaluateFrameHeaders({ xFrameOptions: 'DENY', contentSecurityPolicy: 'frame-ancestors *' }, ours, page).status).toBe('yes');
    expect(evaluateFrameHeaders({ xFrameOptions: null, contentSecurityPolicy: "frame-ancestors 'none'" }, ours, page).status).toBe('no');
    expect(evaluateFrameHeaders({ xFrameOptions: null, contentSecurityPolicy: "default-src 'self'; frame-ancestors 'self'" }, ours, page).status).toBe('no');
  });

  it('matches our origin against frame-ancestors host sources', () => {
    expect(evaluateFrameHeaders({ xFrameOptions: null, contentSecurityPolicy: 'frame-ancestors http://landscape.lan:8080' }, ours, page).status).toBe('yes');
    expect(evaluateFrameHeaders({ xFrameOptions: null, contentSecurityPolicy: 'frame-ancestors landscape.lan:8080' }, ours, page).status).toBe('yes');
    expect(evaluateFrameHeaders({ xFrameOptions: null, contentSecurityPolicy: 'frame-ancestors *.lan:*' }, ours, page).status).toBe('yes');
    expect(evaluateFrameHeaders({ xFrameOptions: null, contentSecurityPolicy: 'frame-ancestors http:' }, ours, page).status).toBe('yes');
    expect(evaluateFrameHeaders({ xFrameOptions: null, contentSecurityPolicy: 'frame-ancestors https://other.example' }, ours, page).status).toBe('no');
    expect(evaluateFrameHeaders({ xFrameOptions: null, contentSecurityPolicy: 'frame-ancestors https:' }, ours, page).status).toBe('no');
  });

  it('parses multiple policies and keeps the most restrictive', () => {
    expect(parseFrameAncestors("frame-ancestors *, frame-ancestors 'none'")).toEqual(["'none'"]);
    expect(evaluateFrameHeaders({ xFrameOptions: null, contentSecurityPolicy: "frame-ancestors *, frame-ancestors 'none'" }, ours, page).status).toBe('no');
    expect(parseFrameAncestors('frame-ancestors a.example b.example, frame-ancestors b.example')).toEqual(['b.example']);
    expect(parseFrameAncestors("default-src 'self'")).toBeNull();
    expect(parseFrameAncestors(null)).toBeNull();
  });
});

describe('source matching', () => {
  it('handles wildcards, schemes and ports', () => {
    expect(sourceMatchesOrigin('*.lan', 'http://landscape.lan:8080')).toBe(true);
    expect(sourceMatchesOrigin('*.lan', 'http://lan')).toBe(false);
    expect(sourceMatchesOrigin('landscape.lan', 'http://landscape.lan:8080')).toBe(true);
    expect(sourceMatchesOrigin('landscape.lan:9000', 'http://landscape.lan:8080')).toBe(false);
    expect(sourceMatchesOrigin('https://landscape.lan', 'http://landscape.lan')).toBe(false);
    expect(sourceMatchesOrigin('http://landscape.lan', 'https://landscape.lan')).toBe(true);
    expect(sourceMatchesOrigin('http://landscape.lan', 'http://landscape.lan:8080')).toBe(false);
  });
});

describe('title extraction', () => {
  it('decodes entities and trims whitespace', () => {
    expect(extractTitle('<html><head><title>\n  Tom &amp; Jerry &#8211; Home </title></head></html>')).toBe('Tom & Jerry – Home');
    expect(extractTitle('<html><head></head></html>')).toBeNull();
    expect(extractTitle('<TITLE lang="en">Upper</TITLE>')).toBe('Upper');
  });
});
