import { Controller, Get, Query, Res } from '@nestjs/common';

import { YoutubeService } from './youtube.service';
import { Response } from 'express';
import { unlink } from 'fs';

@Controller('youtube')
export class YoutubeController {
  constructor(private yotubeService: YoutubeService) {}

  @Get('download-list-youtube')
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

  @Get('prueba-audio')
  async pruebaAudio(@Query('list_id') playlistId: string) {
    const result = await this.yotubeService.createFolderPlaylist(playlistId);

    return result;
  }
}
