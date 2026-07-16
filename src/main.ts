import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app
    .enableCors
    //   {
    //   origin: '*',
    //   methods: '*',
    //   allowedHeaders: '*',
    // }
    ();
  app.setGlobalPrefix('api/v1');

  app.useStaticAssets(join(process.cwd(), 'public'));

  console.log(
    'Starting server...',
    `http://localhost:${process.env.PORT ?? 5001}`,
  );
  await app.listen(process.env.PORT ?? 5001);
}
bootstrap();
