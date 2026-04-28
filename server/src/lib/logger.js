/**
 * 简易日志模块 - 基于 pino
 * 生产环境输出 JSON 结构化日志，开发环境 pino-pretty 美化
 */
const pino = require('pino');

const isDev = (process.env.NODE_ENV || 'development') !== 'production';

const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  base: { service: 'image-gen-console', env: process.env.NODE_ENV || 'development' },
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token', '*.apiKey'],
    censor: '[REDACTED]',
  },
  transport: isDev
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname,service,env' } }
    : undefined,
});

module.exports = logger;
