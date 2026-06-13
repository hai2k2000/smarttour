import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { assertSecureRuntimeConfig } from './config/runtime-env';
import { validationExceptionFactory } from './validation-exception.factory';

async function bootstrap() {
  assertSecureRuntimeConfig();
  const app = await NestFactory.create(AppModule);
  const corsOrigins = configuredCorsOrigins();
  app.setGlobalPrefix('api');
  app.enableCors({
    credentials: true,
    origin: corsOrigins.length ? corsOrigins : true,
  });
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

function configuredCorsOrigins() {
  return Array.from(
    new Set(
      [
        process.env.SMARTTOUR_CORS_ORIGINS,
        process.env.CORS_ORIGINS,
        process.env.NEXT_PUBLIC_API_URL,
        process.env.SMARTTOUR_WEB_URL,
        process.env.WEB_ORIGIN,
      ]
        .filter((value): value is string => Boolean(value))
        .flatMap((value) => value.split(','))
        .map((value) => normalizeOrigin(value))
        .filter(Boolean),
    ),
  );
}

function normalizeOrigin(value: string) {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed;
  }
}
