import { Controller, Get, Query, Req, Res } from '@nestjs/common';

import { YoutubeService } from './youtube.service';
import { Request, Response } from 'express';
import { keyUrlList } from './interfaces/keysParam';
import { join } from 'path';
import fs from 'fs';

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
      res.setHeader(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(value)}`,
      );

      const filePath = join(__dirname, `../../downloads/rar/${value}`);

      res.download(filePath, value, (err) => {
        if (err) {
          console.error('Error al enviar archivo:', err);
          // Opcional: manejá errores específicos como abortos
        } else {
          console.log(`Archivo enviado correctamente: ${filePath}`);
        }
      });
      // Borramos el archivo solo cuando la transmisión termina bien
      res.on('finish', () => {
        fs.unlink(value, (unlinkErr) => {
          if (unlinkErr) {
            console.error('Error al eliminar el archivo:', unlinkErr);
          } else {
            console.log(`Archivo eliminado correctamente: ${value}`);
          }
        });
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
