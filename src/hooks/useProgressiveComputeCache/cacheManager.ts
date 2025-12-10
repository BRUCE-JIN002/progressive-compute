import type {
  CacheManager,
  CacheResult,
  CacheEntry,
  CacheStatus,
  CacheOptions,
  IndexedDBWrapper,
  CacheBatch,
  ErrorRecoveryStrategy,
} from "./types/cache";
import { CacheError, CacheErrorType } from "./types/cache";
import { IndexedDBWrapperImpl } from "./indexedDBWrapper";
import { DEFAULT_CACHE_CONFIG, CACHE_VERSION } from "./constants/cache";
import { ErrorRecoveryStrategyImpl } from "./errorRecoveryStrategy";
// 浏览器兼容的哈希实现

/**
 * 缓存管理器实现，处理缓存查找、验证和管理
 */
export class CacheManagerImpl<T, R> implements CacheManager<T, R> {
  private dbWrapper: IndexedDBWrapper;
  private config: Required<CacheOptions>;
  private isInitialized = false;
  private db: IDBDatabase | null = null;
  private errorRecovery: ErrorRecoveryStrategy;

  constructor(options: CacheOptions = {}) {
    this.config = {
      dbName: options.dbName || DEFAULT_CACHE_CONFIG.dbName,
      storeName: options.storeName || DEFAULT_CACHE_CONFIG.storeName,
      version: options.version || DEFAULT_CACHE_CONFIG.version,
      maxAge: options.maxAge || DEFAULT_CACHE_CONFIG.maxAge,
      maxSize: options.maxSize || DEFAULT_CACHE_CONFIG.maxSize,
      maxStorageSize:
        options.maxStorageSize || DEFAULT_CACHE_CONFIG.maxStorageSize,
    };
    this.dbWrapper = new IndexedDBWrapperImpl();
    this.errorRecovery = new ErrorRecoveryStrategyImpl();
  }

  /**
   * 初始化缓存系统（带错误恢复）
   * 需求: 1.1, 1.2, 1.3, 5.1
   */
  public async initialize(): Promise<boolean> {
    const operationId = "cache_initialization";

    try {
      // 检查是否已处于降级模式
      if (this.errorRecovery.isInFallbackMode()) {
        console.info("Cache initialization skipped - in fallback mode");
        return false;
      }

      // 检查 IndexedDB 是否可用
      const isAvailable = await this.dbWrapper.checkAvailability();
      if (!isAvailable) {
        console.warn(
          "IndexedDB not available, falling back to non-cached mode"
        );
        this.errorRecovery.fallbackToNonCached();
        return false;
      }

      // 打开数据库
      this.db = await this.dbWrapper.openDatabase(
        this.config.dbName,
        this.config.version
      );
      this.isInitialized = true;

      // 初始化成功后重置重试计数
      this.errorRecovery.resetRetryCount(operationId);
      console.debug("Cache initialized successfully");
      return true;
    } catch (error) {
      console.error("Failed to initialize cache:", error);

      // 使用恢复策略处理错误
      const recovery = await this.errorRecovery.handleError(
        error instanceof Error ? error : new Error(String(error)),
        operationId
      );

      if (recovery.shouldFallback) {
        console.warn(
          "Cache initialization failed, falling back to non-cached mode"
        );
        return false;
      }

      // 如果恢复策略建议重试，则尝试重试
      if (
        recovery.action === "RETRY_OPERATION" &&
        this.errorRecovery.shouldRetry(operationId)
      ) {
        const delay = this.errorRecovery.calculateRetryDelay(operationId);
        console.info(`Retrying cache initialization after ${delay}ms`);

        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.initialize();
      }

      return false;
    }
  }

  // 性能优化：缓存生成的键
  private keyCache = new Map<string, string>();
  private keyGenerationStats = {
    hits: 0,
    misses: 0,
    totalTime: 0,
  };

