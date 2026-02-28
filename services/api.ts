import { Song, TopList, TuneHubMethod, TuneHubResponse } from '../types';
import * as youtube from './youtube';
import * as piped from './piped';

// API использует YouTube через @hydralerne/youtube-api и Piped API
// Поддерживаются источники: 'youtube' и 'piped'
// Старые китайские API (NetEase, QQ, KuWo) удалены
// ytdlp-simple-api сервер больше не требуется - используем только CORS прокси

const FORBIDDEN_HEADERS = [
    'user-agent', 'referer', 'host', 'origin', 'cookie', 
    'sec-fetch-dest', 'sec-fetch-mode', 'sec-fetch-site', 
    'connection', 'content-length'
];

// 自建 CF Pages Function CORS 代理（国内外均可访问）
const SELF_HOSTED_PROXY = '/api/cors-proxy?url=';
const DEFAULT_PROXIES = [
    SELF_HOSTED_PROXY,
    'https://corsproxy.io/?',
];

const getStoredApiKey = () => localStorage.getItem('tunefree_api_key') || '';
const getStoredProxy = () => localStorage.getItem('tunefree_cors_proxy') || null;

// 获取存储的 API Base，如果没有则使用默认值
export const getStoredApiBase = () => {
    let base = localStorage.getItem('tunefree_api_base') || 'https://tunehub.sayqz.com/api';
    if (base.endsWith('/')) base = base.slice(0, -1);
    return base;
};

// 辅助函数：修复 URL
const fixUrl = (url: string | undefined): string => {
    if (!url || typeof url !== 'string') return '';
    let fixed = url.trim();

    if (fixed.startsWith('//')) {
        fixed = `https:${fixed}`;
    }

    if (fixed.startsWith('http://')) {
        fixed = fixed.replace('http://', 'https://');
    }

    return fixed;
};

/** 根据图片 URL 来源返回合适的 referrerPolicy */
export const getImgReferrerPolicy = (url?: string): React.HTMLAttributeReferrerPolicy => {
    if (!url) return 'no-referrer';
    if (url.includes('126.net') || url.includes('netease.com')) return 'no-referrer';
    return 'origin';
};

// 深度查找 ID
const findId = (item: any, platform: string): string | undefined => {
    if (!item) return undefined;
    
    if (platform === 'qq') {
        if (item.songmid) return String(item.songmid);
        if (item.mid) return String(item.mid);
        if (item.id) return String(item.id);
    }
    
    if (platform === 'kuwo') {
        if (item.rid) return String(item.rid);
        if (item.musicrid) return String(item.musicrid);
    }
    
    if (item.id) return String(item.id);
    if (item.ID) return String(item.ID);
    
    return undefined;
};

// 暴力查找图片字段
const findImage = (item: any): string => {
    if (!item) return '';
    const keys = [
        'picUrl', 'coverImgUrl', 'pic', 'thumbnail', 
        'img', 'cover', 'imgUrl', 'album_pic'
    ];
    for (const key of keys) {
        if (item[key] && typeof item[key] === 'string') {
            return item[key];
        }
    }
    return '';
};

/** 从原始 API 响应中提取歌曲原始数组 */
const extractRawTracks = (data: any): any[] => {
    if (!data) return [];
    if (data.result?.tracks) return data.result.tracks;
    if (data.playlist?.tracks) return data.playlist.tracks;
    if (data.result?.songs) return data.result.songs;
    if (data.items) return data.items;
    return [];
};

// 核心：智能列表提取器
const extractList = (data: any): any[] => {
    if (!data) return [];
    
    if (Array.isArray(data)) return data;

    const priorityKeys = ['tracks', 'songs', 'list', 'songlist', 'data', 'result', 'results'];
    
    for (const key of priorityKeys) {
        if (data[key] && Array.isArray(data[key])) {
            return data[key];
        }
    }

    if (data.data) {
        if (Array.isArray(data.data)) return data.data;
        for (const key of priorityKeys) {
            if (data.data[key] && Array.isArray(data.data[key])) {
                return data.data[key];
            }
        }
    }

    if (data.id && data.name) return [data];

    return [];
};

// 辅助函数：标准化歌曲对象
const normalizeSongs = (list: any[], platform: string): Song[] => {
    if (!Array.isArray(list)) return [];
    return list.map(item => {
        if (!item) return null;
        
        const actualItem = item.data ? item.data : item;
        const id = findId(actualItem, platform);
        
        let artist = actualItem.artist;
        if (!artist) {
            if (Array.isArray(actualItem.ar)) artist = actualItem.ar.map((a:any) => a.name).join('/');
            else if (Array.isArray(actualItem.artists)) artist = actualItem.artists.map((a:any) => a.name).join('/');
            else if (actualItem.uploaderName) artist = actualItem.uploaderName;
        }

        let album = actualItem.album;
        if (typeof album === 'object' && album !== null && album.name) {
            album = album.name;
        }

        let pic = findImage(actualItem);
        pic = fixUrl(pic);

        const finalId = id !== undefined ? id : `temp_${Math.random().toString(36).slice(2)}`;

        return {
            ...actualItem,
            source: platform,
            id: finalId,
            name: String(actualItem.name || actualItem.title || 'Unknown Song'),
            artist: String(artist || 'Unknown Artist'),
            album: String(album || ''),
            pic: String(pic || ''),
            isValidId: id !== undefined
        };
    }).filter(Boolean) as Song[];
};

