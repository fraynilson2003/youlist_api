import { Module } from '@nestjs/common';
import { YoutubeModule } from './youtube/youtube.module';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Hace que las variables estén disponibles globalmente
    }),
    YoutubeModule,
    HttpModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
