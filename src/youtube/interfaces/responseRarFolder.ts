export interface IResponseFolder {
  dirFile: string;
  filename: string;
}

export interface ResponseServiceDownloadList {
  type: 'url' | 'redirect';
  value: string;
}
