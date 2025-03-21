import { Injectable, NotFoundException } from '@nestjs/common';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { ClientType, Innertube, UniversalCache, Utils } from 'youtubei.js';
import { PlaylistVideo } from 'youtubei.js/dist/src/parser/nodes';
import { join } from 'path';
import { exec } from 'child_process';
import * as sevenBin from '7zip-bin';
import { promisify } from 'util';
import { IResponseFolder } from './interfaces/responseRarFolder';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import { OAuth2Client } from 'google-auth-library';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';

const execPromise = promisify(exec);

@Injectable()
export class YoutubeService {
  private readonly downloadDir = join(__dirname, '../../', 'downloads/music');
  private readonly rarDir = join(__dirname, '../../', 'downloads/rar');
  private cache = new UniversalCache(true);
  private innertube: Innertube | undefined;
  private oAuth2Client: OAuth2Client | undefined;
  private authorizationUrl: string | undefined;
  private clientId: string;
  private clientSecret: string;
  private redirectUri = 'http://localhost:3005/youtube/login';

  constructor(private readonly configService: ConfigService) {
    this.clientId = this.configService.get<string>('YOUR_OAUTH2_CLIENT_ID');
    this.clientSecret = this.configService.get<string>(
      'YOUR_OAUTH2_CLIENT_SECRET',
    );
  }

  async initSesionAuth0(res: Response) {
    if (!this.innertube || true) {
      console.info('Creating innertube instance.');
      this.innertube = await Innertube.create({
        cache: this.cache,
        client_type: ClientType.TV,
      });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      this.innertube.session?.on('update-credentials', async (_credentials) => {
        console.info('Credentials updated.');
        await this.innertube?.session.oauth.cacheCredentials();
      });
    }

    if (await this.cache.get('youtubei_oauth_credentials')) {
      await this.innertube.session.signIn();
    }

    if (this.innertube.session.logged_in) {
      console.info('Innertube instance is logged in.');

      const userInfo = await this.innertube.account.getInfo();

      console.log(userInfo.page.contents);

      const newUrl = new URLSearchParams(
        'https://www.youtube.com/watch?v=XUoXE3bmDJY&list=PLFNUImapc0zLsvRtMNFf7V-O1HOPuQCHZ',
      );

      const example = await this.innertube.music.getPlaylist(
        newUrl.get('list'),
      );

      res.send({
        userInfo: userInfo.page.contents,
        example: example.items[0],
      });

      await this.getOneMusic(
        'loca',
        String(example.items[0].id),
        String(example.items[0].title ?? 'sn'),
      );

      res.send({
        userInfo: userInfo.page.contents,
        example: example.items,
      });
    }

    if (!this.oAuth2Client) {
      console.info('Creating OAuth2 client.');
      console.log('Client ID:', this.clientId);
      console.log('Client Secret:', this.clientSecret);
      this.oAuth2Client = new OAuth2Client(
        this.clientId,
        this.clientSecret,
        this.redirectUri,
      );

      this.authorizationUrl = this.oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: [
          'http://gdata.youtube.com',
          'https://www.googleapis.com/auth/youtube',
          'https://www.googleapis.com/auth/youtube.force-ssl',
          'https://www.googleapis.com/auth/youtube-paid-content',
        ],
        include_granted_scopes: true,
        prompt: 'consent',
      });

      console.info('Redirecting to authorization URL...');

