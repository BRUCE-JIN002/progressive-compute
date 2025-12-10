import type { CacheConfig } from "../types/cache";

// 默认缓存配置
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  dbName: "ProgressiveComputeCache",
  storeName: "cache_entries",
  version: 1,
  maxAge: 24 * 60 * 60 * 1000, // 24小时（毫秒）
  maxSize: 100, // 最大缓存条目数
  maxStorageSize: 50 * 1024 * 1024, // 50MB（字节）
};

// 缓存操作超时配置
export const CACHE_TIMEOUTS = {
  OPERATION_TIMEOUT: 5000, // 缓存操作超时：5秒
  INITIALIZATION_TIMEOUT: 10000, // 初始化超时：10秒
  CLEANUP_TIMEOUT: 30000, // 清理操作超时：30秒
};

// 缓存版本（用于数据兼容性）
export const CACHE_VERSION = "1.0.0";

// 存储配额阈值
export const STORAGE_THRESHOLDS = {
  WARNING_THRESHOLD: 0.8, // 使用80%配额时发出警告
  CLEANUP_THRESHOLD: 0.9, // 使用90%配额时开始清理
  CRITICAL_THRESHOLD: 0.95, // 95%为临界阈值
};

// 批处理常量
export const BATCH_CONSTANTS = {
  MIN_BATCH_SIZE: 1,
  MAX_BATCH_SIZE: 10000,
  DEFAULT_BATCH_SIZE: 500,
};

// 错误重试配置
export const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // 1秒
  BACKOFF_MULTIPLIER: 2,
};
