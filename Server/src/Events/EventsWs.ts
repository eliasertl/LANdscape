import type { FastifyInstance } from 'fastify';
import type { ServerContext } from '../Context';
import { sendJson } from '../Http/WsUtils';

/**
 * /ws/events: server → client only. Every open desktop receives new
 * notifications, read/clear changes and monitor status changes, so all
 * browsers stay in sync without polling. The guard requires a session and a
 * same-origin Origin like for the other sockets.
 */
export function registerEventsWs(app: FastifyInstance, ctx: ServerContext): void {
  app.get('/ws/events', { websocket: true }, (socket) => {
    const unsubscribe = ctx.events.subscribe((message) => sendJson(socket, message));
    socket.on('message', () => undefined);
    socket.on('close', unsubscribe);
    socket.on('error', unsubscribe);
  });
}
