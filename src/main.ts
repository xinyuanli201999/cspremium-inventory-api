import './common/utils/decimal-patch';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { existsSync, mkdirSync } from 'fs';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { UPLOAD_DIR } from './modules/storage/drivers/local.driver';
import { StorageService } from './modules/storage/storage.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // "Today", monthly grouping and Excel dates follow the business timezone
  process.env.TZ = config.get<string>('app.timezone');

  if (config.get('app.env') === 'production') app.set('trust proxy', 1);

  app.setGlobalPrefix('api');
  app.use(
    helmet({
      // uploaded product images are loaded from the frontend origin
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cookieParser());
  app.enableCors({
    origin: config.get<string>('app.frontendUrl'),
    credentials: true,
    exposedHeaders: ['Content-Disposition'], // Excel filename
  });

  // Local images: created for the local driver, and still served after switching to S3
  // so products uploaded before the switch keep their pictures.
  if (app.get(StorageService).driverName === 'local') mkdirSync(UPLOAD_DIR, { recursive: true });
  if (existsSync(UPLOAD_DIR)) app.useStaticAssets(UPLOAD_DIR, { prefix: '/uploads/' });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.enableShutdownHooks();

  await app.listen(config.get<number>('app.port') ?? 3000);
}
bootstrap();
