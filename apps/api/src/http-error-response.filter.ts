import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type ErrorBody = Record<string, unknown>;
type HttpRequest = { url: string; method: string; correlationId?: string };
type HttpResponse = { status(statusCode: number): { json(body: unknown): unknown } };

function isHttpException(exception: unknown): exception is HttpException {
  return exception instanceof HttpException;
}

function isPrismaKnownError(exception: unknown): exception is Prisma.PrismaClientKnownRequestError {
  return exception instanceof Prisma.PrismaClientKnownRequestError;
}

function bodyFromException(exception: HttpException): ErrorBody {
  const response = exception.getResponse();
  if (response && typeof response === 'object' && !Array.isArray(response)) return response as ErrorBody;
  return { message: response || exception.message };
}

function statusFromException(exception: unknown) {
  if (isHttpException(exception)) return exception.getStatus();
  if (isPrismaKnownError(exception)) {
    if (exception.code === 'P2002') return HttpStatus.CONFLICT;
    if (exception.code === 'P2025') return HttpStatus.NOT_FOUND;
  }
  return HttpStatus.INTERNAL_SERVER_ERROR;
}

function responseFromException(exception: unknown, statusCode: number): ErrorBody {
  if (isHttpException(exception)) return bodyFromException(exception);
  if (isPrismaKnownError(exception)) {
    if (exception.code === 'P2002') {
      return { message: 'Dữ liệu đã tồn tại hoặc bị trùng.', error: 'Database conflict', code: 'DATABASE_CONFLICT' };
    }
    if (exception.code === 'P2025') {
      return { message: 'Không tìm thấy dữ liệu cần xử lý.', error: 'Database not found', code: 'DATABASE_NOT_FOUND' };
    }
    return { message: 'Không thể xử lý dữ liệu lúc này.', error: 'Database error', code: 'DATABASE_ERROR' };
  }
  return {
    message: statusCode >= 500 ? 'Lỗi hệ thống. Vui lòng thử lại sau.' : 'Yêu cầu không hợp lệ.',
    error: statusCode >= 500 ? 'Internal Server Error' : 'Bad Request',
    code: statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : `HTTP_${statusCode}`,
  };
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

@Catch()
export class HttpErrorResponseFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<HttpResponse>();
    const request = context.getRequest<HttpRequest>();
    const statusCode = statusFromException(exception);
    const body = responseFromException(exception, statusCode);
    const exceptionName = exception && typeof exception === 'object' && 'name' in exception ? String((exception as { name?: unknown }).name || '') : '';
    const error = typeof body.error === 'string' && body.error.trim() ? body.error : exceptionName || 'Error';
    const fallback = error || `HTTP ${statusCode}`;
    const message = body.message ?? (isHttpException(exception) ? exception.message : undefined) ?? fallback;
    const messages = Array.isArray(body.messages) ? messagesFrom(body.messages, fallback) : messagesFrom(message, fallback);

    response.status(statusCode).json({
      statusCode,
      message,
      messages,
      error,
      code: typeof body.code === 'string' && body.code.trim() ? body.code : codeFrom(error, statusCode),
      path: request.url,
      method: request.method,
      correlationId: request.correlationId,
      timestamp: new Date().toISOString(),
    });
  }
}
