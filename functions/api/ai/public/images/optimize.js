/**
 * Cloudflare Pages Function — 提示词优化
 *
 * 路由：POST /api/ai/public/images/optimize
 * 代理到 Express 后端进行 DeepSeek 提示词优化。
 */
const DEFAULT_BACKEND = 'https://story-characterized-hottest-terrorists.trycloudflare.com';

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const backendUrl = context.env.BACKEND_URL || DEFAULT_BACKEND;

    const upstream = await fetch(`${backendUrl}/api/ai/public/images/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await upstream.json();
    return new Response(JSON.stringify(data), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: '提示词优化失败：' + err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}
