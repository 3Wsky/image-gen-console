# Image Gen Console

基于 OpenAI Images API 兼容接口的在线 AI 生图控制台，支持多 Provider 轮换、提示词智能优化、历史记录与统计。

## 功能特性

- **AI 生图** — 兼容 OpenAI Images API，支持多种尺寸（1:1 / 16:9 / 9:16 / 4:3 / 3:4）
- **多 Provider 轮换** — 配置多个 API Key，自动轮换 + 故障转移
- **提示词优化** — 集成 DeepSeek，一键优化中文提示词，让画面更有故事感
- **生成队列** — 串行处理请求，避免远端并发限制
- **历史记录** — 按 IP 隔离存储，支持管理员查看全部记录
- **访问统计** — 访问量 & 生图数统计
- **双部署模式** — 支持 Cloudflare Pages（边缘）+ Express（本地/VPS）

## 项目结构

```
├── index.html              # API 文档页面
├── generate.html           # 生图控制台（前端）
├── wrangler.toml           # Cloudflare Pages 配置
├── functions/              # Cloudflare Pages Functions（边缘代理）
│   └── api/ai/public/images/
│       ├── generations.js   # 图片生成代理
│       ├── optimize.js      # 提示词优化
│       ├── history.js       # 历史记录
│       ├── queue.js         # 队列状态
│       └── stats.js         # 统计数据
└── server/                  # Express 后端服务
    ├── .env.example         # 环境变量示例
    ├── package.json
    └── src/
        ├── index.js         # 主服务（路由 + 队列 + 历史存储）
        ├── config/index.js  # 配置解析
        └── lib/logger.js    # 日志
```

## 快速开始

### 1. 本地运行（Express 模式）

```bash
cd server
cp .env.example .env
# 编辑 .env 填入你的 API Key 和后端地址
npm install
npm run dev
```

服务启动在 `http://localhost:3001`

### 2. 部署到 Cloudflare Pages

```bash
# 创建 KV 命名空间
wrangler kv namespace create STATS_KV
wrangler kv namespace create HISTORY_KV

# 将返回的 id 填入 wrangler.toml

# 部署
wrangler pages deploy .
```

## 环境变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `IMAGE_GEN_PROVIDERS` | API Key 与地址，逗号分隔，格式 `key\|url` | `sk-xxx\|https://api.example.com` |
| `IMAGE_GEN_ADMIN_KEY` | 管理员密钥（查看全部历史等） | `your-admin-key` |
| `DEEPSEEK_API_KEY` | DeepSeek API Key（可选，不配置则跳过提示词优化） | `sk-xxx` |
| `PORT` | 服务端口 | `3001` |

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/ai/public/images/generations` | 图片生成 |
| POST | `/api/ai/public/images/optimize` | 提示词优化 |
| GET | `/api/ai/public/images/history` | 历史记录 |
| DELETE | `/api/ai/public/images/history` | 清空历史 |
| GET | `/api/ai/public/images/queue` | 队列状态 |
| GET | `/api/ai/public/images/stats` | 统计数据 |

## 技术栈

- **前端**：原生 HTML / CSS / JS
- **后端**：Express + Axios + Pino
- **边缘**：Cloudflare Pages Functions + KV
- **AI**：OpenAI Images API 兼容接口 + DeepSeek Chat

## License

MIT
