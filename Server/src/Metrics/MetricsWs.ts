import type { FastifyInstance } from 'fastify';
import { metricsClientMessageSchema, type MetricsServerMessage } from '@landscape/shared';
import type { ServerContext } from '../Context';
import { guardSocket, rawToString } from '../Http/WsUtils';

/**
 * /ws/metrics: the client subscribes per metric with an interval; the hub
 * samples each metric at the fastest requested interval and fans results out.
 */
export function registerMetricsWs(app: FastifyInstance, ctx: ServerContext): void {
  app.get('/ws/metrics', { websocket: true }, (socket) => {
    const send = (message: MetricsServerMessage) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    };
    const subscriber = ctx.metrics.addSubscriber(send);

    guardSocket(socket, ctx.log, (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawToString(raw));
      } catch {
        send({ type: 'error', message: 'Invalid JSON' });
        return;
      }
      const result = metricsClientMessageSchema.safeParse(parsed);
      if (!result.success) {
        send({ type: 'error', message: 'Invalid message' });
        return;
      }
      const message = result.data;
      if (message.type === 'subscribe') subscriber.subscribe(message.metric, message.intervalMs);
      else subscriber.unsubscribe(message.metric);
    });

    socket.on('close', () => subscriber.dispose());
    socket.on('error', () => subscriber.dispose());
  });
}
