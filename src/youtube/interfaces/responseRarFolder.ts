export interface IResponseFolder {
  filepath: string;
  filenameUnique: string;
  filename: string;
}

export interface ResponseServiceDownloadList {
  type: 'filenames' | 'redirect';
  value: IResponseFolder | string;
}
