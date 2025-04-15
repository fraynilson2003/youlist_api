import { Body, Controller, Get, Query, Req, Res } from '@nestjs/common';

import { YoutubeService } from './youtube.service';
import { Request, Response } from 'express';
import { Credentials } from 'google-auth-library';
import { keyUrlList } from './interfaces/keysParam';

@Controller('')
export class YoutubeController {
  constructor(private yotubeService: YoutubeService) {}

  @Get('/playlist/mp3')
  async initSesionAuth0(
    @Res() res: Response,
    @Body('tokens') tokens: Credentials,
    @Query(keyUrlList) listUrl?: string,
  ) {
    const result = await this.yotubeService.downloadPlaylist(
      res,
      tokens,
      listUrl,
    );

    if (result && result.type && result.type === 'redirect') {
      res.status(401).json({
        url: result.url,
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
