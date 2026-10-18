import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError, type ZodType } from 'zod';

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, 'bad_request', message, details);
export const unauthorized = (message = 'Authentication required') => new HttpError(401, 'unauthorized', message);
export const forbidden = (message = 'Forbidden') => new HttpError(403, 'forbidden', message);
export const notFound = (message = 'Not found') => new HttpError(404, 'not_found', message);
export const conflict = (message: string) => new HttpError(409, 'conflict', message);
export const tooLarge = (message = 'Payload too large') => new HttpError(413, 'payload_too_large', message);
export const unavailable = (code: string, message: string) => new HttpError(503, code, message);

/** Parses with a zod schema and converts failures into a 400 with field details. */
export function parseOrThrow<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const details = result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
  const first = details[0];
  throw badRequest(first ? `${first.path ? `${first.path}: ` : ''}${first.message}` : 'Invalid input', details);
}

export function errorHandler(error: FastifyError | HttpError | Error, request: FastifyRequest, reply: FastifyReply): void {
  if (error instanceof HttpError) {
    void reply
      .status(error.statusCode)
      .send({ error: { code: error.code, message: error.message, details: error.details } });
    return;
  }
  if (error instanceof ZodError) {
    void reply.status(400).send({ error: { code: 'bad_request', message: 'Invalid input', details: error.issues } });
    return;
  }
  const fastifyError = error as FastifyError;
  const status = typeof fastifyError.statusCode === 'number' ? fastifyError.statusCode : 500;
  if (status >= 500) {
    request.log.error({ err: error, url: request.url }, 'Unhandled error');
    void reply.status(status).send({ error: { code: 'internal_error', message: 'Internal server error' } });
    return;
  }
  void reply.status(status).send({
    error: { code: fastifyError.code?.toLowerCase() ?? 'error', message: error.message },
  });
}
