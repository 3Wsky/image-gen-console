/**
 * Cloudflare Pages Function — 排队状态查询
 *
 * 路由：GET /api/ai/public/images/queue
 * 代理到 Express 后端查询排队状态。
 */
const DEFAULT_BACKEND = 'https://story-characterized-hottest-terrorists.trycloudflare.com';

export async function onRequestGet(context) {
  try {
    const backendUrl = context.env.BACKEND_URL || DEFAULT_BACKEND;
    const resp = await fetch(`${backendUrl}/api/ai/public/images/queue`);
    const data = await resp.json();
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch {
    return new Response(JSON.stringify({ active: 0, waiting: 0, max: 10 }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}
