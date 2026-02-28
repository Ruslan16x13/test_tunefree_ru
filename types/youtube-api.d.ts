declare module '@hydralerne/youtube-api' {
  // Функция поиска музыки в YouTube Music
  export function youtubeMusicSearch(query: string): Promise<any[]>;
  
  // Получить данные о треке
  export function getTrackData(videoId: string): Promise<any>;
  
  // Получить главную страницу (тренды)
  export function getHome(): Promise<any[]>;
  
  // Получить похожие треки
  export function getYTMusicRelated(videoId: string): Promise<any[]>;
  
  // Получить плейлист YouTube
  export function getYoutubeList(playlistId: string): Promise<any>;
  
  // Дополнительные функции
  export function getVideoId(url: string): string;
  export function getYotubeMusicList(url: string): Promise<any>;
  export function requestNext(continuation: string): Promise<any>;
  export function getVideoSections(videoId: string): Promise<any>;
  export function getPlaylistQueue(playlistId: string): Promise<any>;
  export function requestBrowse(browseId: string): Promise<any>;
  export function getLyrics(videoId: string): Promise<any>;
  export function getSongLyrics(videoId: string): Promise<any>;
  export function getRelatedAndLyrics(videoId: string): Promise<any>;
  export function getArtist(artistId: string): Promise<any>;
  export function getAlbum(albumId: string): Promise<any>;
  export function getPodcast(podcastId: string): Promise<any>;
  
  // Утилиты форматов
  export function filter(formats: any[], options: any): any[];
  export function chooseFormat(formats: any[], options: any): any;
  
  // Источники данных
  export function getData(videoId: string): Promise<any>;
  export function initialize(): Promise<void>;
}
