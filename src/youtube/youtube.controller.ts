import { Controller, Get, Query, Req, Res } from '@nestjs/common';

import { YoutubeService } from './youtube.service';
import { Request, Response } from 'express';
import { keyUrlList } from './interfaces/keysParam';
import * as fs from 'fs';
import { IResponseFolder } from './interfaces/responseRarFolder';

@Controller()
export class YoutubeController {
  constructor(private yotubeService: YoutubeService) {}

  @Get('/playlist/mp3')
  async initSesionAuth0(
    @Res() res: Response,
    @Query(keyUrlList) listUrl?: string,
  ) {
    const { type, value } = await this.yotubeService.downloadPlaylist(listUrl);
    if (type === 'url') {
      const { filename, filenameUnique, filepath } = value as IResponseFolder;

      res.setHeader(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      );

      res.download(filepath, filename, (err) => {
        if (err) {
          console.error('Error al enviar archivo:', err);
          // Opcional: manejá errores específicos como abortos
        } else {
          console.log(`Archivo enviado correctamente: ${filenameUnique}`);
        }
      });
      // Borramos el archivo solo cuando la transmisión termina bien

      res.on('finish', () => {
        if (fs.existsSync(filepath)) {
          fs.unlink(filepath, (unlinkErr) => {
            if (unlinkErr) {
              console.error('Error al eliminar el archivo:', unlinkErr);
            } else {
              console.log(`Archivo eliminado correctamente: ${filepath}`);
            }
          });
        } else {
          console.log('Archivos no se estan elminando');
        }
      });
    } else {
      return res.status(401).json({
        url: value,
      });
    }
  }

  @Get('login')
  async login(@Res({ passthrough: true }) res: Response, @Req() req: Request) {
    return await this.yotubeService.loginCode(req, res);
  }

  @Get('logout')
  async logout() {
    return await this.yotubeService.logout();
  }
}
