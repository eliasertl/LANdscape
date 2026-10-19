import type { ServerResponse } from 'node:http';

/**
 * Tiny self-contained pages the proxy answers with itself. No scripts, no
 * external resources, and no framing restrictions (they are shown inside the
 * LANdscape window that framed the proxy port).
 */
function page(title: string, message: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(title)}</title>
<style>
  html, body { height: 100%; margin: 0; }
  body { display: flex; align-items: center; justify-content: center; padding: 16px; box-sizing: border-box;
    font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; color: #6e6e73; background: #fff; text-align: center; }
  h1 { font-size: 15px; font-weight: 600; color: #000; margin: 0 0 6px; }
  p { margin: 0; max-width: 420px; }
  @media (prefers-color-scheme: dark) { body { background: #000; color: #98989f; } h1 { color: #fff; } }
</style>
</head>
<body><div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></div></body>
</html>
`;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function sendProxyPage(res: ServerResponse, status: number, title: string, message: string): void {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  const body = page(title, message);
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  });
  res.end(body);
}

export const LOGIN_REQUIRED = {
  title: 'Log in to LANdscape to use this service.',
  message: 'This port belongs to the LANdscape embed proxy. Open LANdscape, log in, and open the shortcut again.',
};
