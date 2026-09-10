import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { RuntimeConfigService } from '@elhafez/config';
import { StructuredLogger } from '@elhafez/logging';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(StructuredLogger));
  app.setGlobalPrefix('api');
  app.enableCors({ origin: true, credentials: false });
  app.enableShutdownHooks();
  const config = app.get(RuntimeConfigService);
  await app.listen(config.get('PORT'), '0.0.0.0');
}
void bootstrap();
