import { ArgumentsHost, Catch, ExceptionFilter, PayloadTooLargeException } from '@nestjs/common';
import { fileUploadMaxBytes } from './files.service';

@Catch(PayloadTooLargeException)
export class FileUploadSizeExceptionFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const maxMegabytes = fileUploadMaxBytes() / (1024 * 1024);
    const limitLabel = Number.isInteger(maxMegabytes) ? String(maxMegabytes) : maxMegabytes.toFixed(1);
    response.status(413).json({
      statusCode: 413,
      message: `File vượt quá giới hạn ${limitLabel} MB`,
      error: 'Payload Too Large',
    });
  }
}
