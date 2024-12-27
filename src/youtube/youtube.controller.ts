import { Controller, Get, Query, Res } from '@nestjs/common';

import { YoutubeService } from './youtube.service';
import { Response } from 'express';
import { unlink } from 'fs';
import { ApiQuery } from '@nestjs/swagger';

@Controller('youtube')
export class YoutubeController {
  constructor(private yotubeService: YoutubeService) {}

  @Get('list')
  @ApiQuery({
    name: 'list_id',
    type: String,
    example: 'PLFNUImapc0zJcOWstLHHBDRvmAewDqzD5',
  })
  async downloadAudio(
    @Query('list_id') idPlayList: string,
    @Res() response: Response,
  ) {
    const { dirFile, filename } =
      await this.yotubeService.proccessCreateRarPlaylist(idPlayList);

    response.download(dirFile, filename, (err) => {
      if (err) {
        console.error('Error al enviar archivo:', err);
      } else {
        console.log(`Archivo enviado correctamente: ${dirFile}`);
        // Elimina el archivo después de enviarlo
        unlink(dirFile, (unlinkErr) => {
          if (unlinkErr) {
            console.error('Error al eliminar el archivo:', unlinkErr);
          } else {
            console.log(`Archivo eliminado correctamente: ${dirFile}`);
          }
        });
      }
    });
  }

  @Get('list/url')
  @ApiQuery({
    name: 'url',
    type: String,
    example:
      'https://www.youtube.com/watch?v=07EzMbVH3QE&list=PLFNUImapc0zJcOWstLHHBDRvmAewDqzD5',
  })
  async downloadAudioFromUrl(
    @Query('url') url: string,
    @Res() response: Response,
  ) {
    const { dirFile, filename } =
      await this.yotubeService.proccessCreateRarPlaylistByUrl(url);

    response.download(dirFile, filename, (err) => {
      if (err) {
        console.error('Error al enviar archivo:', err);
      } else {
        console.log(`Archivo enviado correctamente: ${dirFile}`);
        // Elimina el archivo después de enviarlo
        unlink(dirFile, (unlinkErr) => {
          if (unlinkErr) {
            console.error('Error al eliminar el archivo:', unlinkErr);
          } else {
            console.log(`Archivo eliminado correctamente: ${dirFile}`);
          }
        });
      }
    });
  }
}
