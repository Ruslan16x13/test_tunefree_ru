import { Song } from '../types';

/**
 * Piped API - альтернативный интерфейс к YouTube
 * Поддерживает несколько инстанций для надежности
 */

// Список публичных Piped API инстанций
// Замечание: многие хосты публичных прокси ненадёжны. Порядок влияет на
// вероятность получения рабочего результата, поэтому самую стабильную
// (если она есть) желательно поместить в начало. Пустые/сломанные домены
// будут автоматически пропускаться.
const PIPED_INSTANCES = [
  // раньше использовался `pipedapi.adminforge.de`, но он переадресовывает на
  // несуществующий домен и вызывает HTTP 530 при проксировании через CF.
  // Удаляем его из списка, оставляя меньше шансов получить 530.
  'https://pipedapi.moomoo.me',
  'https://api.piped.moomoo.me',
  'https://piped-api.hypercrab.xyz',
];

// Текущий индекс инстанции — будет двигаться по массиву по кругу, чтобы
// при следующем запросе начинать со следующей точки.
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
/**
 * Выполняет запрос к Piped API. При неудаче перебирает все доступные инстанции
 * и возвращает первый успешный ответ. Если ни одна точка не отвечает, возвращает
 * null.
 *
 * Обратите внимание: публичные прокси довольно ненадёжны, поэтому логика
 * здесь ориентирована на плавный отказ и автоматическое переключение.
 */
const pipedFetch = async (endpoint: string): Promise<Response | null> => {
  let lastError: Error | null = null;

  // Сохраним стартовую позицию, чтобы потом продвинуть currentInstanceIndex,
  // начиная со следующей точки (round‑robin).
  const startIndex = currentInstanceIndex;
  const len = PIPED_INSTANCES.length;

  for (let i = 0; i < len; i++) {
    const idx = (startIndex + i) % len;
    const instance = PIPED_INSTANCES[idx];
    const url = `${instance}${endpoint}`;
    console.log(`[Piped] Trying instance ${instance}${endpoint}`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      // Проксируем через наш CORS-прокси для обхода браузерных ограничений.
      const proxyUrl = `/api/cors-proxy?url=${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal,
        // не следовать редиректам, иначе CF может получить 530 при
        // попытке дойти до неразрешимого домена (как у adminforge).
        redirect: 'manual',
      });

      clearTimeout(timeoutId);

      // Если получили перенаправление — игнорируем эту инстанцию.
      if (response.status >= 300 && response.status < 400) {
        const loc = response.headers.get('location');
        console.warn(`[Piped] instance ${instance} returned redirect to ${loc}`);
        lastError = new Error(`redirect ${response.status}`);
        continue; // следующая инстанция
      }

      if (response.ok) {
        // Передвигаем глобальный указатель на следующий элемент, чтобы
        // следующая операция начиналась с другого инстанса.
        currentInstanceIndex = (idx + 1) % len;
        return response;
      }

      // любые другие статусы считаются ошибкой
      console.warn(`[Piped] instance ${instance} returned HTTP ${response.status}`);
      lastError = new Error(`HTTP ${response.status}`);
      // продолжаем цикл, не выбрасывая, чтобы перейти к следующей точке
    } catch (error) {
      console.warn(`[Piped] error contacting ${instance}:`, error);
      lastError = error instanceof Error ? error : new Error(String(error));
      // если fetch выкинул исключение, будем двигаться дальше
    }
  }

  // Все инстанции перепробованы, продвинем указатель на начало следующего
  // цикла и вернём null.
  currentInstanceIndex = (startIndex + 1) % len;
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
