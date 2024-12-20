import { Injectable } from '@nestjs/common';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { Innertube, UniversalCache, Utils } from 'youtubei.js';
import { PlaylistVideo } from 'youtubei.js/dist/src/parser/nodes';
import { join } from 'path';
import { exec } from 'child_process';
import * as sevenBin from '7zip-bin';
import { promisify } from 'util';
import { IResponseFolder } from './interfaces/responseRarFolder';
import { randomUUID } from 'crypto';

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

  async proccessCreateRarPlaylist(
    playlistId: string,
  ): Promise<IResponseFolder> {
    const folder = await this.createFolderPlaylist(playlistId);
    const rarFilePath = await this.createRar(folder.dirFile, folder.filename);
    return rarFilePath;
  }

  async createFolderPlaylist(playlistId: string): Promise<IResponseFolder> {
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

    for (const song of playlist.items as PlaylistVideo[]) {
      try {
        const stream = await yt.download(song.id as string, {
          type: 'audio', // audio, video or video+audio
          quality: 'best', // best, bestefficiency, 144p, 240p, 480p, 720p and so on.
          //client: 'YTMUSIC',
          format: 'mp4',
        });

        const filePath = `${dirFolder}/${this.sanitizeName(song.title).replace(/\//g, '')}.m4a`;

        const file = createWriteStream(filePath);

        // Escribe los datos en el archivo
        for await (const chunk of Utils.streamToIterable(stream)) {
          try {
            file.write(chunk);
          } catch (error) {
            return;
          }
        }

        // Asegúrate de cerrar el archivo una vez que todo esté escrito
        file.end(() => {
          console.log('---------- Archivo creado correctamente:', song.title);
        });
      } catch (error) {
        console.log('//////////////Fallo creando', song.title);
        console.log(error);

        continue;
      }
    }

    return {
      dirFile: dirFolder,
      filename: folderName,
    };
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

      //una vez creado el archivo .7z, eliminar los archivos seleccionados
      execPromise(`del /q "${folderPath}\\*"`);
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