async function tuneHubFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T | null> {
    const apiKey = getStoredApiKey();
    const apiBase = getStoredApiBase();

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...((options.headers as any) || {}),
    };

    if (apiKey && endpoint.includes('/parse')) {
        headers['X-API-Key'] = apiKey;
    }

    try {
        const response = await fetch(`${apiBase}${endpoint}`, { ...options, headers });
        
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('text/html')) {
            console.error(`TuneHub API Error [${endpoint}]: Received HTML instead of JSON.`);
            return null;
        }

        if (response.status === 401) {
            console.warn('TuneHub: Unauthorized.');
            return null;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (e) {
        console.error(`TuneHub API Error [${endpoint}]:`, e);
        return null;
    }
}

export async function executeMethod<T>(platform: string, fn: string, variables: Record<string, string> = {}): Promise<T | null> {
    const res = await tuneHubFetch<TuneHubResponse<TuneHubMethod>>(`/v1/methods/${platform}/${fn}`);
    if (!res || res.code !== 0 || !res.data) return null;

    const config = res.data;
    
    const storedProxy = getStoredProxy();
    const proxies = storedProxy ? [storedProxy] : DEFAULT_PROXIES;
    
    const evalExpr = (expr: string): any => {
        try {
            const keys = Object.keys(variables);
            const vals = keys.map(k => variables[k]);
            return new Function(...keys, `"use strict"; return (${expr});`)(...vals);
        } catch { return ''; }
    };

    const replaceTemplate = (str: string): string => {
        return str.replace(/\{\{(.*?)\}\}/g, (_, expr) => String(evalExpr(expr)));
    };

    const processBody = (obj: any): any => {
        if (typeof obj === 'string') {
            const fullMatch = obj.match(/^\{\{(.*)\}\}$/);
            if (fullMatch) return evalExpr(fullMatch[1]);
            return replaceTemplate(obj);
        }
        if (Array.isArray(obj)) return obj.map(processBody);
        if (typeof obj === 'object' && obj !== null) {
            const result: any = {};
            for (const [k, v] of Object.entries(obj)) result[k] = processBody(v);
            return result;
        }
        return obj;
    };

    let requestUrl = replaceTemplate(config.url);
    if (config.params) {
        const finalParams = new URLSearchParams();
        for (const [k, v] of Object.entries(config.params)) {
            finalParams.append(k, replaceTemplate(v));
        }
        requestUrl += (requestUrl.includes('?') ? '&' : '?') + finalParams.toString();
    }

    const safeHeaders: Record<string, string> = {};
    if (config.headers) {
        for (const [k, v] of Object.entries(config.headers)) {
            if (!FORBIDDEN_HEADERS.includes(k.toLowerCase())) {
                safeHeaders[k] = v;
            }
        }
    }

    requestUrl = fixUrl(requestUrl);

    for (const proxy of proxies) {
        let finalFetchUrl = `${proxy}${encodeURIComponent(requestUrl)}`;

        try {
            console.log(`Trying proxy: ${proxy} -> ${requestUrl}`);

            const isSelfProxy = proxy === SELF_HOSTED_PROXY;
            const fetchOpts: RequestInit = {
                method: config.method,
                headers: safeHeaders,
                ...(isSelfProxy ? {} : { mode: 'cors' as RequestMode }),
                credentials: 'omit'
            };
            if (config.body) {
                fetchOpts.body = JSON.stringify(processBody(config.body));
                if (!safeHeaders['Content-Type']) {
                    safeHeaders['Content-Type'] = 'application/json';
                }
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);
            fetchOpts.signal = controller.signal;

            const response = await fetch(finalFetchUrl, fetchOpts);
            clearTimeout(timeoutId);
            
            const rawText = await response.text();
            
            let rawData: any = null;
            
            try {
                rawData = JSON.parse(rawText);
            } catch (e) {
                try {
                    const match = rawText.match(/^\s*[\w\.]+\s*\((.*)\)\s*;?\s*$/s);
                    if (match && match[1]) {
                        rawData = JSON.parse(match[1]);
                    }
                } catch (e2) {
                    // JSONP parse failed
                }
            }
            
            if (!rawData) {
                console.warn(`Proxy ${proxy} returned unparsable data.`);
                continue;
            }

            if (Array.isArray(rawData) && rawData.length > 0 && (rawData[0] === "-1" || rawData[0] === -1)) {
                console.warn(`Proxy ${proxy} returned garbage data. Skipping.`);
                continue;
            }

            if (config.transform) {
                try {
                    const transformer = new Function(`return ${config.transform}`)();
                    const transformed = transformer(rawData);

                    if (!transformed) {
                        return rawData;
                    }

                    if (Array.isArray(transformed) && transformed.length > 0 && !transformed[0].pic) {
                        const rawTracks = extractRawTracks(rawData);
                        if (rawTracks.length > 0) {
                            const idToRaw = new Map<string, any>();
                            for (const rt of rawTracks) {
                                const rid = String(rt.id || '').replace('MUSIC_', '');
                                if (rid) idToRaw.set(rid, rt);
                            }
                            for (let i = 0; i < transformed.length; i++) {
                                const item = transformed[i];
                                const raw = idToRaw.get(String(item.id)) || rawTracks[i];
                                if (!raw) continue;
                                let pic = raw.al?.picUrl || raw.album?.picUrl || findImage(raw) || '';
                                if (pic) item.pic = pic;
                            }
                        }
                    }

                    return transformed;
                } catch (e) {
                    console.log("[Transform] fallback to rawData:", (e as Error)?.message);
                    return rawData;
                }
            }
            return rawData;
        } catch (e) {
            console.warn(`Fetch failed via proxy ${proxy}:`, e);
        }
    }

    console.error("All proxies failed.");
    return null;
}

