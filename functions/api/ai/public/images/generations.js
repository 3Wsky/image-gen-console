/**
 * Cloudflare Pages Function — 图片生成代理
 *
 * 路由：POST /api/ai/public/images/generations
 * 代理到 Express 后端生成图片，成功后将结果写入 KV 持久化历史和统计。
 */
const DEFAULT_BACKEND = 'https://story-characterized-hottest-terrorists.trycloudflare.com';

const ERROR_ZH_MAP = {
  'rate limit': '请求过于频繁，请稍后再试',
  'Rate limit exceeded': '请求过于频繁，请稍后再试',
  'Too many requests': '请求过于频繁，请稍后再试',
  'Invalid API Key': 'API Key 无效，请检查后重试',
  'Incorrect API key': 'API Key 不正确，请检查后重试',
  'authentication': '认证失败，API Key 可能无效',
  'unauthorized': '认证失败，API Key 可能无效',
  'insufficient_quota': 'API 余额不足，请联系管理员充值',
  'Insufficient quota': 'API 余额不足，请联系管理员充值',
  'content_policy': '内容违反安全策略，请修改提示词后重试',
  'safety': '内容触发安全过滤，请修改提示词后重试',
  'timeout': '远端服务响应超时，请稍后重试',
  'ETIMEDOUT': '远端服务连接超时，请稍后重试',
  'ECONNREFUSED': '远端服务拒绝连接，可能正在维护',
  'Bad Gateway': '远端网关错误，请稍后重试',
  'Service Unavailable': '远端服务不可用，请稍后重试',
  'Internal Server Error': '远端服务内部错误，请稍后重试',
  'Invalid size': '图片尺寸不支持，请更换比例后重试',
  'Invalid prompt': '提示词无效，请修改后重试',
};

function translateError(msg) {
  if (!msg) return '图片生成失败，请稍后重试';
  for (const [en, zh] of Object.entries(ERROR_ZH_MAP)) {
    if (msg.toLowerCase().includes(en.toLowerCase())) return zh;
  }
  if (/[\u4e00-\u9fff]/.test(msg)) return msg;
  return '图片生成失败：' + msg;
}

const RATIO_MAP = {
  '1024x1024': '1:1',
  '1024x1536': '9:16',
  '1536x1024': '16:9',
  '1024x768': '4:3',
  '768x1024': '3:4',
};

export async function onRequestPost(context) {
  const ip = context.request.headers.get('cf-connecting-ip') || '';
  const STATS_KV = context.env.STATS_KV;
  const HISTORY_KV = context.env.HISTORY_KV;

  try {
    const body = await context.request.json();
    const backendUrl = context.env.BACKEND_URL || DEFAULT_BACKEND;

    // 代理到 Express 后端
    const upstream = await fetch(`${backendUrl}/api/ai/public/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': ip,
      },
      body: JSON.stringify(body),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      const message = data?.error || data?.message || `后端返回 ${upstream.status}`;
      return jsonResp({ ok: false, error: message, details: data || null }, upstream.status);
    }

    // 成功后写入 KV（异步，不阻塞响应）
    if (STATS_KV && HISTORY_KV && Array.isArray(data?.data)) {
      context.waitUntil(
        (async () => {
          try {
            // 更新生图计数
            const imageCount = data.data.filter(img => img.b64_json).length;
            if (imageCount > 0) {
              const stats = (await STATS_KV.get('stats', { type: 'json' })) || { visits: 0, images: 0 };
              stats.images += imageCount;
              await STATS_KV.put('stats', JSON.stringify(stats));
            }

            // 写入历史
            const now = Date.now();
            const records = data.data
              .filter(img => img.b64_json)
              .map((img, idx) => ({
                id: `${now}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
                prompt: body.prompt || '',
                size: body.size || '1024x1024',
                ratio: RATIO_MAP[body.size] || body.size || '1:1',
                n: body.n || 1,
                time: now,
                b64_json: img.b64_json,
              }));

            if (records.length > 0 && ip) {
              // 按 IP 存储
              const ipRecords = (await HISTORY_KV.get(`ip:${ip}`, { type: 'json' })) || [];
              const merged = [...records, ...ipRecords].slice(0, 30);
              await HISTORY_KV.put(`ip:${ip}`, JSON.stringify(merged));

              // 全局最近记录（管理员用）
              const recent = (await HISTORY_KV.get('recent', { type: 'json' })) || [];
              const withIp = records.map(r => ({ ...r, ip }));
              const mergedRecent = [...withIp, ...recent].slice(0, 100);
              await HISTORY_KV.put('recent', JSON.stringify(mergedRecent));
            }
          } catch (err) {
            console.error('KV write failed:', err);
          }
        })()
      );
    }

    return jsonResp(data, 200);
  } catch (err) {
    return jsonResp({ ok: false, error: translateError(err.message) || '代理请求失败' }, 502);
  }
}

function jsonResp(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
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
