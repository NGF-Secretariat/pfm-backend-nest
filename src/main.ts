import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors(
    //   {
    //   origin: '*', 
    //   methods: '*',
    //   allowedHeaders: '*',
    // }
  );
  app.setGlobalPrefix('api/v1');

  console.log('Starting server...', `http://localhost:${process.env.PORT ?? 5001}`);
  await app.listen(process.env.PORT ?? 5001);
}
bootstrap();