      res.redirect(this.authorizationUrl);
    } else if (this.authorizationUrl) {
      console.info(
        'OAuth2 client already exists. Redirecting to authorization URL...',
      );
      res.redirect(this.authorizationUrl);
    }
  }

  async login(req: Request, res: Response) {
    const { code } = req.query;
    console.log('****code******');
    console.log(code);

    if (!code) {
      return res.send('No code provided.');
    }

    console.log('*************** this.oAuth2Client*********************');
    console.log(this.oAuth2Client);

    console.log('*************** this.oAuth2Client*********************');
    console.log(this.innertube);

    if (!this.oAuth2Client || !this.innertube) {
      return res.send(
        'OAuth2 client or innertube instance is not initialized.',
      );
    }
    console.log(this.oAuth2Client);

    const { tokens } = await this.oAuth2Client.getToken(String(code));

    try {
      if (tokens.access_token && tokens.refresh_token && tokens.expiry_date) {
        await this.innertube.session.signIn({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expiry_date: new Date(tokens.expiry_date).toISOString(),
          client: {
            client_id: this.clientId,
            client_secret: this.clientSecret,
          },
        });

        await this.innertube.session.oauth.cacheCredentials();

        console.log('Logged in successfully. Redirecting to home page...');

        res.redirect('/youtube');
      }
    } catch (error) {
      console.log('********errror');
      console.log(error);

      throw error;
    }
  }

  async logout(res: Response) {
    if (!this.innertube) {
      return res.send('Innertube instance is not initialized.');
    }

    await this.innertube.session.signOut();
    await this.innertube?.session.oauth.removeCache();

    console.log('Logged out successfully. Redirecting to home page...');

    res.redirect('/');
  }

  /**************  LOGICA DE DESCARGA ************************* */
  private sanitizeName(filename: string | any): string {
    filename = String(filename);

    // Define los caracteres no permitidos
    const forbiddenChars = /[<>:"/\\|?*\x00-\x1F]/g;

    // Reemplaza los caracteres no permitidos con un guion bajo
    let sanitizedFilename = filename.replace(forbiddenChars, '_');

    // Elimina los espacios al inicio y al final
    sanitizedFilename = sanitizedFilename.trim();

    // Limita la longitud del nombre de archivo si es necesario
    const maxLength = 255; // Puedes ajustar esto según el sistema de archivos
    if (sanitizedFilename.length > maxLength) {
      sanitizedFilename = sanitizedFilename.substring(0, maxLength);
    }

    // Evita el uso de un nombre vacío
    if (sanitizedFilename === '') {
      sanitizedFilename = 'untitled';
    }

    return sanitizedFilename;
  }

  async proccessCreateRarPlaylistByUrl(url: string): Promise<IResponseFolder> {
    const urlParams = new URLSearchParams(url);
    const playlistId = urlParams.get('list');

    if (!playlistId) {
      throw new Error('Falta el parámetro "list"');
    }

    const folder = await this.createFolderPlaylist(playlistId);
    const rarFilePath = await this.createRar(folder.dirFile, folder.filename);
    return rarFilePath;
  }

  async proccessCreateRarPlaylist(
    playlistId: string,
  ): Promise<IResponseFolder> {
    const folder = await this.createFolderPlaylist(playlistId);
    const rarFilePath = await this.createRar(folder.dirFile, folder.filename);
    return rarFilePath;
  }

  async createFolderPlaylist(playlistId: string): Promise<IResponseFolder> {
    try {
      const playlist = await this.innertube.getPlaylist(playlistId);

      const uniqueUuid = randomUUID();
      const folderName = `${this.sanitizeName(playlist.info.title)} - ${uniqueUuid}`;
      const dirFolder = join(this.downloadDir, folderName);

      if (!existsSync(dirFolder)) {
        mkdirSync(dirFolder);
      }

      let counter = 1;
      for (const song of playlist.items as PlaylistVideo[]) {
        try {
          await new Promise<void>(async (resolve, reject) => {
            try {
              const stream = await this.innertube.download(String(song.id), {
                type: 'audio', // audio, video or video+audio
                quality: 'best', // best, bestefficiency, 144p, 240p, 480p, 720p and so on.
                client: 'YTMUSIC',
              });

              const filePath = `${dirFolder}/${counter} {${this.sanitizeName(song.title.text).replace(/\//g, '')}.m4a`;
              counter++;
              const file = createWriteStream(filePath);

              // Escribe los datos en el archivo
              for await (const chunk of Utils.streamToIterable(stream)) {
                file.write(chunk);
              }
              // Asegúrate de cerrar el archivo una vez que todo esté escrito
              file.end(() => {
                resolve();
              });
            } catch (error) {
              reject(error);
            }
          });
        } catch (error) {
          if (error instanceof Utils.InnertubeError) {
            console.log('//////////////Fallo descargando', song.title.text);
          }
          continue;
        }
      }

      return {
        dirFile: dirFolder,
        filename: folderName,
      };
    } catch (error) {
      console.log('****************error*******************');
      console.log(error);

      throw new NotFoundException(
        'La lista de reproucción no se puede descargar, asegurate de copiar un link que contenga la lista de reproducción',
      );
    }
  }

  async createRar(
    folderPath: string,
    folderName: string,
  ): Promise<IResponseFolder> {
    const rarNameFolder = `${folderName}.7z`;
    const outputFile = join(this.rarDir, `${rarNameFolder}`); // Ruta del archivo .7z a crear

    // Comando para crear el archivo .7z con los archivos seleccionados
    const sevenCommand = `"${sevenBin.path7za}" a "${outputFile}" "${folderPath}\\*"`;

    try {
      // Ejecutar el comando para crear el archivo .7z
      await execPromise(sevenCommand);

      if (fs.existsSync(folderPath)) {
        fs.rmSync(folderPath, { recursive: true, force: true });
      }

      return {
        filename: rarNameFolder,
        dirFile: outputFile,
      };
    } catch (error) {
      console.error('Error al crear el archivo 7z:', error);
      throw new Error('Error al crear archivo 7z');
    }
  }

  async innitInnerTube() {
    console.log('*****************inner tube*************************');
    console.log(this.innertube);

    if (!this.innertube) {
      this.innertube = await Innertube.create({
        cache: this.cache,
      });
    }
  }

  async getOneMusic(nameList: string, videoId: string, songTitle: string) {
    console.log('****************videoId');
    console.log(videoId);

    const uniqueUuid = randomUUID();
    const folderName = `${this.sanitizeName(nameList)} - ${uniqueUuid}`;
    const dirFolder = join(this.downloadDir, folderName);

    if (!existsSync(dirFolder)) {
      mkdirSync(dirFolder);
    }

    await new Promise<void>(async (resolve, reject) => {
      try {
        const stream = await this.innertube.download(videoId, {
          type: 'audio', // audio, video or video+audio
          quality: 'best', // best, bestefficiency, 144p, 240p, 480p, 720p and so on.
          client: 'TV',
        });

        console.log('//////////////////stream');
        console.log(stream);

        const filePath = `${dirFolder}/{${this.sanitizeName(songTitle).replace(/\//g, '')}.m4a`;
        const file = createWriteStream(filePath);

        // Escribe los datos en el archivo
        for await (const chunk of Utils.streamToIterable(stream)) {
          file.write(chunk);
        }
        // Asegúrate de cerrar el archivo una vez que todo esté escrito
        file.end(() => {
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }
}
