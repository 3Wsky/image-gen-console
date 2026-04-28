require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

// 解析 IMAGE_GEN_PROVIDERS: "key1|url1,key2|url2"
function parseProviders(raw) {
  if (!raw) return [];
  return raw.split(',').map(item => {
    const [key, url] = item.split('|').map(s => s.trim());
    return key && url ? { key, url } : null;
  }).filter(Boolean);
}

const providers = parseProviders(process.env.IMAGE_GEN_PROVIDERS);

module.exports = {
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',
  providers,
  // 兼容旧字段
  imageGenApiKeys: providers.map(p => p.key),
  imageGenApiKey: providers[0]?.key || '',
  imageGenBackendUrl: providers[0]?.url || 'http://47.104.6.81:7777',
  imageGenAdminKey: process.env.IMAGE_GEN_ADMIN_KEY || 'admin123',
};
