import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './filters/all-exception.filter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: '*',
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

  //app.use(morgan('dev'));
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.listen(3000);
  console.log('********** Server Running 3000 **********');
}
bootstrap();
