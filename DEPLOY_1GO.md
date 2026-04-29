# image-gen-console 部署到 1go.im

## 一、服务器目录建议

```bash
/www/wwwroot/image-gen-console
```

## 二、首次部署

```bash
cd /www/wwwroot
git clone https://github.com/3Wsky/image-gen-console.git
cd image-gen-console/server
npm install --omit=dev
cp .env.example .env
```

编辑 `server/.env`：

```env
PORT=3011
NODE_ENV=production
IMAGE_GEN_PROVIDERS=sk-xxx|https://your-openai-compatible-endpoint
IMAGE_GEN_ADMIN_KEY=请换成强随机管理员密钥
DEEPSEEK_API_KEY=sk-xxx
```

启动：

```bash
npm install -g pm2
pm2 start src/index.js --name image-gen-console
pm2 save
```

## 三、Nginx 反代

把域名或路径反代到：

```text
http://127.0.0.1:3011
```

推荐单独子域名：

```text
img.1go.im -> http://127.0.0.1:3011
```

如果必须挂在路径，比如：

```text
https://1go.im/image-gen/
```

需要额外配置 Nginx path rewrite，建议优先用子域名，最省事。

## 四、以后更新

```bash
cd /www/wwwroot/image-gen-console
git pull origin master
cd server
npm install --omit=dev
pm2 restart image-gen-console
```

## 五、验证

```bash
curl http://127.0.0.1:3011/health
```

浏览器访问：

```text
https://img.1go.im/generate.html
```

## 六、不要提交到 GitHub 的内容

- `server/.env`
- API Key
- 管理员密钥
- `.wrangler/`
- `node_modules/`
