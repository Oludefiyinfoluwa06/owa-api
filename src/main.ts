import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });
  app.use(
    json({
      limit: '10mb',
      verify: (req: any, _res, buf) => {
        if (buf?.length) {
          req.rawBody = buf.toString('utf8');
        }
      },
    }),
  );
  app.use(urlencoded({ extended: true, limit: '10mb' }));
  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });
  await app.listen(3000);
}
bootstrap();