export const parseSongs = async (ids: string, platform: string, quality: string = '320k') => {
    if (!ids || !platform) return null;
    if (String(ids).startsWith('temp_')) return null;

    const res = await tuneHubFetch<TuneHubResponse<any>>('/v1/parse', {
        method: 'POST',
        body: JSON.stringify({ platform, ids, quality })
    });

    if (!res || !res.data) return null;
    return extractList(res.data);
};

// ====== ПОИСК: поддержка @hydralerne/youtube-api и Piped API ======

export const searchSongs = async (keyword: string, platform: string = 'youtube', page: number = 1): Promise<Song[]> => {
    // Поддерживаем оба источника
    if (platform === 'piped') {
        return piped.searchAudio(keyword);
    }
    
    // YouTube по умолчанию
    return youtube.searchAudio(keyword, page);
};

export const searchAggregate = async (keyword: string, page: number = 1): Promise<Song[]> => {
    // Агрегированный поиск - совмещаем результаты из обоих источников
    try {
        const [youtubeResults, pipedResults] = await Promise.all([
            youtube.searchAudio(keyword, page).catch(() => []),
            piped.searchAudio(keyword).catch(() => [])
        ]);
        
        // Объединяем и удаляем дубликаты
        const combined = [...youtubeResults, ...pipedResults];
        const uniqueMap = new Map<string, Song>();
        
        combined.forEach(song => {
            const key = `${song.name.toLowerCase()}|${song.artist.toLowerCase()}`;
            if (!uniqueMap.has(key)) {
                uniqueMap.set(key, song);
            }
        });
        
        return Array.from(uniqueMap.values()).slice(0, 50);
    } catch (error) {
        console.error('Aggregated search error:', error);
        return youtube.searchAudio(keyword, page);
    }
};

// ====== ЧАРТЫ: поддержка YouTube и Piped тренды ======

export const getTopLists = async (platform: string = 'youtube'): Promise<TopList[]> => {
    // Возвращаем виртуальные "топы" для обоих источников
    if (platform === 'piped') {
        return [{
            id: 'trending',
            name: 'Популярное (Piped)',
            updateFrequency: 'Ежедневное обновление',
            picUrl: '',
            coverImgUrl: ''
        }];
    }
    
    return [{
        id: 'trending',
        name: 'Популярное (YouTube)',
        updateFrequency: 'Ежедневное обновление',
        picUrl: '',
        coverImgUrl: ''
    }];
};

export const getTopListDetail = async (id: string | number, platform: string = 'youtube'): Promise<Song[]> => {
    // Получаем тренды в зависимости от платформы
    if (platform === 'piped') {
        return piped.getTrendingAudio('RU');
    }
    
    return youtube.getTrendingAudio('RU');
};

