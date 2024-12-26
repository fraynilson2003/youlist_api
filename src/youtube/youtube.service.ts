import { Injectable, NotFoundException } from '@nestjs/common';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { Innertube, UniversalCache, Utils } from 'youtubei.js';
import { PlaylistVideo } from 'youtubei.js/dist/src/parser/nodes';
import { join } from 'path';
import { exec } from 'child_process';
import * as sevenBin from '7zip-bin';
import { promisify } from 'util';
import { IResponseFolder } from './interfaces/responseRarFolder';
import { randomUUID } from 'crypto';
import * as fs from 'fs';

const execPromise = promisify(exec);

@Injectable()
export class YoutubeService {
  private readonly downloadDir = join(__dirname, '../../', 'downloads/music');
  private readonly rarDir = join(__dirname, '../../', 'downloads/rar');

  constructor() {}

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
      const yt = await Innertube.create({
        cache: new UniversalCache(false),
        generate_session_locally: true,
      });

      const playlist = await yt.getPlaylist(playlistId);

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
              const stream = await yt.download(String(song.id), {
                type: 'video+audio', // audio, video or video+audio
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
                console.log(
                  '---------- Archivo creado correctamente:',
                  song.title.text,
                );
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
        console.log(`Carpeta "${folderPath}" eliminada.`);
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
