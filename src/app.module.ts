import { Module } from '@nestjs/common';
import { YoutubeModule } from './youtube/youtube.module';

@Module({
  imports: [YoutubeModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
