import { Song } from '../types';

// URL CORS прокси для YouTube API
const CORS_PROXY_URL = '/api/cors-proxy?url=';

// Переопределяем fetch для использования прокси
const originalFetch = window.fetch;
const proxiedFetch = (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const urlString = url.toString();
  
  // Проксируем только YouTube запросы
  if (urlString.includes('youtube.com') || urlString.includes('googlevideo.com')) {
    const proxyUrl = CORS_PROXY_URL + encodeURIComponent(urlString);
    return originalFetch(proxyUrl, init);
  }
  
  return originalFetch(url, init);
};

// Динамический импорт библиотеки @hydralerne/youtube-api
let youtubeModule: any = null;

const loadYoutubeModule = async () => {
  if (typeof window === 'undefined') return null;
  if (youtubeModule) return youtubeModule;
  
  try {
    window.fetch = proxiedFetch;
    youtubeModule = await import('@hydralerne/youtube-api');
    window.fetch = originalFetch;
    return youtubeModule;
  } catch (error) {
    window.fetch = originalFetch;
    console.error('Ошибка загрузки YouTube API модуля:', error);
    return null;
  }
};


// Поиск аудио через YouTube API
export const searchAudio = async (query: string, page: number = 1): Promise<Song[]> => {
  const mod = await loadYoutubeModule();
  if (!mod || !mod.youtubeMusicSearch) {
    console.error('YouTube API модуль не доступен');
    return [];
  }

  try {
    window.fetch = proxiedFetch;
    const results = await mod.youtubeMusicSearch(query);
    window.fetch = originalFetch;
    
    if (!results || !Array.isArray(results)) {
      return [];
    }

    return results
      .filter((item: any) => item && (item.videoId || item.id))
      .map((item: any): Song => {
        const videoId = item.videoId || item.id;
        return {
          id: videoId,
          name: item.title || 'Неизвестный трек',
          artist: item.artist || item.author || 'Неизвестный исполнитель',
          album: item.album || '',
          pic: item.thumbnail || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
          source: 'youtube',
          duration: item.duration || 0,
          isValidId: true,
          videoId: videoId,
          uploaderUrl: item.artistUrl || item.uploaderUrl,
          uploaded: item.uploaded,
          views: item.views,
        };
      });
  } catch (error) {
    window.fetch = originalFetch;
    console.error('Ошибка поиска:', error);
    return [];
  }
};

