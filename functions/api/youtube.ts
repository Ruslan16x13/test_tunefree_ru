import type { PagesFunction } from '.';

/**
 * Cloudflare Pages Function — серверный обработчик YouTube (youtubei.js / Innertube)
 * Маршрут: /api/youtube?videoId=<id>
 *
 * Возвращает JSON: { url, mimeType, bitrate, thumbnail, title, artist }
 */

const CACHE: Map<string, any> = new Map();
const CACHE_TTL = 1000 * 60 * 5; // 5 минут

function corsHeaders(request: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function jsonResponse(data: any, status: number = 200, request?: Request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(request ? corsHeaders(request) : {}),
    },
  });
}

export const onRequest: PagesFunction = async (context) => {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  const url = new URL(request.url);
  const videoId = url.searchParams.get('videoId') || url.searchParams.get('id');
  if (!videoId) return jsonResponse({ error: 'missing videoId' }, 400, request);

  // simple cache
  const cacheKey = `yt:${videoId}`;
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return jsonResponse(cached.value, 200, request);
  }

  try {
    // dynamic import of youtubei.js (Innertube) — worker build supports it in examples
    const mod = await import('youtubei.js');
    const Innertube = (mod as any).Innertube || (mod as any).default || mod;
    const yt = await Innertube.create();

    // try to get deciphered streaming data (choose format) — prefer audio
    let format: any = null;
    try {
      // getStreamingData returns a Format with url after decipher
      format = await yt.getStreamingData(videoId, { quality: 'high' });
    } catch (e) {
      // fallback to getInfo + getStreamingInfo
      try {
        const info = await yt.getInfo(videoId);
        const streaming = await info.getStreamingInfo();
        // take first audio representation
        const audioSet = (streaming.audio_sets && streaming.audio_sets[0]) || null;
        const rep = audioSet?.representations?.[0];
        if (rep && rep.segment_info) {
          // rep.segment_info may contain init_url or media_url; prefer init_url if present
          format = { url: rep.segment_info.init_url || rep.segment_info.media_url, mimeType: audioSet.mime_type, bitrate: rep.bitrate };
        }
      } catch (er) {
        console.warn('[youtube function] fallback failed', er);
      }
    }

    if (!format || !format.url) {
      return jsonResponse({ error: 'no_stream' }, 502, request);
    }

    const result = {
      url: format.url,
      mimeType: format.mimeType || format.mime_type || '',
      bitrate: format.bitrate || 0,
      thumbnail: (format.thumbnail || '') as string,
      title: (format.title || '') as string,
      artist: (format.artist || '') as string,
    };

    CACHE.set(cacheKey, { ts: Date.now(), value: result });
    return jsonResponse(result, 200, request);
  } catch (e: any) {
    console.error('[youtube function] error', e);
    return jsonResponse({ error: e?.message || String(e) }, 500, request);
  }
};
