import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { Innertube, UniversalCache, Utils } from 'youtubei.js';
import { join } from 'path';
import {
  IResponseFolder,
  ResponseServiceDownloadList,
} from './interfaces/responseRarFolder';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import { OAuth2Client } from 'google-auth-library';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { ItemVideoAuth } from './interfaces/itemVideoAuth';
import { MusicResponsiveListItem } from 'youtubei.js/dist/src/parser/nodes';
import { keyIdList } from './interfaces/keysParam';
import { readdir, stat } from 'fs/promises';
import * as AdmZip from 'adm-zip';
import { InputFolder } from './interfaces/namefolder';

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
  private clientHost: string;

  constructor(private readonly configService: ConfigService) {
    this.clientId = this.configService.get<string>('YOUR_OAUTH2_CLIENT_ID');
    this.clientSecret = this.configService.get<string>(
      'YOUR_OAUTH2_CLIENT_SECRET',
    );
    this.redirectUri = this.configService.get<string>('BASE_HOST') + '/login';
    this.clientHost = this.configService.get<string>('CLIENT_HOST');
  }

  async downloadPlaylist(
    listUrl?: string,
  ): Promise<ResponseServiceDownloadList> {
    if (!listUrl) {
      throw new BadRequestException(
        'No se ha proporcionado una URL de lista de reproducción.',
      );
    }
    const result = await this.prepareSession();
    if (result) {
      return await this.proccessCreateRarPlaylist(listUrl);
    } else {
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

      return {
        type: 'redirect',
        value: this.authorizationUrl,
      };
    }
    //si hay cliente
  }

  async prepareSession(): Promise<boolean | string> {
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
      try {
        const example = 'kJQP7kiw5Fk';
        await this.innertube.getBasicInfo(example, 'TV');
      } catch (error) {
        console.log('Error al obtener información básica del video:', error);

        return false;
      }
      return true;
    }

    return false;
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

  async loginCode(req: Request, res: Response) {
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
    res.redirect(this.clientHost);
  }

  async logout() {
    if (!this.innertube) {
      return;
    }

    await this.innertube.session.signOut();
    await this.innertube?.session.oauth.removeCache();

    console.log('Logged out successfully. Redirecting to home page...');
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

  // async createFolderPlaylist(
  //   nameFolder: string,
  //   songs: ItemVideoAuth[],
  // ): Promise<IResponseFolder> {
  //   try {
  //     const uniqueUuid = randomUUID();
  //     const folderName = `${this.sanitizeName(nameFolder)} - ${uniqueUuid}`;
  //     const dirFolder = join(this.downloadDir, folderName);

  //     if (!existsSync(dirFolder)) {
  //       mkdirSync(dirFolder);
  //     }

  //     const divideSongs = [...Array(Math.ceil(songs.length / 10))].map((_, i) =>
  //       songs.slice(i * 10, i * 10 + 10),
  //     );

  //     let counter = 1;
  //     for (const partSong of divideSongs) {
  //       try {
  //         const listPromises: Promise<void>[] = [];
  //         for (const song of partSong) {
  //           const newMusic = new Promise<void>(async (resolve, reject) => {
  //             try {
  //               const stream = await this.innertube.download(String(song.id), {
  //                 type: 'audio',
  //                 quality: 'best',
  //                 client: 'TV',
  //               });

  //               const filePath = `${dirFolder}/${counter} ${this.sanitizeName(song.name).replace(/\//g, '')}.mp3`;
  //               counter++;
  //               const file = createWriteStream(filePath);

  //               // Escribe los datos en el archivo
  //               for await (const chunk of Utils.streamToIterable(stream)) {
  //                 file.write(chunk);
  //               }
  //               // Asegúrate de cerrar el archivo una vez que todo esté escrito
  //               file.end(() => {
  //                 resolve();
  //               });
  //             } catch (error) {
  //               if (error instanceof Utils.InnertubeError) {
  //                 console.log('//////////////Fallo descargando', song.name);
  //               }
  //               reject(error);
  //             }
  //           });
  //           listPromises.push(newMusic);
  //         }
  //         await Promise.all(listPromises);
  //       } catch (error) {
  //         continue;
  //       }
  //     }

  //     const filesData = await this.getFilesWithSize(dirFolder);
  //     console.log('*****************filesData');
  //     console.log(filesData);

  //     return {
  //       dirFile: dirFolder,
  //       filename: folderName,
  //     };
  //   } catch (error) {
  //     console.log('****************error descargando*******************');
  //     console.log(error);

  //     throw new NotFoundException(
  //       'La lista de reproucción no se puede descargar, asegurate de copiar un link que contenga la lista de reproducción',
  //     );
  //   }
  // }

  async proccessCreateRarPlaylist(
    url: string,
  ): Promise<ResponseServiceDownloadList> {
    const params = new URL(url);
    const playListId = params.searchParams.get(keyIdList);

    console.log('*****************playListId');
    console.log(playListId);

    if (!playListId) {
      throw new BadRequestException(
        'La url no contiene un id de lista de reproducción, copie una url cuando este reproduciendo el video dentro de una lista de reproducción',
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

    const responseZip = await this.createZip({
      filename: folder.filename,
      filenameUnique: folder.filenameUnique,
      filepath: folder.filepath,
    });

    return {
      type: 'url',
      value: responseZip,
    };
  }

  async createFolderPlaylist(
    filename: string,
    songs: ItemVideoAuth[],
  ): Promise<IResponseFolder> {
    try {
      const uniqueUuid = randomUUID();
      const filenameUnique = `${this.sanitizeName(filename)} --- ${uniqueUuid}`;
      const filename2 = this.sanitizeName(filename);
      const dirFolder = join(this.downloadDir, filenameUnique);

      if (!existsSync(dirFolder)) {
        mkdirSync(dirFolder);
      }

      songs = songs.filter((song) => song.id !== undefined);

      const limitMaxDownload = 10;

      const divideSongs = [
        ...Array(Math.ceil(songs.length / limitMaxDownload)),
      ].map((_, i) =>
        songs.slice(
          i * limitMaxDownload,
          i * limitMaxDownload + limitMaxDownload,
        ),
      );

      let counter = 1;
      for (const partSong of divideSongs) {
        try {
          const listPromises: Promise<void>[] = [];

          for (const song of partSong) {
            const newMusic = new Promise<void>(async (resolve, reject) => {
              try {
                if (!song.id) {
                  resolve();
                }
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
                if (error instanceof Utils.InnertubeError) {
                  console.log('//////////////Fallo descargando', song.name);
                }
                reject(error);
              }
            });
            listPromises.push(newMusic);
          }
          await Promise.all(listPromises);
        } catch (error) {
          continue;
        }
      }

      return {
        filepath: dirFolder,
        filenameUnique: filenameUnique,
        filename: filename2,
      };
    } catch (error) {
      console.log('****************error descargando*******************');
      console.log(error);

      throw new NotFoundException(
        'La lista de reproucción no se puede descargar, asegurate de copiar un link que contenga la lista de reproducción',
      );
    }
  }

  async createZip(input: InputFolder): Promise<IResponseFolder> {
    const zip = new AdmZip();
    const filenameUnique = `${input.filenameUnique}.zip`;
    const filename = `${input.filename}.zip`;
    const outputFile = join(this.rarDir, filenameUnique);

    zip.addLocalFolder(input.filepath);
    zip.writeZip(outputFile);

    // Elimina la carpeta original después de crear el zip
    if (fs.existsSync(input.filepath)) {
      fs.rmSync(input.filepath, { recursive: true, force: true });
    }

    return {
      filename: filename,
      filepath: outputFile,
      filenameUnique: filenameUnique,
    };
  }

  async getFilesWithSize(folderPath: string) {
    try {
      const files = await readdir(folderPath);
      const results = [];

      for (const file of files) {
        const filePath = join(folderPath, file);
        const stats = await stat(filePath);

        if (stats.isFile()) {
          results.push({
            name: file,
            sizeInBytes: stats.size,
          });
        }
      }

      return results;
    } catch (error) {
      console.error('Error reading folder:', error);
      return [];
    }
  }
}