  /**
   * 基于数据和转换函数生成唯一的缓存键
   * 使用记忆化和快速哈希进行优化
   */
  public generateKey(data: T[], transformFn: (item: T) => R): string {
    const startTime = performance.now();

    try {
      // 为记忆化创建快速标识符
      const quickId = `${data.length}_${transformFn.toString().length}`;

      // 检查是否已经生成过这个键
      if (this.keyCache.has(quickId)) {
        this.keyGenerationStats.hits++;
        const cachedKey = this.keyCache.get(quickId)!;
        this.keyGenerationStats.totalTime += performance.now() - startTime;
        return cachedKey;
      }

      this.keyGenerationStats.misses++;

      // 优化的数据哈希 - 基于大数据集的采样
      const dataHash = this.createOptimizedDataHash(data);

      // 优化的函数哈希 - 提取关键特征
      const fnHash = this.createOptimizedFunctionHash(transformFn);

      // 结合哈希和版本以确保唯一性
      const key = `${CACHE_VERSION}_${dataHash}_${fnHash}`;

      // 缓存结果以供将来使用（有大小限制）
      if (this.keyCache.size < 1000) {
        this.keyCache.set(quickId, key);
      }

      this.keyGenerationStats.totalTime += performance.now() - startTime;
      return key;
    } catch (error) {
      this.keyGenerationStats.totalTime += performance.now() - startTime;
      throw new CacheError(
        `Failed to generate cache key: ${
          error instanceof Error ? error.message : String(error)
        }`,
        CacheErrorType.SERIALIZATION_ERROR,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get key generation performance statistics
   */
  public getKeyGenerationStats() {
    return {
      ...this.keyGenerationStats,
      averageTime:
        this.keyGenerationStats.totalTime /
        (this.keyGenerationStats.hits + this.keyGenerationStats.misses),
      hitRate:
        this.keyGenerationStats.hits /
        (this.keyGenerationStats.hits + this.keyGenerationStats.misses),
    };
  }

  // 智能缓存预加载
  private preloadQueue = new Set<string>();
  private preloadStats = {
    preloadAttempts: 0,
    preloadHits: 0,
    preloadMisses: 0,
  };

  /**
   * Check cache for existing results with error recovery and intelligent preloading
   * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
   */
  public async checkCache(key: string): Promise<CacheResult<R> | null> {
    if (!this.isInitialized || this.errorRecovery.isInFallbackMode()) {
      return null;
    }

    const operationId = `cache_check_${key}`;

    // Create recovery-aware wrapper for cache check operation
    const cacheCheckOperation = this.errorRecovery.createRecoveryWrapper(
      operationId,
      async (): Promise<CacheResult<R> | null> => {
        // Retrieve cache entry from IndexedDB
        const rawEntry = await this.dbWrapper.get(this.config.storeName, key);

        if (!rawEntry) {
          // Cache miss - trigger intelligent preloading
          this.triggerIntelligentPreloading(key);
          return null;
        }

        // Validate and parse the cache entry
        const cacheEntry = this.validateCacheEntry(rawEntry);
        if (!cacheEntry) {
          // Invalid cache entry, clean it up
          await this.cleanupCorruptedCache(key);
          return null;
        }

        // Check if cache entry has expired
        if (this.isCacheExpired(cacheEntry)) {
          await this.dbWrapper.delete(this.config.storeName, key);
          return null;
        }

        // Update last accessed time
        await this.updateLastAccessed(key, cacheEntry);

        // Trigger preloading of related cache entries
        this.preloadRelatedEntries(key, cacheEntry);

        // Return cache result
        return {
          data: cacheEntry.data,
          isComplete: cacheEntry.isComplete,
          timestamp: cacheEntry.metadata.timestamp,
          batches: cacheEntry.batches,
        };
      },
      null // fallback value
    );

    try {
      return await cacheCheckOperation();
    } catch (error) {
      console.error("Cache lookup failed after recovery attempts:", error);
      return null; // Fallback to cache miss on any error
    }
  }

  /**
   * Trigger intelligent preloading based on access patterns
   */
  private triggerIntelligentPreloading(missedKey: string): void {
    // Don't preload if already in queue
    if (this.preloadQueue.has(missedKey)) {
      return;
    }

    this.preloadStats.preloadAttempts++;

    // Add to preload queue
    this.preloadQueue.add(missedKey);

    // Schedule preloading with low priority
    setTimeout(async () => {
      try {
        await this.performIntelligentPreloading(missedKey);
      } catch (error) {
        console.warn("Preloading failed:", error);
      } finally {
        this.preloadQueue.delete(missedKey);
      }
    }, 100); // Low priority delay
  }

  /**
   * Perform intelligent preloading of similar cache entries
   */
  private async performIntelligentPreloading(baseKey: string): Promise<void> {
    try {
      // Get all cache keys to find similar patterns
      const allKeys = await this.dbWrapper.getAllKeys(this.config.storeName);

      if (allKeys.length === 0) {
        this.preloadStats.preloadMisses++;
        return;
      }

      // Find keys with similar patterns (same version and function hash)
      const keyParts = baseKey.split("_");
      if (keyParts.length < 3) {
        this.preloadStats.preloadMisses++;
        return;
      }

      const [version, , functionHash] = keyParts;
      const similarKeys = allKeys.filter((key) => {
        const parts = key.split("_");
        return (
          parts.length >= 3 &&
          parts[0] === version &&
          parts[2] === functionHash &&
          key !== baseKey
        );
      });

      if (similarKeys.length === 0) {
        this.preloadStats.preloadMisses++;
        return;
      }

      // Preload up to 3 most recently accessed similar entries
      const preloadCandidates = await this.selectPreloadCandidates(similarKeys);

      for (const candidateKey of preloadCandidates) {
        try {
          // Warm up the cache by accessing the entry
          const entry = await this.dbWrapper.get(
            this.config.storeName,
            candidateKey
          );
          if (entry && this.validateCacheEntry(entry)) {
            console.debug(`Preloaded cache entry: ${candidateKey}`);
            this.preloadStats.preloadHits++;
          }
        } catch (error) {
          console.warn(`Failed to preload cache entry ${candidateKey}:`, error);
        }
      }
    } catch (error) {
      console.warn("Intelligent preloading failed:", error);
      this.preloadStats.preloadMisses++;
    }
  }

  /**
   * Select the best candidates for preloading based on access patterns
   */
  private async selectPreloadCandidates(keys: string[]): Promise<string[]> {
    const candidates: Array<{
      key: string;
      lastAccessed: number;
      score: number;
    }> = [];

    for (const key of keys.slice(0, 10)) {
      // Limit to 10 candidates for performance
      try {
        const entry = await this.dbWrapper.get(this.config.storeName, key);
        const validatedEntry = this.validateCacheEntry(entry);

        if (validatedEntry && !this.isCacheExpired(validatedEntry)) {
          // Calculate preload score based on recency and completeness
          const recencyScore =
            validatedEntry.metadata.lastAccessed / Date.now();
          const completenessScore = validatedEntry.isComplete ? 1.0 : 0.5;
          const sizeScore = Math.min(
            1.0,
            1000 / (validatedEntry.metadata.totalSize || 1000)
          );

          const score =
            recencyScore * 0.5 + completenessScore * 0.3 + sizeScore * 0.2;

          candidates.push({
            key,
            lastAccessed: validatedEntry.metadata.lastAccessed,
            score,
          });
        }
      } catch (error) {
        console.warn(`Failed to evaluate preload candidate ${key}:`, error);
      }
    }

    // Sort by score and return top 3
    return candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((c) => c.key);
  }

  /**
   * Preload related entries based on current cache hit
   */
  private preloadRelatedEntries(
    currentKey: string,
    _currentEntry: CacheEntry<R>
  ): void {
    // Schedule low-priority preloading of entries with similar data patterns
    setTimeout(async () => {
      try {
        const allKeys = await this.dbWrapper.getAllKeys(this.config.storeName);
        const keyParts = currentKey.split("_");

        if (keyParts.length >= 3) {
          const [version, dataHash] = keyParts;

          // Find entries with similar data hash (similar input data)
          const relatedKeys = allKeys
            .filter((key) => {
              const parts = key.split("_");
              return (
                parts.length >= 3 &&
                parts[0] === version &&
                parts[1] === dataHash &&
                key !== currentKey
              );
            })
            .slice(0, 2); // Limit to 2 related entries

          for (const relatedKey of relatedKeys) {
            try {
              await this.dbWrapper.get(this.config.storeName, relatedKey);
              console.debug(`Preloaded related cache entry: ${relatedKey}`);
            } catch (error) {
              console.warn(
                `Failed to preload related entry ${relatedKey}:`,
                error
              );
            }
          }
        }
      } catch (error) {
        console.warn("Related entry preloading failed:", error);
      }
    }, 200); // Low priority delay
  }

  /**
   * Get preloading performance statistics
   */
  public getPreloadStats() {
    return {
      ...this.preloadStats,
      hitRate:
        this.preloadStats.preloadAttempts > 0
          ? this.preloadStats.preloadHits / this.preloadStats.preloadAttempts
          : 0,
    };
  }

  // Performance optimization: Batch storage queue and compression
  private batchQueue = new Map<
    string,
    {
      batches: Array<{ index: number; data: R[]; timestamp: number }>;
      timer: number | null;
    }
  >();
  private compressionEnabled = true;
  private batchStorageStats = {
    totalBatches: 0,
    queuedBatches: 0,
    compressionRatio: 0,
    averageStoreTime: 0,
  };

  /**
   * Store a batch result to cache incrementally with error recovery
   * Optimized with batching, compression, and deferred writes
   * Requirements: 3.1, 3.4, 5.3
   */
  public async storeBatch(
    key: string,
    batch: R[],
    batchIndex: number
  ): Promise<void> {
    if (!this.isInitialized || this.errorRecovery.isInFallbackMode()) {
      // If cache is not initialized or in fallback mode, silently skip storage
      console.debug("Cache not available, skipping batch storage");
      return;
    }

    const startTime = performance.now();
    this.batchStorageStats.totalBatches++;

    // Performance optimization: Queue batches for deferred writing
    if (!this.batchQueue.has(key)) {
      this.batchQueue.set(key, { batches: [], timer: null });
    }

    const queueEntry = this.batchQueue.get(key)!;

    // Add batch to queue
    queueEntry.batches.push({
      index: batchIndex,
      data: batch,
      timestamp: Date.now(),
    });

    this.batchStorageStats.queuedBatches++;

    // Clear existing timer
    if (queueEntry.timer) {
      clearTimeout(queueEntry.timer);
    }

    // Set new timer for deferred write (batch multiple writes together)
    queueEntry.timer = setTimeout(async () => {
      await this.flushBatchQueue(key);
      this.batchStorageStats.averageStoreTime =
        (this.batchStorageStats.averageStoreTime +
          (performance.now() - startTime)) /
        2;
    }, 50) as unknown as number; // Batch writes every 50ms

    console.debug(`Queued batch ${batchIndex} for cache key: ${key}`);
  }

  /**
   * Flush the batch queue for a specific key
   */
  private async flushBatchQueue(key: string): Promise<void> {
    const queueEntry = this.batchQueue.get(key);
    if (!queueEntry || queueEntry.batches.length === 0) {
      return;
    }

    const operationId = `flush_batch_queue_${key}`;

    // Create recovery-aware wrapper for batch flush operation
    const flushOperation = this.errorRecovery.createRecoveryWrapper(
      operationId,
      async (): Promise<void> => {
        // Get existing cache entry or create new one
        const cacheEntry = await this.getOrCreateCacheEntry(key, []);

        // Process all queued batches
        for (const queuedBatch of queueEntry.batches) {
          // Compress batch data if enabled
          const batchData: CacheBatch<R> = {
            index: queuedBatch.index,
            data: this.compressionEnabled
              ? this.compressBatchData(queuedBatch.data)
              : queuedBatch.data,
            timestamp: queuedBatch.timestamp,
            size: this.calculateDataSize(queuedBatch.data),
          };

          // Update or add the batch
          const existingBatchIndex = cacheEntry.batches.findIndex(
            (b) => b.index === queuedBatch.index
          );

          if (existingBatchIndex >= 0) {
            // Update existing batch
            cacheEntry.batches[existingBatchIndex] = batchData;
          } else {
            // Add new batch
            cacheEntry.batches.push(batchData);
          }
        }

        // Sort batches by index for consistency
        cacheEntry.batches.sort((a, b) => a.index - b.index);

        // Update the combined data array with all batches
        cacheEntry.data = this.combineBatchData(cacheEntry.batches);

        // Update metadata
        cacheEntry.metadata.lastAccessed = Date.now();
        cacheEntry.metadata.totalSize = this.calculateDataSize(cacheEntry.data);

        // Store the updated entry
        await this.dbWrapper.put(this.config.storeName, key, cacheEntry);

        console.debug(
          `Flushed ${queueEntry.batches.length} batches for cache key: ${key}`
        );
      },
      undefined // void return type
    );

    try {
      await flushOperation();

      // Clear the queue after successful flush
      queueEntry.batches = [];
      if (queueEntry.timer) {
        clearTimeout(queueEntry.timer);
        queueEntry.timer = null;
      }
    } catch (error) {
      // Handle specific error types with targeted recovery
      const errorType = this.errorRecovery.detectErrorType(
        error instanceof Error ? error : new Error(String(error))
      );

      if (errorType === "STORAGE_QUOTA_EXCEEDED") {
        try {
          console.warn(
            "Storage quota exceeded during batch flush, attempting cleanup"
          );
          await this.handleStorageQuotaExceeded();

          // Retry once after cleanup if not in fallback mode
          if (!this.errorRecovery.isInFallbackMode()) {
            await this.flushBatchQueue(key);
          }
        } catch (cleanupError) {
          console.error(
            "Failed to handle storage quota exceeded during flush:",
            cleanupError
          );
          // Clear the problematic queue to prevent infinite retries
          queueEntry.batches = [];
        }
      } else {
        console.error(`Failed to flush batch queue for key ${key}:`, error);
        // Clear the problematic queue to prevent infinite retries
        queueEntry.batches = [];
      }
    }
  }

  /**
   * Get batch storage performance statistics
   */
  public getBatchStorageStats() {
    return { ...this.batchStorageStats };
  }

  /**
   * Mark cache as complete with the full result set
   */
  public async markComplete(key: string, totalResult: R[]): Promise<void> {
    if (!this.isInitialized) {
      // If cache is not initialized, silently skip but don't fail
      console.warn("Cache not initialized, skipping completion marking");
      return;
    }

    try {
      // Get existing cache entry or create new one
      const cacheEntry = await this.getOrCreateCacheEntry(key, totalResult);

      // Mark as complete and store the full result
      cacheEntry.isComplete = true;
      cacheEntry.data = [...totalResult]; // Store a copy of the complete result

      // Update metadata
      cacheEntry.metadata.lastAccessed = Date.now();
      cacheEntry.metadata.totalSize = this.calculateDataSize(totalResult);

      // Store the completed entry
      await this.dbWrapper.put(this.config.storeName, key, cacheEntry);

      console.debug(`Marked cache as complete for key: ${key}`);
    } catch (error) {
      // Handle storage errors gracefully - log but don't fail the computation
      console.error(`Failed to mark cache as complete for key ${key}:`, error);

      // Check if it's a quota exceeded error and try cleanup
      if (this.isQuotaExceededError(error)) {
        try {
          await this.handleStorageQuotaExceeded();
          // Retry the operation once after cleanup
          await this.markComplete(key, totalResult);
        } catch (retryError) {
          console.error("Failed to mark complete after cleanup:", retryError);
          // Don't throw - let computation complete without final cache marking
        }
      }

      // For other errors, just log and continue
      // This ensures computation completion is not interrupted by cache failures
    }
  }

  /**
   * Clear cache entries - supports selective cleanup (memory vs memory+cache)
   * Requirements: 4.1, 4.2, 4.3, 4.4
   */
  public async clearCache(key?: string): Promise<void> {
    if (!this.isInitialized) {
      // If cache is not initialized, there's nothing to clear
      console.warn("Cache not initialized, nothing to clear");
      return;
    }

    try {
      // Clear batch queue for specific key or all keys
      if (key) {
        await this.clearBatchQueue(key);
        await this.clearSpecificCacheEntry(key);
      } else {
        await this.clearAllBatchQueues();
        await this.clearAllCacheEntries();
      }

      console.debug(
        `Cache cleared successfully${
          key ? ` for key: ${key}` : " (all entries)"
        }`
      );
    } catch (error) {
      // Handle cleanup errors gracefully - log but don't fail
      console.error(
        `Failed to clear cache${key ? ` for key: ${key}` : ""}:`,
        error
      );

      // Try fallback cleanup strategies
      await this.attemptFallbackCleanup(key, error);
    }
  }

  /**
   * Clear batch queue for a specific key
   */
  private async clearBatchQueue(key: string): Promise<void> {
    const queueEntry = this.batchQueue.get(key);
    if (queueEntry) {
      // Flush any pending batches before clearing
      if (queueEntry.batches.length > 0) {
        try {
          await this.flushBatchQueue(key);
        } catch (error) {
          console.warn(
            `Failed to flush batch queue before clearing for key ${key}:`,
            error
          );
        }
      }

      // Clear timer and remove from queue
      if (queueEntry.timer) {
        clearTimeout(queueEntry.timer);
      }
      this.batchQueue.delete(key);
    }
  }

  /**
   * Clear all batch queues
   */
  private async clearAllBatchQueues(): Promise<void> {
    const keys = Array.from(this.batchQueue.keys());

    // Flush all pending batches
    for (const key of keys) {
      try {
        await this.flushBatchQueue(key);
      } catch (error) {
        console.warn(`Failed to flush batch queue for key ${key}:`, error);
      }
    }

    // Clear all timers and queues
    for (const [, queueEntry] of this.batchQueue) {
      if (queueEntry.timer) {
        clearTimeout(queueEntry.timer);
      }
    }

    this.batchQueue.clear();
  }

  /**
   * Cleanup method to be called when cache manager is destroyed
   */
  public async cleanup(): Promise<void> {
    try {
      // Flush all pending batch queues
      await this.clearAllBatchQueues();

      // Clear performance caches
      this.keyCache.clear();
      this.preloadQueue.clear();

      // Close database connection if open
      if (this.db) {
        this.db.close();
        this.db = null;
      }

      this.isInitialized = false;
      console.debug("Cache manager cleanup completed");
    } catch (error) {
      console.error("Cache manager cleanup failed:", error);
    }
  }

  /**
   * Clear a specific cache entry and all associated data
   */
  private async clearSpecificCacheEntry(key: string): Promise<void> {
    try {
      // Delete the main cache entry
      await this.dbWrapper.delete(this.config.storeName, key);

      // Also delete from metadata store if it exists
      try {
        await this.dbWrapper.delete("cache_metadata", key);
      } catch (metaError) {
        // Metadata deletion is not critical, just log the warning
        console.warn(`Failed to delete metadata for key ${key}:`, metaError);
      }

      console.debug(`Cleared specific cache entry: ${key}`);
    } catch (error) {
      throw new CacheError(
        `Failed to clear cache entry for key ${key}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        CacheErrorType.UNKNOWN_ERROR,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Clear all cache entries from the database
   */
  private async clearAllCacheEntries(): Promise<void> {
    try {
      // Clear the main cache store
      await this.dbWrapper.clear(this.config.storeName);

      // Also clear metadata store if it exists
      try {
        await this.dbWrapper.clear("cache_metadata");
      } catch (metaError) {
        // Metadata clearing is not critical, just log the warning
        console.warn("Failed to clear metadata store:", metaError);
      }

      console.debug("Cleared all cache entries");
    } catch (error) {
      throw new CacheError(
        `Failed to clear all cache entries: ${
          error instanceof Error ? error.message : String(error)
        }`,
        CacheErrorType.UNKNOWN_ERROR,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Attempt fallback cleanup strategies when primary cleanup fails
   */
  private async attemptFallbackCleanup(
    key: string | undefined,
    _originalError: unknown
  ): Promise<void> {
    console.warn("Attempting fallback cleanup strategies...");

    try {
      if (key) {
        // For specific key cleanup failure, try to get and manually delete
        try {
          const entry = await this.dbWrapper.get(this.config.storeName, key);
          if (entry) {
            // Try to delete using transaction
            const transaction = this.dbWrapper.transaction(
              [this.config.storeName],
              "readwrite"
            );
            const store = transaction.objectStore(this.config.storeName);
            store.delete(key);

            await new Promise<void>((resolve, reject) => {
              transaction.oncomplete = () => resolve();
              transaction.onerror = () => reject(transaction.error);
            });

            console.info(`Fallback cleanup succeeded for key: ${key}`);
          }
        } catch (fallbackError) {
          console.error(
            `Fallback cleanup also failed for key ${key}:`,
            fallbackError
          );
        }
      } else {
        // For full cleanup failure, try to get all keys and delete individually
        try {
          const allKeys = await this.dbWrapper.getAllKeys(
            this.config.storeName
          );
          let successCount = 0;

          for (const cacheKey of allKeys) {
            try {
              await this.dbWrapper.delete(this.config.storeName, cacheKey);
              successCount++;
            } catch (deleteError) {
              console.warn(
                `Failed to delete key ${cacheKey} during fallback:`,
                deleteError
              );
            }
          }

          if (successCount > 0) {
            console.info(
              `Fallback cleanup partially succeeded: ${successCount}/${allKeys.length} entries cleared`
            );
          }
        } catch (fallbackError) {
          console.error("Fallback cleanup completely failed:", fallbackError);
        }
      }
    } catch (error) {
      console.error("Error during fallback cleanup attempt:", error);
    }
  }

  /**
   * Clean up expired cache entries and manage storage space
   * Requirements: 3.5, 5.3
   */
  public async cleanupExpired(): Promise<void> {
    if (!this.isInitialized) {
      console.warn("Cache not initialized, skipping expired cleanup");
      return;
    }

    try {
      console.debug("Starting expired cache cleanup...");

      // Get all cache entries for analysis
      const allKeys = await this.dbWrapper.getAllKeys(this.config.storeName);

      if (allKeys.length === 0) {
        console.debug("No cache entries to clean up");
        return;
      }

      // Analyze entries and determine what to clean
      const cleanupAnalysis = await this.analyzeEntriesForCleanup(allKeys);

      // Clean up expired entries
      const expiredCount = await this.cleanupExpiredEntries(
        cleanupAnalysis.expired
      );

      // Clean up old entries if we're over size limits
      const oldCount = await this.cleanupOldEntriesIfNeeded(
        cleanupAnalysis.valid
      );

      // Check and handle storage quota if needed
      await this.checkAndHandleStorageQuota();

      console.info(
        `Cleanup completed: ${expiredCount} expired entries, ${oldCount} old entries removed`
      );
    } catch (error) {
      console.error("Failed to cleanup expired cache entries:", error);

      // Try emergency cleanup if regular cleanup fails
      await this.attemptEmergencyCleanup();
    }
  }

  /**
   * Analyze cache entries to determine cleanup strategy
   */
  private async analyzeEntriesForCleanup(allKeys: string[]): Promise<{
    expired: Array<{ key: string; entry: CacheEntry<R> }>;
    valid: Array<{
      key: string;
      entry: CacheEntry<R>;
      lastAccessed: number;
      size: number;
    }>;
    corrupted: string[];
  }> {
    const expired: Array<{ key: string; entry: CacheEntry<R> }> = [];
    const valid: Array<{
      key: string;
      entry: CacheEntry<R>;
      lastAccessed: number;
      size: number;
    }> = [];
    const corrupted: string[] = [];

    for (const key of allKeys) {
      try {
        const rawEntry = await this.dbWrapper.get(this.config.storeName, key);

        if (!rawEntry) {
          corrupted.push(key);
          continue;
        }

        const entry = this.validateCacheEntry(rawEntry);

        if (!entry) {
          corrupted.push(key);
          continue;
        }

        // Check if entry is expired
        if (this.isCacheExpired(entry)) {
          expired.push({ key, entry });
        } else {
          valid.push({
            key,
            entry,
            lastAccessed: entry.metadata.lastAccessed,
            size:
              entry.metadata.totalSize || this.calculateDataSize(entry.data),
          });
        }
      } catch (error) {
        console.warn(`Failed to analyze cache entry ${key}:`, error);
        corrupted.push(key);
      }
    }

    // Clean up corrupted entries immediately
    for (const corruptedKey of corrupted) {
      try {
        await this.dbWrapper.delete(this.config.storeName, corruptedKey);
        console.debug(`Cleaned up corrupted entry: ${corruptedKey}`);
      } catch (error) {
        console.warn(`Failed to clean corrupted entry ${corruptedKey}:`, error);
      }
    }

    return { expired, valid, corrupted };
  }

  /**
   * Clean up expired cache entries
   */
  private async cleanupExpiredEntries(
    expiredEntries: Array<{ key: string; entry: CacheEntry<R> }>
  ): Promise<number> {
    let cleanedCount = 0;

    for (const { key } of expiredEntries) {
      try {
        await this.dbWrapper.delete(this.config.storeName, key);
        cleanedCount++;
        console.debug(`Cleaned up expired entry: ${key}`);
      } catch (error) {
        console.warn(`Failed to clean up expired entry ${key}:`, error);
      }
    }

    return cleanedCount;
  }

  /**
   * Clean up old entries if we exceed size limits
   */
  private async cleanupOldEntriesIfNeeded(
    validEntries: Array<{
      key: string;
      entry: CacheEntry<R>;
      lastAccessed: number;
      size: number;
    }>
  ): Promise<number> {
    // Check if we need to clean up based on entry count
    if (validEntries.length <= this.config.maxSize) {
      return 0; // No cleanup needed
    }

    // Sort by last accessed time (oldest first)
    const sortedEntries = [...validEntries].sort(
      (a, b) => a.lastAccessed - b.lastAccessed
    );

    // Calculate how many entries to remove (remove 25% when over limit)
    const targetCount = Math.floor(this.config.maxSize * 0.75);
    const entriesToRemove = Math.max(0, sortedEntries.length - targetCount);

    if (entriesToRemove === 0) {
      return 0;
    }

    console.debug(
      `Cleaning up ${entriesToRemove} old entries to manage storage space`
    );

    let cleanedCount = 0;
    for (let i = 0; i < entriesToRemove; i++) {
      try {
        await this.dbWrapper.delete(
          this.config.storeName,
          sortedEntries[i].key
        );
        cleanedCount++;
        console.debug(`Cleaned up old entry: ${sortedEntries[i].key}`);
      } catch (error) {
        console.warn(
          `Failed to clean up old entry ${sortedEntries[i].key}:`,
          error
        );
      }
    }

    return cleanedCount;
  }

  /**
   * Check storage quota and handle if exceeded
   */
  private async checkAndHandleStorageQuota(): Promise<void> {
    try {
      // Try to estimate storage usage if navigator.storage is available
      if (
        typeof navigator !== "undefined" &&
        navigator.storage &&
        navigator.storage.estimate
      ) {
        const estimate = await navigator.storage.estimate();

        if (estimate.quota && estimate.usage) {
          const usagePercentage = (estimate.usage / estimate.quota) * 100;

          if (usagePercentage > 90) {
            console.warn(
              `Storage usage high: ${usagePercentage.toFixed(
                1
              )}%, attempting aggressive cleanup`
            );
            await this.performAggressiveCleanup();
          } else if (usagePercentage > 75) {
            console.info(
              `Storage usage moderate: ${usagePercentage.toFixed(
                1
              )}%, performing preventive cleanup`
            );
            await this.performPreventiveCleanup();
          }
        }
      }
    } catch (error) {
      console.warn("Failed to check storage quota:", error);
      // If we can't check quota, perform preventive cleanup as a safety measure
      await this.performPreventiveCleanup();
    }
  }

  /**
   * Perform aggressive cleanup when storage is critically low
   */
  private async performAggressiveCleanup(): Promise<void> {
    try {
      const allKeys = await this.dbWrapper.getAllKeys(this.config.storeName);

      if (allKeys.length === 0) {
        return;
      }

      // Get entries with their access times
      const entriesWithTimes: Array<{ key: string; lastAccessed: number }> = [];

      for (const key of allKeys) {
        try {
          const rawEntry = await this.dbWrapper.get(this.config.storeName, key);
          const entry = this.validateCacheEntry(rawEntry);

          if (entry) {
            entriesWithTimes.push({
              key,
              lastAccessed: entry.metadata.lastAccessed,
            });
          }
        } catch {
          // If we can't read the entry, mark it for deletion
          entriesWithTimes.push({
            key,
            lastAccessed: 0, // Will be deleted first
          });
        }
      }

      // Sort by last accessed (oldest first)
      entriesWithTimes.sort((a, b) => a.lastAccessed - b.lastAccessed);

      // Remove 50% of entries in aggressive cleanup
      const entriesToRemove = Math.floor(entriesWithTimes.length * 0.5);

      for (let i = 0; i < entriesToRemove; i++) {
        try {
          await this.dbWrapper.delete(
            this.config.storeName,
            entriesWithTimes[i].key
          );
          console.debug(
            `Aggressively cleaned entry: ${entriesWithTimes[i].key}`
          );
        } catch (error) {
          console.warn(
            `Failed to delete entry during aggressive cleanup: ${entriesWithTimes[i].key}`,
            error
          );
        }
      }

      console.info(
        `Aggressive cleanup completed: removed ${entriesToRemove} entries`
      );
    } catch (error) {
      console.error("Aggressive cleanup failed:", error);
    }
  }

  /**
   * Perform preventive cleanup to avoid storage issues
   */
  private async performPreventiveCleanup(): Promise<void> {
    try {
      const allKeys = await this.dbWrapper.getAllKeys(this.config.storeName);

      if (allKeys.length <= this.config.maxSize * 0.8) {
        return; // No preventive cleanup needed
      }

      // Get entries with their access times
      const entriesWithTimes: Array<{ key: string; lastAccessed: number }> = [];

      for (const key of allKeys) {
        try {
          const rawEntry = await this.dbWrapper.get(this.config.storeName, key);
          const entry = this.validateCacheEntry(rawEntry);

          if (entry) {
            entriesWithTimes.push({
              key,
              lastAccessed: entry.metadata.lastAccessed,
            });
          }
        } catch {
          // If we can't read the entry, mark it for deletion
          entriesWithTimes.push({
            key,
            lastAccessed: 0, // Will be deleted first
          });
        }
      }

      // Sort by last accessed (oldest first)
      entriesWithTimes.sort((a, b) => a.lastAccessed - b.lastAccessed);

      // Remove 20% of entries in preventive cleanup
      const entriesToRemove = Math.floor(entriesWithTimes.length * 0.2);

      for (let i = 0; i < entriesToRemove; i++) {
        try {
          await this.dbWrapper.delete(
            this.config.storeName,
            entriesWithTimes[i].key
          );
          console.debug(
            `Preventively cleaned entry: ${entriesWithTimes[i].key}`
          );
        } catch (error) {
          console.warn(
            `Failed to delete entry during preventive cleanup: ${entriesWithTimes[i].key}`,
            error
          );
        }
      }

      console.info(
        `Preventive cleanup completed: removed ${entriesToRemove} entries`
      );
    } catch (error) {
      console.error("Preventive cleanup failed:", error);
    }
  }

  /**
   * Emergency cleanup when all else fails
   */
  private async attemptEmergencyCleanup(): Promise<void> {
    console.warn("Attempting emergency cleanup...");

    try {
      // Try to clear the entire cache as last resort
      await this.dbWrapper.clear(this.config.storeName);
      console.warn("Emergency cleanup: cleared entire cache");
    } catch (error) {
      console.error("Emergency cleanup failed:", error);

      // If even clearing fails, try to delete the database and reinitialize
      try {
        if (this.db) {
          this.db.close();
          this.db = null;
        }

        // Note: We can't actually delete the database from here safely,
        // but we can mark it as uninitialized so it will be recreated
        this.isInitialized = false;
        console.warn(
          "Emergency cleanup: marked cache as uninitialized for recreation"
        );
      } catch (finalError) {
        console.error("Final emergency cleanup attempt failed:", finalError);
      }
    }
  }

  /**
   * Get cache status for a specific key
   */
  public async getStatus(key: string): Promise<CacheStatus> {
    if (!this.isInitialized) {
      return {
        enabled: false,
        hit: false,
        size: 0,
      };
    }

    try {
      const rawEntry = await this.dbWrapper.get(this.config.storeName, key);
      const totalCount = await this.dbWrapper.count(this.config.storeName);

      if (!rawEntry) {
        return {
          enabled: true,
          hit: false,
          size: totalCount,
        };
      }

      const cacheEntry = this.validateCacheEntry(rawEntry);
      if (!cacheEntry) {
        return {
          enabled: true,
          hit: false,
          size: totalCount,
        };
      }

      return {
        enabled: true,
        hit: true,
        size: totalCount,
        lastUpdated: new Date(cacheEntry.metadata.lastAccessed),
      };
    } catch (error) {
      console.error("Failed to get cache status:", error);
      return {
        enabled: true,
        hit: false,
        size: 0,
      };
    }
  }

  /**
   * Get comprehensive performance statistics
   */
  public getPerformanceStats() {
    return {
      keyGeneration: this.getKeyGenerationStats(),
      batchStorage: this.getBatchStorageStats(),
      preloading: this.getPreloadStats(),
      cache: {
        isInitialized: this.isInitialized,
        isInFallbackMode: this.errorRecovery.isInFallbackMode(),
        queuedBatches: Array.from(this.batchQueue.values()).reduce(
          (total, queue) => total + queue.batches.length,
          0
        ),
        keyCacheSize: this.keyCache.size,
        preloadQueueSize: this.preloadQueue.size,
      },
    };
  }

  /**
   * Clear performance statistics
   */
  public clearPerformanceStats(): void {
    this.keyGenerationStats = {
      hits: 0,
      misses: 0,
      totalTime: 0,
    };

    this.batchStorageStats = {
      totalBatches: 0,
      queuedBatches: 0,
      compressionRatio: 0,
      averageStoreTime: 0,
    };

    this.preloadStats = {
      preloadAttempts: 0,
      preloadHits: 0,
      preloadMisses: 0,
    };
  }

  /**
   * Validate cache entry structure and data integrity
   */
  private validateCacheEntry(rawEntry: unknown): CacheEntry<R> | null {
    try {
      // Check if entry has required structure
      if (!rawEntry || typeof rawEntry !== "object") {
        throw new CacheError(
          "Invalid cache entry structure",
          CacheErrorType.DATA_CORRUPTION
        );
      }

      const entry = rawEntry as CacheEntry<R>;

      // Validate required fields
      if (!entry.key || !entry.metadata || !Array.isArray(entry.data)) {
        throw new CacheError(
          "Missing required cache entry fields",
          CacheErrorType.DATA_CORRUPTION
        );
      }

      // Validate metadata structure
      if (
        typeof entry.metadata.timestamp !== "number" ||
        typeof entry.metadata.lastAccessed !== "number" ||
        typeof entry.metadata.dataHash !== "string" ||
        typeof entry.metadata.transformHash !== "string"
      ) {
        throw new CacheError(
          "Invalid cache metadata structure",
          CacheErrorType.DATA_CORRUPTION
        );
      }

      // Validate version compatibility
      if (
        !entry.version ||
        !entry.version.startsWith(CACHE_VERSION.split(".")[0])
      ) {
        throw new CacheError(
          "Incompatible cache version",
          CacheErrorType.DATA_CORRUPTION
        );
      }

      // Validate batches if present
      if (entry.batches && Array.isArray(entry.batches)) {
        for (const batch of entry.batches) {
          if (
            typeof batch.index !== "number" ||
            !Array.isArray(batch.data) ||
            typeof batch.timestamp !== "number"
          ) {
            throw new CacheError(
              "Invalid batch structure",
              CacheErrorType.DATA_CORRUPTION
            );
          }
        }
      }

      return entry;
    } catch (error) {
      if (error instanceof CacheError) {
        throw error;
      }
      throw new CacheError(
        `Cache validation failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        CacheErrorType.DATA_CORRUPTION,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Check if cache entry has expired
   */
  private isCacheExpired(entry: CacheEntry<R>): boolean {
    const now = Date.now();
    const age = now - entry.metadata.timestamp;
    return age > this.config.maxAge;
  }

  /**
   * Update last accessed time for cache entry
   */
  private async updateLastAccessed(
    key: string,
    entry: CacheEntry<R>
  ): Promise<void> {
    try {
      const updatedEntry = {
        ...entry,
        metadata: {
          ...entry.metadata,
          lastAccessed: Date.now(),
        },
      };

      await this.dbWrapper.put(this.config.storeName, key, updatedEntry);
    } catch (error) {
      // Log error but don't fail the cache lookup
      console.warn("Failed to update last accessed time:", error);
    }
  }

  /**
   * Clean up corrupted cache entry
   */
  private async cleanupCorruptedCache(key: string): Promise<void> {
    try {
      await this.dbWrapper.delete(this.config.storeName, key);
      console.warn(`Cleaned up corrupted cache entry: ${key}`);
    } catch (error) {
      console.error("Failed to cleanup corrupted cache:", error);
    }
  }

  /**
   * Get existing cache entry or create a new one
   */
  private async getOrCreateCacheEntry(
    key: string,
    data: R[]
  ): Promise<CacheEntry<R>> {
    try {
      // Try to get existing entry
      const existingEntry = await this.dbWrapper.get(
        this.config.storeName,
        key
      );

      if (existingEntry) {
        const validatedEntry = this.validateCacheEntry(existingEntry);
        if (validatedEntry) {
          return validatedEntry;
        }
        // If validation fails, we'll create a new entry below
      }
    } catch (error) {
      console.warn("Failed to retrieve existing cache entry:", error);
      // Continue to create new entry
    }

    // Create new cache entry
    const now = Date.now();
    return {
      key,
      data: [],
      metadata: {
        timestamp: now,
        lastAccessed: now,
        dataHash: this.createHash(JSON.stringify(data)),
        transformHash: "", // Will be set when we have the transform function
        totalSize: 0,
        batchSize: this.config.maxSize || 500,
      },
      batches: [],
      isComplete: false,
      version: CACHE_VERSION,
    };
  }

  /**
   * Combine batch data into a single array, maintaining order
   */
  private combineBatchData(batches: CacheBatch<R>[]): R[] {
    // Sort batches by index to ensure correct order
    const sortedBatches = [...batches].sort((a, b) => a.index - b.index);

    // Combine all batch data
    const combinedData: R[] = [];
    for (const batch of sortedBatches) {
      combinedData.push(...batch.data);
    }

    return combinedData;
  }

  /**
   * Calculate the approximate size of data for storage management
   */
  private calculateDataSize(data: R[]): number {
    try {
      // Approximate size calculation using JSON serialization
      const serialized = JSON.stringify(data);
      return serialized.length * 2; // Rough estimate: 2 bytes per character
    } catch (error) {
      console.warn("Failed to calculate data size:", error);
      // Fallback: estimate based on array length
      return data.length * 100; // Rough estimate: 100 bytes per item
    }
  }

  /**
   * Check if error is related to storage quota being exceeded
   */
  private isQuotaExceededError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes("quota") ||
        message.includes("storage") ||
        message.includes("disk") ||
        error.name === "QuotaExceededError"
      );
    }
    return false;
  }

  /**
   * Handle storage quota exceeded by cleaning up old entries
   */
  private async handleStorageQuotaExceeded(): Promise<void> {
    try {
      console.warn("Storage quota exceeded, attempting cleanup...");

      // Get all cache keys
      const allKeys = await this.dbWrapper.getAllKeys(this.config.storeName);

      if (allKeys.length === 0) {
        return; // Nothing to clean up
      }

      // Get all entries with their timestamps
      const entriesWithTimestamps: Array<{
        key: string;
        timestamp: number;
      }> = [];

      for (const key of allKeys) {
        try {
          const entry = await this.dbWrapper.get(this.config.storeName, key);
          const validatedEntry = this.validateCacheEntry(entry);
          if (validatedEntry) {
            entriesWithTimestamps.push({
              key,
              timestamp: validatedEntry.metadata.lastAccessed,
            });
          }
        } catch (error) {
          console.warn(`Failed to get entry for cleanup: ${key}`, error);
        }
      }

      // Sort by last accessed time (oldest first)
      entriesWithTimestamps.sort((a, b) => a.timestamp - b.timestamp);

      // Remove oldest 25% of entries
      const entriesToRemove = Math.max(
        1,
        Math.floor(entriesWithTimestamps.length * 0.25)
      );

      for (let i = 0; i < entriesToRemove; i++) {
        try {
          await this.dbWrapper.delete(
            this.config.storeName,
            entriesWithTimestamps[i].key
          );
          console.debug(
            `Cleaned up old cache entry: ${entriesWithTimestamps[i].key}`
          );
        } catch (error) {
          console.warn(
            `Failed to delete entry during cleanup: ${entriesWithTimestamps[i].key}`,
            error
          );
        }
      }

      console.info(`Cleaned up ${entriesToRemove} old cache entries`);
    } catch (error) {
      console.error("Failed to handle storage quota exceeded:", error);
      throw error; // Re-throw so caller knows cleanup failed
    }
  }

  /**
   * Create optimized hash for data consistency using sampling for large datasets
   */
  private createOptimizedDataHash(data: T[]): string {
    if (data.length === 0) return "empty";

    // For small datasets, hash everything
    if (data.length <= 1000) {
      return this.createHash(JSON.stringify(data));
    }

    // For large datasets, use sampling strategy
    const sampleSize = Math.min(100, Math.ceil(data.length * 0.01)); // 1% sample, max 100 items
    const step = Math.floor(data.length / sampleSize);
    const samples: T[] = [];

    for (let i = 0; i < data.length; i += step) {
      samples.push(data[i]);
    }

    // Include first, last, and middle elements for better uniqueness
    const keyElements = [
      data[0],
      data[Math.floor(data.length / 2)],
      data[data.length - 1],
      ...samples,
    ];

    // Create hash with length and sample data
    const hashInput = `${data.length}_${JSON.stringify(keyElements)}`;
    return this.createHash(hashInput);
  }

  /**
   * Create optimized hash for transform function using key characteristics
   */
  private createOptimizedFunctionHash(transformFn: (item: T) => R): string {
    const fnString = transformFn.toString();

    // Extract key characteristics instead of hashing entire function
    const characteristics = {
      length: fnString.length,
      // Extract key patterns that indicate function behavior
      hasReturn: fnString.includes("return"),
      hasArrow: fnString.includes("=>"),
      hasAsync: fnString.includes("async"),
      hasAwait: fnString.includes("await"),
      // Sample key parts of the function
      firstChars: fnString.substring(0, 50),
      lastChars: fnString.substring(Math.max(0, fnString.length - 50)),
    };

    return this.createHash(JSON.stringify(characteristics));
  }

  /**
   * Compress batch data for storage efficiency
   */
  private compressBatchData(data: R[]): R[] {
    // Simple compression: remove duplicate objects if they exist
    if (data.length <= 1) return data;

    try {
      // Use Map for deduplication based on JSON representation
      const seen = new Map<string, R>();
      const compressed: R[] = [];

      for (const item of data) {
        const key = JSON.stringify(item);
        if (!seen.has(key)) {
          seen.set(key, item);
          compressed.push(item);
        }
      }

      // Update compression ratio stats
      const ratio = compressed.length / data.length;
      this.batchStorageStats.compressionRatio =
        (this.batchStorageStats.compressionRatio + ratio) / 2;

      return compressed.length < data.length ? compressed : data;
    } catch (error) {
      console.warn("Failed to compress batch data:", error);
      return data; // Return original data if compression fails
    }
  }

  /**
   * Create hash for data consistency
   */
  private createHash(data: string): string {
    // Optimized hash function with better distribution
    let hash = 5381; // DJB2 hash algorithm
    if (data.length === 0) return hash.toString(36);

    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = (hash << 5) + hash + char; // hash * 33 + char
      hash = hash & hash; // Convert to 32-bit integer
    }

    return Math.abs(hash).toString(36);
  }
}
