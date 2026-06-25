import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { smartTourEnvironment } from './config/runtime-env';

type LogRequest = {
  correlationId?: string;
  method?: string;
  url?: string;
};

type LogResponse = {
  statusCode?: number;
};

type LogError = {
  getStatus?: () => number;
  getResponse?: () => unknown;
  name?: string;
  code?: string;
  stack?: string;
};

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = Date.now();
    const http = context.switchToHttp();
    const request = http.getRequest<LogRequest>();
    const response = http.getResponse<LogResponse>();

    return next.handle().pipe(
      tap(() => {
        this.write('request_completed', request, response.statusCode || 200, Date.now() - startedAt);
      }),
      catchError((error: LogError) => {
        const statusCode = error.getStatus?.() || response.statusCode || 500;
        this.write('request_failed', request, statusCode, Date.now() - startedAt, error.name, this.errorCode(error), error.stack);
        return throwError(() => error);
      }),
    );
  }

  private errorCode(error: LogError) {
    if (typeof error.code === 'string' && error.code.trim()) return error.code;
    const details = error.getResponse?.();
    if (details && typeof details === 'object' && !Array.isArray(details) && 'code' in details) {
      const value = (details as { code?: unknown }).code;
      if (typeof value === 'string' && value.trim()) return value;
    }
    return undefined;
  }

  private write(event: string, request: LogRequest, statusCode: number, durationMs: number, errorName?: string, errorCode?: string, errorStack?: string) {
    const line = JSON.stringify({
      event,
      correlationId: request.correlationId,
      method: request.method,
      path: request.url,
      statusCode,
      durationMs,
      ...(errorName ? { errorName } : {}),
      ...(errorCode ? { errorCode } : {}),
      ...(errorStack && this.includeErrorStack() ? { errorStack } : {}),
    });
    if (event === 'request_failed') this.logger.error(line);
    else this.logger.log(line);
  }

  private includeErrorStack() {
    return process.env.SMARTTOUR_LOG_STACKS === 'true' || smartTourEnvironment() === 'development';
  }
}
