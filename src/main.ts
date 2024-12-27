import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as dotenv from 'dotenv';

async function bootstrap() {
  dotenv.config();

  const app = await NestFactory.create(AppModule);

  const WEB_CLIENT_URL = process.env.WEB_CLIENT_URL;
  const PORT = Number(process.env.PORT || 3000);

  console.log('**************WEB_CLIENT_URL******************');
  console.log(WEB_CLIENT_URL);

  app.enableCors({
    origin: ['http://localhost:3000', WEB_CLIENT_URL],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
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
