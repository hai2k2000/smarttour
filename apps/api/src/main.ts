import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { assertSecureRuntimeConfig, configuredCorsOrigins, smartTourEnvironment } from './config/runtime-env';
import { createCorrelationIdMiddleware } from './correlation-id.middleware';
import { HttpErrorResponseFilter } from './http-error-response.filter';
import { RequestLoggingInterceptor } from './request-logging.interceptor';
import { validationExceptionFactory } from './validation-exception.factory';

async function bootstrap() {
  assertSecureRuntimeConfig();
  const app = await NestFactory.create(AppModule);
  const corsOrigins = configuredCorsOrigins();
  app.setGlobalPrefix('api');
  app.use(createCorrelationIdMiddleware());
  app.enableCors({
    credentials: true,
    origin: corsOrigins.length ? corsOrigins : smartTourEnvironment() === 'development',
  });
  app.useGlobalFilters(new HttpErrorResponseFilter());
  app.useGlobalInterceptors(new RequestLoggingInterceptor());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, exceptionFactory: validationExceptionFactory }));

  const config = new DocumentBuilder()
    .setTitle('SmartTour API')
    .setDescription('Travel operations ERP API')
    .setVersion('0.1.0')
    .addTag('tour-programs', 'Quản lý tour mẫu và tạo các ngày lịch trình thuộc tour mẫu.')
    .addTag('tour-itinerary-days', 'Cập nhật hoặc xóa ngày lịch trình là sub-resource của tour mẫu.')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(process.env.PORT ? Number(process.env.PORT) : 4000, '0.0.0.0');
}

bootstrap();
