import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

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
  name?: string;
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
        this.write('request_failed', request, statusCode, Date.now() - startedAt, error.name);
        return throwError(() => error);
      }),
    );
  }

  private write(event: string, request: LogRequest, statusCode: number, durationMs: number, errorName?: string) {
    this.logger.log(JSON.stringify({
      event,
      correlationId: request.correlationId,
      method: request.method,
      path: request.url,
      statusCode,
      durationMs,
      ...(errorName ? { errorName } : {}),
    }));
  }
}
