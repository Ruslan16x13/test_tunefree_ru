/**
 * Cloudflare Pages Function — CORS прокси
 * Маршрут: /api/cors-proxy?url=<encoded_url>
 *
 * Альтернатива внешним CORS прокси (corsproxy.io и др.), доступна напрямую.
 * Поддерживает GET/POST/PUT/DELETE, прозрачная передача тела запроса и Content-Type.
 */

// Разрешённые целевые домены (защита от злоупотребления как открытый прокси)
const ALLOWED_HOSTS = [
    'music.163.com',
    'interface.music.163.com',
    'interface3.music.163.com',
    'u.y.qq.com',
    'c.y.qq.com',
    'shc.y.qq.com',
    'y.gtimg.cn',
    'search.kuwo.cn',
    'www.kuwo.cn',
    'kuwo.cn',
    'artistpicserver.kuwo.cn',
    'kbangserver.kuwo.cn',
    'kwcdn.kuwo.cn',
    'mobi.kuwo.cn',
    'nmobi.kuwo.cn',
    'musicpay.kuwo.cn',
    'm.kuwo.cn',
    // YouTube для @hydralerne/youtube-api
    'www.youtube.com',
    'youtube.com',
    'music.youtube.com',
    'googlevideo.com',
    'ytimg.com',
    'i.ytimg.com',
    'youtubei.googleapis.com',
    // Piped API для получения аудио
    'api.piped.projectk.repl.co',
    'api.piped.privacydev.net',
    'pipedapi.adminforge.de',
    'pipedapi.moomoo.me',
];

export const onRequest: PagesFunction = async (context) => {
    const { request } = context;

    // Обработка CORS preflight запросов
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: corsHeaders(request),
        });
    }

    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) {
        return jsonResponse({ error: 'Отсутствует параметр ?url=' }, 400, request);
    }

    let parsedTarget: URL;
    try {
        parsedTarget = new URL(targetUrl);
    } catch {
        return jsonResponse({ error: 'Некорректный целевой URL' }, 400, request);
    }

    // Проверка белого списка
    if (!ALLOWED_HOSTS.some(host => parsedTarget.hostname === host || parsedTarget.hostname.endsWith('.' + host))) {
        return jsonResponse({ error: `Хост не разрешён: ${parsedTarget.hostname}` }, 403, request);
    }

    try {
        // Формирование перенаправленного запроса
        const headers = new Headers();
        // Прозрачная передача Content-Type
        const ct = request.headers.get('Content-Type');
        if (ct) headers.set('Content-Type', ct);
        // Некоторые API требуют User-Agent
        headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        // Некоторые API требуют Referer
        headers.set('Referer', parsedTarget.origin);

        const fetchOpts: RequestInit = {
            method: request.method,
            headers,
            redirect: 'follow',
        };

        // Передача тела запроса (POST/PUT)
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            fetchOpts.body = await request.arrayBuffer();
        }

        const resp = await fetch(targetUrl, fetchOpts);

        // Формирование ответа с CORS заголовками
        const respHeaders = new Headers(resp.headers);
        for (const [k, v] of Object.entries(corsHeaders(request))) {
            respHeaders.set(k, v);
        }
        // Удаление заголовков, которые могут вызвать проблемы с декодированием
        respHeaders.delete('content-encoding');

        return new Response(resp.body, {
            status: resp.status,
            headers: respHeaders,
        });
    } catch (e: any) {
        return jsonResponse({ error: e.message || 'Ошибка прокси-запроса' }, 502, request);
    }
};

function corsHeaders(request: Request): Record<string, string> {
    return {
        'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
    };
}

function jsonResponse(data: any, status: number, request: Request) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(request),
        },
    });
}
