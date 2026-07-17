import { ArgumentsHost, Catch, ExceptionFilter, PayloadTooLargeException } from '@nestjs/common';
import { MAX_SUPPLIER_IMPORT_BYTES } from './supplier-import';

@Catch(PayloadTooLargeException)
export class SupplierImportSizeExceptionFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    response.status(413).json({
      statusCode: 413,
      message: `File CSV/XLSX không được vượt quá ${MAX_SUPPLIER_IMPORT_BYTES / (1024 * 1024)} MB`,
      error: 'Payload Too Large',
    });
  }
}
