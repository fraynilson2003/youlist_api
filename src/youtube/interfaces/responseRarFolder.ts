export interface IResponseFolder {
  filepath: string;
  filenameUnique: string;
  filename: string;
}

export interface ResponseServiceDownloadList {
  type: 'url' | 'redirect';
  value: any;
}
