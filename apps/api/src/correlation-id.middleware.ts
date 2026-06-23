import { randomUUID } from 'crypto';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

type CorrelationRequest = {
  correlationId?: string;
  headers?: Record<string, string | string[] | undefined>;
};

type CorrelationResponse = {
  setHeader(name: string, value: string): void;
};

function incomingCorrelationId(value: string | string[] | undefined) {
  const text = Array.isArray(value) ? value[0] : value;
  if (!text || text.length > 120) return undefined;
  return /^[a-zA-Z0-9._:-]+$/.test(text) ? text : undefined;
}

export function createCorrelationIdMiddleware() {
  return (request: CorrelationRequest, response: CorrelationResponse, next: () => void) => {
    const correlationId = incomingCorrelationId(request.headers?.[CORRELATION_ID_HEADER]) || randomUUID();
    request.correlationId = correlationId;
    response.setHeader(CORRELATION_ID_HEADER, correlationId);
    next();
  };
}
