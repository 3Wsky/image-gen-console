/**
 * Cloudflare Pages Function — 历史记录
 *
 * 路由：GET|DELETE /api/ai/public/images/history
 * 使用 HISTORY_KV 持久化历史记录，按 IP 隔离。
 */

const MAX_PER_IP = 30;
const MAX_RECENT = 100;

export async function onRequestGet(context) {
  const KV = context.env.HISTORY_KV;
  const adminKey = new URL(context.request.url).searchParams.get('admin_key');
  const ip = context.request.headers.get('cf-connecting-ip') || '';

  try {
    // 管理员查看全部
    if (adminKey && adminKey === context.env.IMAGE_GEN_ADMIN_KEY) {
      const recent = (await KV.get('recent', { type: 'json' })) || [];
      return new Response(JSON.stringify({ ok: true, admin: true, data: recent }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // 普通用户查看自己的
    const records = (await KV.get(`ip:${ip}`, { type: 'json' })) || [];
    return new Response(JSON.stringify({ ok: true, admin: false, data: records }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch {
    return new Response(JSON.stringify({ ok: true, admin: false, data: [] }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}

export async function onRequestDelete(context) {
  const KV = context.env.HISTORY_KV;
  const url = new URL(context.request.url);
  const adminKey = url.searchParams.get('admin_key');
  const ip = context.request.headers.get('cf-connecting-ip') || '';
  const pathParts = url.pathname.split('/');
  const recordId = pathParts[pathParts.length - 1]; // 可能是 :id 或 'history'

  try {
    // 管理员清空全部
    if (adminKey && adminKey === context.env.IMAGE_GEN_ADMIN_KEY && recordId === 'history') {
      // 列出所有 ip: 开头的 key 并删除
      const list = await KV.list({ prefix: 'ip:' });
      for (const key of list.keys) {
        await KV.delete(key.name);
      }
      await KV.put('recent', JSON.stringify([]));
      return new Response(JSON.stringify({ ok: true, cleared: 'all' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // 管理员删除单条
    if (adminKey && adminKey === context.env.IMAGE_GEN_ADMIN_KEY && recordId !== 'history') {
      const recent = (await KV.get('recent', { type: 'json' })) || [];
      const filtered = recent.filter(r => r.id !== recordId);
      await KV.put('recent', JSON.stringify(filtered));
      // 也从对应 IP 列表中删除
      const ipList = await KV.list({ prefix: 'ip:' });
      for (const key of ipList.keys) {
        const records = (await KV.get(key.name, { type: 'json' })) || [];
        const idx = records.findIndex(r => r.id === recordId);
        if (idx !== -1) {
          records.splice(idx, 1);
          await KV.put(key.name, JSON.stringify(records));
        }
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // 普通用户清空自己的
    if (recordId === 'history') {
      await KV.delete(`ip:${ip}`);
      // 也从 recent 中删除该 IP 的记录
      const recent = (await KV.get('recent', { type: 'json' })) || [];
      const filtered = recent.filter(r => r.ip !== ip);
      await KV.put('recent', JSON.stringify(filtered));
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // 普通用户删除单条
    const records = (await KV.get(`ip:${ip}`, { type: 'json' })) || [];
    const idx = records.findIndex(r => r.id === recordId);
    if (idx === -1) {
      return new Response(JSON.stringify({ ok: false, error: '记录不存在' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    records.splice(idx, 1);
    await KV.put(`ip:${ip}`, JSON.stringify(records));
    // 也从 recent 中删除
    const recent = (await KV.get('recent', { type: 'json' })) || [];
    const filtered = recent.filter(r => r.id !== recordId);
    await KV.put('recent', JSON.stringify(filtered));

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}
