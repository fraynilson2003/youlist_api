import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { Innertube, UniversalCache, Utils } from 'youtubei.js';
import { join } from 'path';
import { exec } from 'child_process';
import * as sevenBin from '7zip-bin';
import { promisify } from 'util';
import { IResponseFolder } from './interfaces/responseRarFolder';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import { Credentials, OAuth2Client } from 'google-auth-library';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { ItemVideoAuth } from './interfaces/itemVideoAuth';
import { MusicResponsiveListItem } from 'youtubei.js/dist/src/parser/nodes';
import { ResponseToken } from './interfaces/responseToken';
import { keyIdList } from './interfaces/keysParam';

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
  private redirectUri: string;

  constructor(private readonly configService: ConfigService) {
    this.clientId = this.configService.get<string>('YOUR_OAUTH2_CLIENT_ID');
    this.clientSecret = this.configService.get<string>(
      'YOUR_OAUTH2_CLIENT_SECRET',
    );
    this.redirectUri = this.configService.get<string>('BASE_HOST') + '/login';
  }

  async downloadPlaylist(res: Response, tokens: Credentials, listUrl?: string) {
    if (!listUrl) {
      throw new BadRequestException(
        'No se ha proporcionado una URL de lista de reproducción.',
      );
    }
    await this.prepareSession(res, tokens);

    //si hay cliente
    await this.proccessCreateRarPlaylist(res, listUrl);
  }

  async prepareSession(res: Response, tokens: Credentials) {
    if (!this.innertube) {
      this.innertube = await Innertube.create({
        cache: this.cache,
      });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      this.innertube.session?.on('update-credentials', async (_credentials) => {
        await this.innertube?.session.oauth.cacheCredentials();
      });
    }

    if (await this.cache.get('youtubei_oauth_credentials')) {
      await this.innertube.session.signIn();
    }

    if (this.innertube.session.logged_in) {
      console.log('Ya esta logeado');

      return;
    }

    if (!this.oAuth2Client) {
      try {
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
          redirect_uri: this.redirectUri,
        });
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
          return;
        }

        res.redirect(this.authorizationUrl);
      } catch {
        res.redirect(this.authorizationUrl);
      }
    } else {
      return;
    }
  }

  async initLogin(res: Response) {
    if (!this.oAuth2Client) {
      this.oAuth2Client = new OAuth2Client(
        this.clientId,
        this.clientSecret,
        this.redirectUri,
      );
    }

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
      redirect_uri: this.redirectUri,
    });
    res.redirect(this.authorizationUrl);
  }

  async loginCode(req: Request, res: Response): Promise<ResponseToken> {
    const { code } = req.query;

    if (!code) {
      res.send('No code provided.');
      return;
    }

    if (!this.oAuth2Client) {
      this.oAuth2Client = new OAuth2Client(
        this.clientId,
        this.clientSecret,
        this.redirectUri,
      );
    }
    if (!this.innertube) {
      this.innertube = await Innertube.create({
        cache: this.cache,
      });
    }

    const { tokens } = await this.oAuth2Client.getToken(String(code));

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
    }
    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: new Date(tokens.expiry_date).toISOString(),
    };
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

  async proccessCreateRarPlaylist(res: Response, url: string) {
    const params = new URLSearchParams(url);
    const playListId = params.get(keyIdList);
    if (!playListId) {
      throw new BadRequestException(
        'La url no contiene un id de lista de reproducción, copie una url cuando este reproduciendo el video dentro de una lista de reproducción, desde el navegador pre',
      );
    }

    const innerNotLogin = await Innertube.create({
      cache: new UniversalCache(false),
    });

    const folderAuth = await this.innertube.music.getPlaylist(playListId);
    const folderNotAuth = await innerNotLogin.getPlaylist(playListId);

    const songs: ItemVideoAuth[] = folderAuth.items.map(
      (e: MusicResponsiveListItem) => {
        return {
          name: e.title,
          id: e.id,
        };
      },
    );

    const folder = await this.createFolderPlaylist(
      String(folderNotAuth.info.title),
      songs,
    );
    const { dirFile, filename } = await this.createRar(
      folder.dirFile,
      folder.filename,
    );

    res.download(dirFile, filename, (err) => {
      if (err) {
        console.error('Error al enviar archivo:', err);
        // Opcional: manejá errores específicos como abortos
      } else {
        console.log(`Archivo enviado correctamente: ${dirFile}`);
      }
    });

    // Borramos el archivo solo cuando la transmisión termina bien
    res.on('finish', () => {
      fs.unlink(dirFile, (unlinkErr) => {
        if (unlinkErr) {
          console.error('Error al eliminar el archivo:', unlinkErr);
        } else {
          console.log(`Archivo eliminado correctamente: ${dirFile}`);
        }
      });
    });
  }

  async createFolderPlaylist(
    nameFolder: string,
    songs: ItemVideoAuth[],
  ): Promise<IResponseFolder> {
    try {
      const uniqueUuid = randomUUID();
      const folderName = `${this.sanitizeName(nameFolder)} - ${uniqueUuid}`;
      const dirFolder = join(this.downloadDir, folderName);

      if (!existsSync(dirFolder)) {
        mkdirSync(dirFolder);
      }

      let counter = 1;
      for (const song of songs) {
        try {
          await new Promise<void>(async (resolve, reject) => {
            try {
              const stream = await this.innertube.download(String(song.id), {
                type: 'audio',
                quality: 'best',
                client: 'TV',
              });

              const filePath = `${dirFolder}/${counter} ${this.sanitizeName(song.name).replace(/\//g, '')}.mp3`;
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
            console.log('//////////////Fallo descargando', song.name);
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
}
