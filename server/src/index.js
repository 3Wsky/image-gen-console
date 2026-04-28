/**
 * image-gen-console 后端服务
 *
 * 功能：
 *   - 图片生成代理（OpenAI Images API 兼容）
 *   - DeepSeek 提示词优化
 *   - 历史记录 & 统计
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const axios = require('axios');
const path = require('path');

const config = require('./config');
const logger = require('./lib/logger');

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = config.port;
const PROVIDERS = config.providers;

// Provider 轮换计数器
let providerIndex = 0;
function getNextProvider() {
  if (PROVIDERS.length === 0) return null;
  const provider = PROVIDERS[providerIndex % PROVIDERS.length];
  providerIndex++;
  return provider;
}

// ============================================================
// 错误翻译
// ============================================================
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
  'billing': '账单问题，API 余额可能不足',
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
  'prompt too long': '提示词过长，请缩短后重试',
  'fetch failed': '网络请求失败，请检查网络后重试',
};

function translateError(msg) {
  if (!msg) return '图片生成失败，请稍后重试';
  for (const [en, zh] of Object.entries(ERROR_ZH_MAP)) {
    if (msg.toLowerCase().includes(en.toLowerCase())) return zh;
  }
  if (/[\u4e00-\u9fff]/.test(msg)) return msg;
  return '图片生成失败：' + msg;
}

// ============================================================
// DeepSeek 提示词优化
// ============================================================
const PROMPT_OPTIMIZE_SYSTEM = `你是一位创意图像生成提示词优化师。你的任务是理解用户描述的核心内容，用更有创意、更生动的方式重新表达，但保持中文。

优化规则：
1. 输出必须是中文提示词
2. 聚焦创意表达：丰富场景、情感、动作、叙事感，让画面更有故事性
3. 不要添加技术参数：不写光线、材质、相机、镜头、分辨率、渲染引擎等
4. 不要翻译成英文
5. 保留用户的核心主体和意图，在此基础上发挥想象
6. 输出只包含优化后的中文提示词，不要解释、不要前缀后缀
7. 字数控制在 100 字以内，简洁有力`;

async function optimizePromptWithDeepSeek(originalPrompt) {
  const key = config.deepseekApiKey;
  if (!key) return originalPrompt;
  try {
    const resp = await axios.post(
      'https://api.deepseek.com/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: PROMPT_OPTIMIZE_SYSTEM },
          { role: 'user', content: originalPrompt },
        ],
        stream: false,
      },
      {
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        timeout: 30000,
      }
    );
    const optimized = resp.data?.choices?.[0]?.message?.content?.trim();
    if (optimized) return optimized;
    return originalPrompt;
  } catch (err) {
    logger.warn({ err: err.message }, 'deepseek_prompt_optimize_failed');
    return originalPrompt;
  }
}

// ============================================================
// 图片生成队列（串行处理，避免远端并发限制）
// ============================================================
const MAX_QUEUE = 10;
let activeJob = null;
const jobQueue = [];

async function processQueue() {
  if (activeJob || jobQueue.length === 0) return;
  activeJob = jobQueue.shift();

  try {
    // 收集所有可用 provider
    const triedProviders = [];

    // 确定首选 provider：客户端指定则固定，否则自动轮换
    let provider = (activeJob.apiKey && activeJob.backendUrl)
      ? { key: activeJob.apiKey, url: activeJob.backendUrl, fixed: true }
      : getNextProvider();

    let lastError = null;
    let attemptCount = 0;

    while (provider && attemptCount < PROVIDERS.length) {
      attemptCount++;
      triedProviders.push(provider.url);

      try {
        // DeepSeek 提示词优化（只在第一次尝试时做）
        if (activeJob.payload.optimize && !activeJob.payload._originalPrompt) {
          activeJob.payload._originalPrompt = activeJob.payload.prompt;
          activeJob.payload.prompt = await optimizePromptWithDeepSeek(activeJob.payload.prompt);
          logger.info({ original: activeJob.payload._originalPrompt, optimized: activeJob.payload.prompt }, 'prompt_optimized');
        }

        logger.info({ provider: provider.url, attempt: attemptCount }, 'trying_provider');

        const response = await axios.post(
          `${provider.url}/v1/images/generations`,
          activeJob.payload,
          { headers: { Authorization: `Bearer ${provider.key}`, 'Content-Type': 'application/json' }, timeout: 300000 }
        );

        // 保存到服务端历史（按 IP 隔离）
        const images = Array.isArray(response.data?.data) ? response.data.data : [];
        const ratioMap = { '1024x1024': '1:1', '1024x1536': '9:16', '1536x1024': '16:9', '1024x768': '4:3', '768x1024': '3:4' };

        // 如果返回的是 URL 而非 b64_json，需要下载转 base64 存历史
        for (let idx = 0; idx < images.length; idx++) {
          const img = images[idx];
          if (img.url && !img.b64_json) {
            try {
              const imgResp = await axios.get(img.url, { responseType: 'arraybuffer', timeout: 60000 });
              img.b64_json = Buffer.from(imgResp.data, 'binary').toString('base64');
            } catch (e) {
              logger.warn({ err: e.message }, 'failed_to_download_image_url');
            }
          }
        }

        images.forEach((img, idx) => {
          if (img.b64_json) {
            imageGenCount++;
            const historyRecord = {
              id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
              prompt: activeJob.payload.prompt,
              size: activeJob.payload.size,
              ratio: ratioMap[activeJob.payload.size] || activeJob.payload.size,
              n: activeJob.payload.n,
              time: Date.now(),
              b64_json: img.b64_json,
            };
            if (activeJob.payload.optimize && activeJob.payload._originalPrompt) {
              historyRecord.originalPrompt = activeJob.payload._originalPrompt;
            }
            addHistory(activeJob.ip, historyRecord);
          }
        });

        activeJob.res.json(response.data);
        return; // 成功

      } catch (err) {
        const status = err.response?.status || 502;
        const detail = err.response?.data;
        const rawMessage = detail?.error?.message || detail?.message || err.message || '图片生成失败';
        lastError = { status, detail, rawMessage };

        logger.warn({ provider: provider.url, status, rawMessage }, 'provider_failed_trying_next');

        // 认证/模型不支持/配额/限流，尝试下一个 provider（仅自动轮换模式）
        const retriable = !provider.fixed
          && ([401, 403, 404, 429, 503].includes(status)
            || /model_not_found|insufficient_quota|rate.limit|no available channel/i.test(rawMessage));

        if (retriable && attemptCount < PROVIDERS.length) {
          provider = getNextProvider();
          continue;
        }

        // 不可重试或已耗尽 provider
        const message = translateError(rawMessage);
        logger.error({ status, detail, rawMessage, message, triedProviders }, 'all_providers_failed');
        activeJob.res.status(status).json({
          ok: false,
          error: message,
          details: detail || null,
        });
        return;
      }
    }

    // 没有 provider 可用
    if (!lastError) {
      activeJob.res.status(400).json({ ok: false, error: '服务端未配置 API Key，请联系管理员。' });
    }
  } finally {
    activeJob = null;
    processQueue();
  }
}

// ============================================================
// 统计
// ============================================================
let visitCount = 0;
let imageGenCount = 0;
const visitIps = new Set();

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.ip
    || req.connection?.remoteAddress
    || 'unknown';
}

// ============================================================
// 历史记录（内存存储，按 IP 隔离）
// ============================================================
const historyStore = new Map();
const MAX_HISTORY_PER_IP = 30;
const MAX_HISTORY_TOTAL = 500;

function addHistory(ip, record) {
  if (!historyStore.has(ip)) historyStore.set(ip, []);
  const list = historyStore.get(ip);
  list.unshift(record);
  if (list.length > MAX_HISTORY_PER_IP) list.length = MAX_HISTORY_PER_IP;
  // 全局裁剪
  let total = 0;
  for (const l of historyStore.values()) total += l.length;
  if (total > MAX_HISTORY_TOTAL) {
    const oldest = [...historyStore.entries()].sort((a, b) => {
      const aLast = a[1][a[1].length - 1]?.time || 0;
      const bLast = b[1][b[1].length - 1]?.time || 0;
      return aLast - bLast;
    });
    const victim = oldest[0];
    if (victim) victim[1].pop();
  }
}

// ============================================================
// CORS
// ============================================================
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Forwarded-For');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ============================================================
// 静态前端页面
// ============================================================
const frontendDir = path.join(__dirname, '..');
app.use(express.static(frontendDir));

// ============================================================
// 图片生成相关 API
// ============================================================

// 统计数据
app.get('/api/ai/public/images/stats', (req, res) => {
  const ip = getClientIp(req);
  if (!visitIps.has(ip)) {
    visitIps.add(ip);
    visitCount++;
  }
  res.json({ visits: visitCount, images: imageGenCount });
});

// 排队状态
app.get('/api/ai/public/images/queue', (_req, res) => {
  res.json({ active: activeJob ? 1 : 0, waiting: jobQueue.length, max: MAX_QUEUE });
});

// 图片生成
app.post('/api/ai/public/images/generations', (req, res) => {
  const { apiKey: clientApiKey, backendUrl: clientBackendUrl, ...payload } = req.body;

  // 如果客户端指定了 apiKey/backendUrl 则固定使用，否则由 processQueue 自动轮换
  const overrides = (clientApiKey && clientBackendUrl) ? { apiKey: clientApiKey, backendUrl: clientBackendUrl } : {};

  if (PROVIDERS.length === 0 && !clientApiKey) {
    return res.status(400).json({ ok: false, error: '服务端未配置 API Key，请联系管理员。' });
  }
  if (jobQueue.length >= MAX_QUEUE) {
    return res.status(429).json({ ok: false, error: '队列已满，请稍后再试。' });
  }

  jobQueue.push({ payload, ...overrides, ip: getClientIp(req), res, startTime: Date.now() });
  processQueue();
});

// 提示词优化
app.post('/api/ai/public/images/optimize', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ ok: false, error: 'prompt 不能为空' });
  }
  const optimized = await optimizePromptWithDeepSeek(prompt);
  res.json({ ok: true, original: prompt, optimized });
});

// 查询历史记录
app.get('/api/ai/public/images/history', (req, res) => {
  const adminKey = req.query.admin_key;
  if (adminKey && adminKey === config.imageGenAdminKey) {
    const all = [];
    for (const [ip, records] of historyStore.entries()) {
      for (const r of records) all.push({ ...r, ip });
    }
    all.sort((a, b) => b.time - a.time);
    return res.json({ ok: true, admin: true, data: all.slice(0, 100) });
  }
  const ip = getClientIp(req);
  const records = historyStore.get(ip) || [];
  res.json({ ok: true, admin: false, data: records });
});

// 删除单条历史记录
app.delete('/api/ai/public/images/history/:id', (req, res) => {
  const adminKey = req.query.admin_key;
  const ip = getClientIp(req);
  const { id } = req.params;
  if (adminKey && adminKey === config.imageGenAdminKey) {
    for (const [, records] of historyStore.entries()) {
      const idx = records.findIndex(r => r.id === id);
      if (idx !== -1) { records.splice(idx, 1); return res.json({ ok: true }); }
    }
    return res.status(404).json({ ok: false, error: '记录不存在' });
  }
  const records = historyStore.get(ip);
  if (!records) return res.status(404).json({ ok: false, error: '无记录' });
  const idx = records.findIndex(r => r.id === id);
  if (idx === -1) return res.status(404).json({ ok: false, error: '记录不存在' });
  records.splice(idx, 1);
  res.json({ ok: true });
});

// 清空历史
app.delete('/api/ai/public/images/history', (req, res) => {
  const adminKey = req.query.admin_key;
  if (adminKey && adminKey === config.imageGenAdminKey) {
    historyStore.clear();
    return res.json({ ok: true, cleared: 'all' });
  }
  const ip = getClientIp(req);
  historyStore.delete(ip);
  res.json({ ok: true });
});

// ============================================================
// 健康检查
// ============================================================
app.get('/health', (_req, res) => res.json({ ok: true }));

// 启动
app.listen(PORT, () => {
  logger.info(`image-gen-server running on http://localhost:${PORT}`);
  logger.info(`Providers: ${PROVIDERS.map(p => p.url).join(', ')} (${PROVIDERS.length} key(s), rotation)`);
  logger.info(`DeepSeek: ${config.deepseekApiKey ? 'configured' : 'MISSING'}`);
});
