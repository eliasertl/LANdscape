import type { FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';

/**
 * LANdscape must never be framed itself, but it frames arbitrary http(s)
 * services, so frame-src is wide open while frame-ancestors is closed.
 */
export async function installSecurityHeaders(app: FastifyInstance): Promise<void> {
  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        // xterm.js and CodeMirror inject <style> elements at runtime.
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'blob:'],
        'font-src': ["'self'", 'data:'],
        'connect-src': ["'self'", 'ws:', 'wss:'],
        'frame-src': ['http:', 'https:'],
        'worker-src': ["'self'", 'blob:'],
        'media-src': ["'self'", 'blob:'],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
      },
    },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    // No TLS here (LAN/VPN), so HSTS would be misleading behind a plain-http origin.
    strictTransportSecurity: false,
    originAgentCluster: true,
    xContentTypeOptions: true,
    xDnsPrefetchControl: { allow: false },
    xDownloadOptions: true,
    xPermittedCrossDomainPolicies: { permittedPolicies: 'none' },
    xPoweredBy: false,
    xXssProtection: false,
  });

  app.addHook('onSend', async (_request, reply) => {
    void reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  });
}
