import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as dotenv from 'dotenv';

async function bootstrap() {
  dotenv.config();

  const app = await NestFactory.create(AppModule);
  const PORT = Number(process.env.PORT || 3005);

  app.enableCors({
    origin: ['https://youlist-web.vercel.app', 'http://localhost:3000'],
    methods: '*',
    exposedHeaders: 'Content-Disposition',
  });

  const config = new DocumentBuilder()
    .setTitle('Descarga lista de youtube en mp3')
    .setDescription('Descarga lista de youtube en mp3')
    .setVersion('1.0')
    .addTag('YouTube download mp3')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  await app.listen(PORT);
  console.log(`********** Server Running ${PORT} **********`);
}
bootstrap();
