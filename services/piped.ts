import { Song } from '../types';

/**
 * Piped API - альтернативный интерфейс к YouTube
 * Поддерживает несколько инстанций для надежности
 */

// Список публичных Piped API инстанций
const PIPED_INSTANCES = [
  'https://pipedapi.adminforge.de',
  'https://pipedapi.moomoo.me',
  'https://api.piped.moomoo.me',
  'https://piped-api.hypercrab.xyz',
];

// Текущий индекс инстанции для миграции при сбое
let currentInstanceIndex = 0;

const getPipedInstance = (): string => {
  return PIPED_INSTANCES[currentInstanceIndex];
};

const rotateInstance = (): void => {
  currentInstanceIndex = (currentInstanceIndex + 1) % PIPED_INSTANCES.length;
};

/**
 * Запрос с автоматическим переключением инстанций при ошибках
 */
const pipedFetch = async (endpoint: string, retries = 2): Promise<Response | null> => {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const url = `${getPipedInstance()}${endpoint}`;
      console.log(`[Piped] Fetching: ${url}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        return response;
      }
      
      if (response.status === 429 || response.status === 503) {
        // Service unavailable - try next instance
        throw new Error(`Instance returned ${response.status}`);
      }
      
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      console.warn(`[Piped] Attempt ${attempt + 1} failed:`, error);
      lastError = error instanceof Error ? error : new Error(String(error));
      rotateInstance();
    }
  }
  
  console.error('[Piped] All instances failed:', lastError);
  return null;
};

/**
 * Поиск музыки через Piped API
 */
export const searchAudio = async (query: string): Promise<Song[]> => {
  try {
    const encodedQuery = encodeURIComponent(query);
    const response = await pipedFetch(`/search?q=${encodedQuery}&filter=music_songs`);
    
    if (!response) return [];
    
    const data = await response.json();
    
    if (!data.items || !Array.isArray(data.items)) {
      console.warn('[Piped] No items in response');
      return [];
    }

    return data.items
      .filter((item: any) => 
        item.type === 'stream' && 
        item.videoId && 
        item.title
      )
      .slice(0, 30)
      .map((item: any): Song => ({
        id: item.videoId,
        name: item.title || 'Неизвестный трек',
        artist: item.uploader || 'Неизвестный исполнитель',
        album: '',
        pic: item.thumbnail || `https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`,
        source: 'piped',
        duration: item.duration || 0,
        videoId: item.videoId,
        uploaderUrl: item.uploaderUrl,
        views: item.views || 0,
        uploaded: item.uploaded,
      }));
  } catch (error) {
    console.error('[Piped] Search error:', error);
    return [];
  }
};

/**
 * Получить информацию о видео
 */
export const getStreamInfo = async (videoId: string): Promise<{
  audioUrl: string | null;
  thumbnail: string;
  title: string;
  artist: string;
  duration: number;
} | null> => {
  try {
    const response = await pipedFetch(`/streams/${videoId}`);
    
    if (!response) return null;
    
    const data = await response.json();
    
    // Ищем лучший аудио формат
    const audioStreams = data.audioStreams || [];
    
    // Сортируем по качеству (высокое качество в начале)
    audioStreams.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
    
    const bestAudio = audioStreams[0];
    const audioUrl = bestAudio?.url || null;

    return {
      audioUrl,
      thumbnail: data.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
      title: data.title || 'Неизвестный трек',
      artist: data.uploader || 'Неизвестный исполнитель',
      duration: data.duration || 0,
    };
  } catch (error) {
    console.error('[Piped] Get stream info error:', error);
    return null;
  }
};

/**
 * Получить URL аудио для воспроизведения
 */
export const getAudioUrl = async (videoId: string): Promise<string | null> => {
  const info = await getStreamInfo(videoId);
  return info?.audioUrl || null;
};

/**
 * Получить популярные треки (тренды)
 */
export const getTrendingAudio = async (region: string = 'RU'): Promise<Song[]> => {
  try {
    // Piped не имеет встроенного API трендов, используем популярные запросы
    const trendingQueries = [
      'popular music 2024',
      'trending songs',
      'viral music',
      'new music 2024',
      'top hits 2024',
      'music trends',
    ];
    
    const randomQuery = trendingQueries[Math.floor(Math.random() * trendingQueries.length)];
    return searchAudio(randomQuery);
  } catch (error) {
    console.error('[Piped] Trending error:', error);
    return [];
  }
};

/**
 * Получить похожие видео (рекомендации)
 */
export const getRelatedAudio = async (videoId: string): Promise<Song[]> => {
  try {
    const response = await pipedFetch(`/streams/${videoId}/suggestions`);
    
    if (!response) return [];
    
    const data = await response.json();
    
    if (!Array.isArray(data)) return [];

    return data
      .filter((item: any) => item.videoId && item.title)
      .slice(0, 20)
      .map((item: any): Song => ({
        id: item.videoId,
        name: item.title || 'Неизвестный трек',
        artist: item.uploader || 'Неизвестный исполнитель',
        album: '',
        pic: item.thumbnail || `https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`,
        source: 'piped',
        duration: item.duration || 0,
        videoId: item.videoId,
      }));
  } catch (error) {
    console.error('[Piped] Related audio error:', error);
    return [];
  }
};

/**
 * Получить информацию о плейлисте
 */
export const getPlaylistInfo = async (playlistId: string): Promise<{
  name: string;
  songs: Song[];
} | null> => {
  try {
    const response = await pipedFetch(`/playlists/${playlistId}`);
    
    if (!response) return null;
    
    const data = await response.json();
    
    if (!data.relatedStreams || !Array.isArray(data.relatedStreams)) {
      return null;
    }

    const songs: Song[] = data.relatedStreams
      .filter((item: any) => item.videoId && item.title)
      .map((item: any): Song => ({
        id: item.videoId,
        name: item.title || 'Неизвестный трек',
        artist: item.uploader || 'Неизвестный исполнитель',
        album: '',
        pic: item.thumbnail || `https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`,
        source: 'piped',
        duration: item.duration || 0,
        videoId: item.videoId,
      }));

    return {
      name: data.name || 'Плейлист',
      songs,
    };
  } catch (error) {
    console.error('[Piped] Playlist info error:', error);
    return null;
  }
};

/**
 * Получить информацию о канале
 */
export const getChannelInfo = async (channelId: string): Promise<{
  name: string;
  songs: Song[];
} | null> => {
  try {
    const response = await pipedFetch(`/channels/${channelId}`);
    
    if (!response) return null;
    
    const data = await response.json();
    
    if (!data.relatedStreams || !Array.isArray(data.relatedStreams)) {
      return null;
    }

    const songs: Song[] = data.relatedStreams
      .filter((item: any) => item.videoId && item.title)
      .slice(0, 50)
      .map((item: any): Song => ({
        id: item.videoId,
        name: item.title || 'Неизвестный трек',
        artist: item.uploader || 'Неизвестный исполнитель',
        album: '',
        pic: item.thumbnail || `https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`,
        source: 'piped',
        duration: item.duration || 0,
        videoId: item.videoId,
      }));

    return {
      name: data.name || 'Канал',
      songs,
    };
  } catch (error) {
    console.error('[Piped] Channel info error:', error);
    return null;
  }
};

/**
 * Улучшенный поиск с фильтром по песням
 */
export const searchSongs = async (query: string, filter: string = 'music_songs'): Promise<Song[]> => {
  try {
    const response = await pipedFetch(`/search?q=${encodeURIComponent(query)}&filter=${filter}`);
    
    if (!response) return [];
    
    const data = await response.json();
    
    if (!data.items || !Array.isArray(data.items)) {
      return [];
    }

    return data.items
      .filter((item: any) => item.type === 'stream' && item.videoId && item.title)
      .slice(0, 30)
      .map((item: any): Song => ({
        id: item.videoId,
        name: item.title || 'Неизвестный трек',
        artist: item.uploader || 'Неизвестный исполнитель',
        album: '',
        pic: item.thumbnail || `https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`,
        source: 'piped',
        duration: item.duration || 0,
        videoId: item.videoId,
        uploaderUrl: item.uploaderUrl,
        views: item.views || 0,
      }));
  } catch (error) {
    console.error('[Piped] Search error:', error);
    return [];
  }
};