export const getPlaylistDetail = async (id: string, platform: string = 'youtube'): Promise<{name: string, songs: Song[]} | null> => {
    // Для YouTube и Piped плейлистов
    if (platform === 'piped' || id.startsWith('OLAK') || id.match(/^[A-Za-z0-9_-]{30,}$/)) {
        const result = await piped.getPlaylistInfo(id);
        if (result) return result;
    }
    
    if (platform === 'youtube' || id.startsWith('PL') || id.length > 20) {
        const result = await youtube.getPlaylistInfo(id);
        if (result) return result;
    }
    
    const data: any = await executeMethod(platform, 'playlist', { id });
    if (!data) return null;
    
    const name = data.name || data.info?.name || data.playlist?.name || "Плейлист";
    
    return {
        name: String(name),
        songs: normalizeSongs(extractList(data), platform)
    };
};

// ====== ИНФОРМАЦИЯ О ТРЕКЕ ======

export const getSongInfo = async (id: string | number, source: string = 'youtube'): Promise<any | null> => {
    // Для Piped используем getStreamInfo
    if (source === 'piped') {
        const info = await piped.getStreamInfo(String(id));
        if (!info) return null;
        return {
            id: String(id),
            name: info.title,
            artist: info.artist,
            album: '',
            pic: info.thumbnail,
            source: 'piped',
            duration: info.duration,
        };
    }
    
    // Для YouTube используем @hydralerne/youtube-api
    if (source === 'youtube') {
        const info = await youtube.getAudioInfo(String(id));
        if (!info) return null;
        return {
            id: String(id),
            name: info.title,
            artist: info.artist,
            album: '',
            pic: info.thumbnail,
            source: 'youtube',
            duration: info.duration,
        };
    }

    // Fallback для старых источников
    const data = await parseSongs(String(id), source);
    if (!data || data.length === 0) return null;
    const song = normalizeSongs(data, source)[0];
    return song;
};

export const getSongUrl = async (id: string | number, source: string = 'youtube', quality: string = '320k'): Promise<string | null> => {
    if (!source || source === 'undefined') return null;
    
    // Для Piped используем getAudioUrl
    if (source === 'piped') {
        return piped.getAudioUrl(String(id));
    }
    
    // Для YouTube используем @hydralerne/youtube-api
    if (source === 'youtube') {
        return youtube.getAudioUrl(String(id));
    }
    
    // Fallback для старых источников
    const data = await parseSongs(String(id), source, quality);
    let url = data?.[0]?.url;
    return fixUrl(url) || null;
};

// ====== ЛИРИКА ======

export const getLyrics = async (id: string | number, source: string): Promise<string> => {
    // YouTube/Piped не предоставляет lyrics
    if (source === 'youtube') {
        return '';
    }

    // Fallback для старых источников
    const data = await parseSongs(String(id), source);
    const lrc = data?.[0]?.lrc || data?.[0]?.lyric || data?.[0]?.lyrics || "";
    if (lrc) return lrc;

    return '';
};

// ====== ПОЛНАЯ ИНФОРМАЦИЯ О ТРЕКЕ ======

// Кэш парсинга
const _parseCache = new Map<string, { data: any[]; timestamp: number }>();
const PARSE_CACHE_TTL = 5 * 60 * 1000; // 5 минут

export const parseSongFull = async (
    id: string | number, platform: string = 'youtube', quality: string = '320k'
): Promise<{ url: string | null; lrc: string; pic: string } | null> => {
    if (!id || String(id).startsWith('temp_')) return null;

    // Для Piped используем getStreamInfo
    if (platform === 'piped') {
        const pipedInfo = await piped.getStreamInfo(String(id));
        if (!pipedInfo) return null;
        return {
            url: pipedInfo.audioUrl,
            lrc: '', // Piped не предоставляет lyrics
            pic: pipedInfo.thumbnail
        };
    }

    // Для YouTube используем @hydralerne/youtube-api
    if (platform === 'youtube') {
        const ytInfo = await youtube.getAudioInfo(String(id));
        if (!ytInfo) return null;
        return {
            url: ytInfo.audioUrl,
            lrc: '', // YouTube не предоставляет lyrics
            pic: ytInfo.thumbnail
        };
    }

    // Fallback для старых источников
    const cacheKey = `${platform}:${id}:${quality}`;
    const cached = _parseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < PARSE_CACHE_TTL) {
        const item = cached.data[0];
        const normalized = normalizeSongs(cached.data, platform)[0];
        return {
            url: fixUrl(item?.url) || null,
            lrc: item?.lrc || item?.lyric || item?.lyrics || '',
            pic: normalized?.pic || ''
        };
    }

    const data = await parseSongs(String(id), platform, quality);
    if (!data || data.length === 0) return null;

    _parseCache.set(cacheKey, { data, timestamp: Date.now() });

    const item = data[0];
    const normalized = normalizeSongs(data, platform)[0];

    return {
        url: fixUrl(item?.url) || null,
        lrc: item?.lrc || item?.lyric || item?.lyrics || '',
        pic: normalized?.pic || ''
    };
};

// ====== СКАЧИВАНИЕ ======

export const triggerDownload = (url: string, filename: string) => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};
