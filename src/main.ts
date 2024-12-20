import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './filters/all-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  });

  //app.use(morgan('dev'));
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.listen(3005);
  console.log('********** Server Running 3005 **********');
}
bootstrap();
