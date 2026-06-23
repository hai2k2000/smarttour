import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';

type ErrorBody = Record<string, unknown>;
type HttpRequest = { url: string; method: string };
type HttpResponse = { status(statusCode: number): { json(body: unknown): unknown } };

function bodyFromException(exception: HttpException): ErrorBody {
  const response = exception.getResponse();
  if (response && typeof response === 'object' && !Array.isArray(response)) return response as ErrorBody;
  return { message: response || exception.message };
}

function messagesFrom(value: unknown, fallback: string) {
  if (Array.isArray(value)) {
    const messages = value.map((item) => String(item)).filter(Boolean);
    return messages.length ? messages : [fallback];
  }
  if (typeof value === 'string' && value.trim()) return [value];
  return [fallback];
}

function codeFrom(error: unknown, statusCode: number) {
  if (typeof error === 'string' && error.trim()) {
    return error
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase() || `HTTP_${statusCode}`;
  }
  return `HTTP_${statusCode}`;
}

@Catch(HttpException)
export class HttpErrorResponseFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<HttpResponse>();
    const request = context.getRequest<HttpRequest>();
    const statusCode = exception.getStatus();
    const body = bodyFromException(exception);
    const error = typeof body.error === 'string' && body.error.trim() ? body.error : exception.name;
    const fallback = error || `HTTP ${statusCode}`;
    const message = body.message ?? exception.message ?? fallback;
    const messages = Array.isArray(body.messages) ? messagesFrom(body.messages, fallback) : messagesFrom(message, fallback);

    response.status(statusCode).json({
      statusCode,
      message,
      messages,
      error,
      code: typeof body.code === 'string' && body.code.trim() ? body.code : codeFrom(error, statusCode),
      path: request.url,
      method: request.method,
      timestamp: new Date().toISOString(),
    });
  }
}
