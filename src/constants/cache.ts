import type { CacheConfig } from "../types/cache";

// Default cache configuration
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  dbName: "ProgressiveComputeCache",
  storeName: "cache_entries",
  version: 1,
  maxAge: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
  maxSize: 100, // Maximum number of cache entries
  maxStorageSize: 50 * 1024 * 1024, // 50MB in bytes
};

// Cache operation timeouts
export const CACHE_TIMEOUTS = {
  OPERATION_TIMEOUT: 5000, // 5 seconds for cache operations
  INITIALIZATION_TIMEOUT: 10000, // 10 seconds for initialization
  CLEANUP_TIMEOUT: 30000, // 30 seconds for cleanup operations
};

// Cache version for data compatibility
export const CACHE_VERSION = "1.0.0";

// Storage quota thresholds
export const STORAGE_THRESHOLDS = {
  WARNING_THRESHOLD: 0.8, // Warn when 80% of quota is used
  CLEANUP_THRESHOLD: 0.9, // Start cleanup when 90% of quota is used
  CRITICAL_THRESHOLD: 0.95, // Critical threshold at 95%
};

// Batch processing constants
export const BATCH_CONSTANTS = {
  MIN_BATCH_SIZE: 1,
  MAX_BATCH_SIZE: 10000,
  DEFAULT_BATCH_SIZE: 500,
};

// Error retry configuration
export const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // 1 second
  BACKOFF_MULTIPLIER: 2,
};
