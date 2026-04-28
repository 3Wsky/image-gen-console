/**
 * Cloudflare Pages Function — 统计数据
 *
 * 路由：GET /api/ai/public/images/stats
 * 使用 STATS_KV 持久化访问量和生图数。
 */

export async function onRequestGet(context) {
  const KV = context.env.STATS_KV;
  const ip = context.request.headers.get('cf-connecting-ip') || '';

  try {
    // 读取当前统计
    const stats = (await KV.get('stats', { type: 'json' })) || { visits: 0, images: 0 };

    // 记录新访客 IP
    if (ip) {
      const ipSet = new Set((await KV.get('visit_ips', { type: 'json' })) || []);
      if (!ipSet.has(ip)) {
        ipSet.add(ip);
        stats.visits++;
        // 防止 IP 集合无限膨胀，只保留最近 5000 个
        const ipArr = [...ipSet];
        const trimmed = ipArr.length > 5000 ? ipArr.slice(-5000) : ipArr;
        await KV.put('visit_ips', JSON.stringify(trimmed));
        await KV.put('stats', JSON.stringify(stats));
      }
    }

    return new Response(JSON.stringify({ visits: stats.visits, images: stats.images }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch {
    return new Response(JSON.stringify({ visits: 0, images: 0 }), {
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