// Получить информацию о видео через YouTube API
export const getAudioInfo = async (videoId: string): Promise<{
  audioUrl: string | null;
  thumbnail: string;
  title: string;
  artist: string;
  duration: number;
} | null> => {
  const mod = await loadYoutubeModule();
  if (!mod) {
    console.error('YouTube API модуль не доступен');
    return null;
  }

  try {
    window.fetch = proxiedFetch;
    
    // Пробуем получить данные через getData
    let data: any = null;
    try {
      if (mod.getData) {
        data = await mod.getData(videoId);
        console.log('getData result:', data ? 'success' : 'null');
      }
    } catch (e) {
      console.log('getData failed:', e);
    }
    
    // Fallback на getTrackData
    if (!data && mod.getTrackData) {
      try {
        data = await mod.getTrackData(videoId);
        console.log('getTrackData result:', data ? 'success' : 'null');
      } catch (e) {
        console.log('getTrackData failed:', e);
      }
    }
    
    window.fetch = originalFetch;
    
    if (!data) {
      console.error('Не удалось получить данные о треке');
      return null;
    }

    // Извлекаем аудио URL из adaptiveFormats или formats
    let audioUrl: string | null = null;
    const formats = data.adaptiveFormats || data.formats || [];
    
    // Ищем лучший аудио формат
    const audioFormats = formats.filter((f: any) => 
      f.mimeType?.includes('audio') || f.audioQuality
    );
    
    // Сортируем по качеству
    audioFormats.sort((a: any, b: any) => {
      const qualityOrder = ['AUDIO_QUALITY_LOW', 'AUDIO_QUALITY_MEDIUM', 'AUDIO_QUALITY_HIGH'];
      const aIndex = qualityOrder.indexOf(a.audioQuality);
      const bIndex = qualityOrder.indexOf(b.audioQuality);
      return bIndex - aIndex;
    });
    
    // Берем лучший аудио формат
    const bestAudio = audioFormats[0];
    if (bestAudio) {
      audioUrl = bestAudio.url || bestAudio.signatureCipher?.url || null;
    }

    // Если нет аудио форматов, берем любой формат с URL
    if (!audioUrl && formats.length > 0) {
      const formatWithUrl = formats.find((f: any) => f.url);
      audioUrl = formatWithUrl?.url || null;
    }

    console.log('Extracted audio info:', {
      audioUrl: audioUrl ? 'present' : 'missing',
      title: data.title || data.videoDetails?.title,
      artist: data.author || data.videoDetails?.author,
    });

    return {
      audioUrl,
      thumbnail: data.thumbnail?.[0]?.url || 
                 data.videoDetails?.thumbnail?.thumbnails?.[0]?.url ||
                 `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
      title: data.title || data.videoDetails?.title || 'Неизвестный трек',
      artist: data.author || data.videoDetails?.author || 'Неизвестный исполнитель',
      duration: data.lengthSeconds || data.videoDetails?.lengthSeconds || 0,
    };
  } catch (error) {
    window.fetch = originalFetch;
    console.error('Ошибка получения аудио:', error);
    return null;
  }
};

// Получить URL аудио для воспроизведения
export const getAudioUrl = async (videoId: string): Promise<string | null> => {
  const info = await getAudioInfo(videoId);
  return info?.audioUrl || null;
};

// Получить популярные музыкальные треки (тренды) через поиск
export const getTrendingAudio = async (region: string = 'RU'): Promise<Song[]> => {
  const trendingQueries = [
    'популярная музыка 2024',
    'хиты youtube music',
    'тренды музыки',
    'новинки музыки',
    'популярные песни',
    'music hits 2024',
    'viral music',
    'trending songs'
  ];
  
  const randomQuery = trendingQueries[Math.floor(Math.random() * trendingQueries.length)];
  return searchAudio(randomQuery, 1);
};

// Получить связанные видео (похожие треки)
export const getRelatedAudio = async (videoId: string): Promise<Song[]> => {
  const mod = await loadYoutubeModule();
  if (!mod || !mod.getYTMusicRelated) {
    return [];
  }

  try {
    window.fetch = proxiedFetch;
    const results = await mod.getYTMusicRelated(videoId);
    window.fetch = originalFetch;
    
    if (!results || !Array.isArray(results)) {
      return [];
    }

    return results
      .filter((item: any) => item && (item.videoId || item.id))
      .slice(0, 20)
      .map((item: any): Song => {
        const relatedVideoId = item.videoId || item.id;
        return {
          id: relatedVideoId,
          name: item.title || 'Неизвестный трек',
          artist: item.artist || item.author || 'Неизвестный исполнитель',
          album: item.album || '',
          pic: item.thumbnail || `https://i.ytimg.com/vi/${relatedVideoId}/mqdefault.jpg`,
          source: 'youtube',
          duration: item.duration || 0,
          isValidId: true,
          videoId: relatedVideoId,
          uploaderUrl: item.artistUrl || item.uploaderUrl,
          uploaded: item.uploaded,
          views: item.views,
        };
      });
  } catch (error) {
    window.fetch = originalFetch;
    console.error('Ошибка получения похожих треков:', error);
    return [];
  }
};

// Получить информацию о плейлисте
export const getPlaylistInfo = async (playlistId: string): Promise<{
  name: string;
  songs: Song[];
} | null> => {
  const mod = await loadYoutubeModule();
  if (!mod || !mod.getYoutubeList) {
    return null;
  }

  try {
    window.fetch = proxiedFetch;
    const playlist = await mod.getYoutubeList(playlistId);
    window.fetch = originalFetch;
    
    if (!playlist || !playlist.items || !Array.isArray(playlist.items)) {
      return null;
    }

    const songs: Song[] = playlist.items
      .filter((item: any) => item && (item.videoId || item.id))
      .map((item: any): Song => {
        const videoId = item.videoId || item.id;
        return {
          id: videoId,
          name: item.title || 'Неизвестный трек',
          artist: item.artist || item.author || 'Неизвестный исполнитель',
          album: item.album || '',
          pic: item.thumbnail || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
          source: 'youtube',
          duration: item.duration || 0,
          isValidId: true,
          videoId: videoId,
          uploaderUrl: item.artistUrl || item.uploaderUrl,
          uploaded: item.uploaded,
          views: item.views,
        };
      });

    return {
      name: playlist.title || 'Плейлист',
      songs,
    };
  } catch (error) {
    window.fetch = originalFetch;
    console.error('Ошибка получения плейлиста:', error);
    return null;
  }
};
