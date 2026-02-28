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
let PIPED_INSTANCES = [
  // с 2026‑03 многие публичные инстансы либо блокируют Cloudflare, либо
  // возвращают 502. Списки можно дополнять по необходимости, но в любом случае
  // полагаться на этот массив нельзя – он будет считаться временной
  // «кеш‑трубой».
  'https://pipedapi.moomoo.me',
  'https://api.piped.moomoo.me',
  'https://piped-api.hypercrab.xyz',
];

// Если задан URL со списком публичных инстансов (через Vite env), попытаемся
// загрузить его и расширить/заменить локальный массив. Формат — JSON массив
// объектов с полем `api_url` или простой массив URL-строк.
const INSTANCE_LIST_URL = (import.meta as any).env?.VITE_PIPED_INSTANCES as string | undefined;

const updateInstances = async () => {
  if (!INSTANCE_LIST_URL) return;
  try {
    const proxyUrl = `/api/cors-proxy?url=${encodeURIComponent(INSTANCE_LIST_URL)}`;
    const resp = await fetch(proxyUrl, { headers: { Accept: 'application/json' } });
    if (!resp.ok) return;
    const json = await resp.json();
    let instances: string[] = [];
    if (Array.isArray(json)) {
      if (json.length > 0 && typeof json[0] === 'string') instances = json;
      else if (typeof json[0] === 'object' && json[0].api_url) instances = json.map((x: any) => x.api_url).filter(Boolean);
    }
    if (instances.length > 0) {
      // Поместим новые инстансы в начало — они, вероятно, актуальнее.
      PIPED_INSTANCES = [...instances, ...PIPED_INSTANCES.filter(i => !instances.includes(i))];
      console.info('[Piped] loaded remote instances:', PIPED_INSTANCES);
    }
  } catch (e) {
    console.warn('[Piped] failed to load remote instances:', e);
  }
};

// Попытка загрузки списка инстансов при инициализации модуля
void updateInstances();

// Текущее индекс инстанции — используется как отправная точка для
// перебора доступных адресов.
let currentInstanceIndex = 0;

// Отмечаем экземпляры, которые недавно начали выдавать ошибки. Хосты в
// этой таблице игнорируются в течение указанного таймаута, после чего мы
// попытаемся снова.
const BROKEN_INSTANCES: Record<string, number> = {};
const BROKEN_TIMEOUT = 1000 * 60 * 5; // 5 минут

// Текущий индекс инстанции — будет двигаться по массиву по кругу, чтобы
// при следующем запросе начинать со следующей точки.
// (объявлен один раз выше)

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
  const now = Date.now();
  // выбираем только экземпляры, не помеченные как "сломанные" в последние
  // BROKEN_TIMEOUT милисекунд.
  const available = PIPED_INSTANCES.filter(inst => {
    const t = BROKEN_INSTANCES[inst];
    return t === undefined || now - t > BROKEN_TIMEOUT;
  });

  // Вычислим стартовую позицию в списке доступных инстансов. Если текущая
  // инстанция отсутствует в списке доступных (например, была помечена
  // сломанной), начнём с нуля.
  const startIndex = (() => {
    const nowStart = currentInstanceIndex % PIPED_INSTANCES.length;
    const orig = PIPED_INSTANCES[nowStart];
    const idxInAvailable = available.indexOf(orig);
    return idxInAvailable >= 0 ? idxInAvailable : 0;
  })();

  if (available.length === 0) {
    // ничего не осталось — сразу возвращаем null
    console.warn('[Piped] no available instances (all marked broken)');
    return null;
  }

  const len = available.length;

  for (let i = 0; i < len; i++) {
    const idx = (startIndex + i) % len;
    const instance = available[idx];
    const url = `${instance}${endpoint}`;
    console.log(`[Piped] Trying instance ${instance}${endpoint}`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const proxyUrl = `/api/cors-proxy?url=${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal,
        redirect: 'manual',
      });

      clearTimeout(timeoutId);

      if (response.status >= 300 && response.status < 400) {
        const loc = response.headers.get('location');
        console.warn(`[Piped] instance ${instance} returned redirect to ${loc}`);
        lastError = new Error(`redirect ${response.status}`);
        BROKEN_INSTANCES[instance] = now;
        continue;
      }

      // Проверим content-type — ожидаем JSON от Piped API. Иногда инстансы
      // возвращают HTML фронтенда или ошибку в виде HTML, это значит, что
      // инстанс неподходящий для API‑запросов.
      const ct = response.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        console.warn(`[Piped] instance ${instance} returned non-json content-type: ${ct}`);
        lastError = new Error(`non-json ${ct}`);
        BROKEN_INSTANCES[instance] = now;
        continue;
      }

      if (response.ok) {
        // Обновляем глобальный указатель на оригинальном списке инстансов
        const origIdx = PIPED_INSTANCES.indexOf(instance);
        if (origIdx >= 0) currentInstanceIndex = (origIdx + 1) % PIPED_INSTANCES.length;
        return response;
      }

      console.warn(`[Piped] instance ${instance} returned HTTP ${response.status}`);
      lastError = new Error(`HTTP ${response.status}`);
      BROKEN_INSTANCES[instance] = now;
    } catch (error) {
      console.warn(`[Piped] error contacting ${instance}:`, error);
      lastError = error instanceof Error ? error : new Error(String(error));
      BROKEN_INSTANCES[instance] = now;
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
 * Возвращает `true`, если есть хотя бы одна инстанция, не помеченная как
 * сломанная (или у которой закончился таймаут). Клиент может использовать
 * это, чтобы отключать элементы UI, если Piped недоступен.
 */
export const isAvailable = (): boolean => {
  const now = Date.now();
  return PIPED_INSTANCES.some(inst => {
    const t = BROKEN_INSTANCES[inst];
    return t === undefined || now - t > BROKEN_TIMEOUT;
  });
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
