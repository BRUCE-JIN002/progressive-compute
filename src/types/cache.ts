// Cache configuration interfaces
export interface CacheOptions {
  dbName?: string; // IndexedDB 数据库名
  storeName?: string; // 对象存储名
  version?: number; // 数据库版本
  maxAge?: number; // 缓存过期时间（毫秒）
  maxSize?: number; // 最大缓存条目数
  maxStorageSize?: number; // 最大存储大小（字节）
}

// Extended progressive compute options with cache support
export interface ProgressiveComputeOptions {
  batchSize?: number;
  debounceMs?: number;
  timeout?: number;
  cache?: boolean; // 新增：是否启用缓存
  cacheOptions?: CacheOptions; // 新增：缓存配置
}

// Cache status information
export interface CacheStatus {
  enabled: boolean;
  hit: boolean;
  size: number;
  lastUpdated?: Date;
}

// Extended result interface with cache status
export interface ProgressiveComputeResult<R> {
  result: R[];
  isComputing: boolean;
  progress: number;
  error: Error | null;
  start: () => void;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  reset: (clearCache?: boolean) => void; // 修改：支持清理缓存
  cacheStatus?: CacheStatus; // 新增：缓存状态
}

// Cache data structures
export interface CacheMetadata {
  timestamp: number; // 创建时间
  lastAccessed: number; // 最后访问时间
  dataHash: string; // 输入数据哈希
  transformHash: string; // 转换函数哈希
  totalSize: number; // 数据总大小
  batchSize: number; // 批次大小
}

export interface CacheBatch<R> {
  index: number; // 批次索引
  data: R[]; // 批次数据
  timestamp: number; // 存储时间
  size: number; // 数据大小
}

export interface CacheEntry<R> {
  key: string; // 缓存键
  data: R[]; // 完整结果数据
  metadata: CacheMetadata; // 元数据
  batches: CacheBatch<R>[]; // 批次数据
  isComplete: boolean; // 是否完整
  version: string; // 数据版本
}

export interface CacheResult<R> {
  data: R[];
  isComplete: boolean;
  timestamp: number;
  batches: CacheBatch<R>[];
}

export interface CacheConfig {
  dbName: string; // 数据库名
  storeName: string; // 存储名
  version: number; // 版本号
  maxAge: number; // 最大存活时间
  maxSize: number; // 最大条目数
  maxStorageSize: number; // 最大存储大小
}

// Error types for cache operations
export const CacheErrorType = {
  INITIALIZATION_FAILED: "INITIALIZATION_FAILED",
  STORAGE_QUOTA_EXCEEDED: "STORAGE_QUOTA_EXCEEDED",
  DATA_CORRUPTION: "DATA_CORRUPTION",
  SERIALIZATION_ERROR: "SERIALIZATION_ERROR",
  TIMEOUT_ERROR: "TIMEOUT_ERROR",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
} as const;

export type CacheErrorType =
  (typeof CacheErrorType)[keyof typeof CacheErrorType];

export const RecoveryAction = {
  RETRY_OPERATION: "RETRY_OPERATION",
  CLEANUP_AND_RETRY: "CLEANUP_AND_RETRY",
  FALLBACK_TO_NON_CACHED: "FALLBACK_TO_NON_CACHED",
  DELETE_CORRUPTED_CACHE: "DELETE_CORRUPTED_CACHE",
  REDUCE_BATCH_SIZE: "REDUCE_BATCH_SIZE",
} as const;

export type RecoveryAction =
  (typeof RecoveryAction)[keyof typeof RecoveryAction];

export class CacheError extends Error {
  public type: CacheErrorType;
  public originalError?: Error;

  constructor(message: string, type: CacheErrorType, originalError?: Error) {
    super(message);
    this.name = "CacheError";
    this.type = type;
    this.originalError = originalError;
  }
}

// Cache manager interface
export interface CacheManager<T, R> {
  // 初始化缓存系统
  initialize(): Promise<boolean>;

  // 生成缓存键
  generateKey(data: T[], transformFn: (item: T) => R): string;

  // 检查缓存
  checkCache(key: string): Promise<CacheResult<R> | null>;

  // 存储批次结果
  storeBatch(key: string, batch: R[], batchIndex: number): Promise<void>;

  // 标记缓存完成
  markComplete(key: string, totalResult: R[]): Promise<void>;

  // 清理缓存
  clearCache(key?: string): Promise<void>;

  // 清理过期缓存
  cleanupExpired(): Promise<void>;

  // 获取缓存状态
  getStatus(key: string): Promise<CacheStatus>;
}

// IndexedDB wrapper interface
export interface IndexedDBWrapper {
  // 可用性检查
  checkAvailability(): Promise<boolean>;

  // 数据库操作
  openDatabase(name: string, version: number): Promise<IDBDatabase>;

  // 存储操作
  put(storeName: string, key: string, value: unknown): Promise<void>;
  get(storeName: string, key: string): Promise<unknown>;
  delete(storeName: string, key: string): Promise<void>;
  clear(storeName: string): Promise<void>;

  // 查询操作
  getAllKeys(storeName: string): Promise<string[]>;
  count(storeName: string): Promise<number>;

  // 事务操作
  transaction(storeNames: string[], mode: IDBTransactionMode): IDBTransaction;
}

// Error recovery strategy interface
export interface ErrorRecoveryStrategy {
  // 错误类型检测
  detectErrorType(error: Error): CacheErrorType;

  // 恢复策略选择
  selectRecoveryStrategy(errorType: CacheErrorType): RecoveryAction;

  // 执行恢复操作
  executeRecovery(action: RecoveryAction): Promise<boolean>;

  // 降级处理
  fallbackToNonCached(): boolean;

  // 状态检查
  isInFallbackMode(): boolean;
  resetFallbackMode(): void;

  // 重试管理
  getRetryCount(operationId: string): number;
  incrementRetryCount(operationId: string): number;
  resetRetryCount(operationId: string): void;
  shouldRetry(operationId: string): boolean;
  calculateRetryDelay(operationId: string): number;

  // 错误处理
  handleError(
    error: Error,
    operationId: string,
    context?: { cacheManager?: unknown; operation?: string }
  ): Promise<{
    recovered: boolean;
    action: RecoveryAction;
    shouldFallback: boolean;
  }>;

  // 包装器创建
  createRecoveryWrapper<T>(
    operationId: string,
    operation: () => Promise<T>,
    fallbackValue: T
  ): () => Promise<T>;
}

// Database schema definition
export const DB_SCHEMA = {
  name: "ProgressiveComputeCache",
  version: 1,
  stores: [
    {
      name: "cache_entries",
      keyPath: "key",
      indexes: [
        { name: "timestamp", keyPath: "metadata.timestamp" },
        { name: "lastAccessed", keyPath: "metadata.lastAccessed" },
        { name: "dataHash", keyPath: "metadata.dataHash" },
      ],
    },
    {
      name: "cache_metadata",
      keyPath: "key",
      indexes: [
        { name: "size", keyPath: "totalSize" },
        { name: "created", keyPath: "timestamp" },
      ],
    },
  ],
} as const;
