import type {
  ErrorRecoveryStrategy,
  CacheErrorType,
  RecoveryAction,
} from "./types/cache";
import { CacheError } from "./types/cache";
import { RETRY_CONFIG } from "./constants/cache";

/**
 * 缓存操作的错误恢复策略实现
 * 处理错误检测、分类和恢复操作
 */
export class ErrorRecoveryStrategyImpl implements ErrorRecoveryStrategy {
  private fallbackMode = false;
  private retryCount = new Map<string, number>();

  /**
   * 基于错误特征检测错误类型
   * 需求: 1.3, 5.1, 5.2, 5.4, 5.5
   */
  public detectErrorType(error: Error): CacheErrorType {
    // 直接处理 CacheError 实例
    if (error instanceof CacheError) {
      return error.type;
    }

    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    // IndexedDB 可用性错误
    if (
      message.includes("indexeddb") ||
      message.includes("not supported") ||
      message.includes("not available") ||
      name.includes("notsupportederror")
    ) {
      return "INITIALIZATION_FAILED";
    }

    // 存储配额错误
    if (
      message.includes("quota") ||
      message.includes("storage") ||
      message.includes("disk") ||
      name === "quotaexceedederror" ||
      message.includes("insufficient storage")
    ) {
      return "STORAGE_QUOTA_EXCEEDED";
    }

    // 超时错误
    if (
      message.includes("timeout") ||
      message.includes("timed out") ||
      name.includes("timeouterror") ||
      message.includes("operation timeout")
    ) {
      return "TIMEOUT_ERROR";
    }

    // 序列化/反序列化错误
    if (
      message.includes("json") ||
      message.includes("parse") ||
      message.includes("stringify") ||
      message.includes("serializ") ||
      message.includes("invalid character") ||
      name.includes("syntaxerror")
    ) {
      return "SERIALIZATION_ERROR";
    }

    // 数据损坏错误
    if (
      message.includes("corrupt") ||
      message.includes("invalid") ||
      message.includes("malformed") ||
      message.includes("unexpected") ||
      message.includes("version mismatch") ||
      name.includes("dataerror")
    ) {
      return "DATA_CORRUPTION";
    }

    // 数据库操作错误
    if (
      message.includes("database") ||
      message.includes("transaction") ||
      message.includes("objectstore") ||
      name.includes("invalidstateerror") ||
      name.includes("transactioninactiveerror")
    ) {
      return "INITIALIZATION_FAILED";
    }

    // 默认为未知错误
    return "UNKNOWN_ERROR";
  }

  /**
   * 基于错误类型选择适当的恢复策略
   * 需求: 1.3, 3.4, 5.1, 5.2, 5.4, 5.5
   */
  public selectRecoveryStrategy(errorType: CacheErrorType): RecoveryAction {
    // 如果已经处于降级模式，不尝试复杂的恢复
    if (this.fallbackMode) {
      return "FALLBACK_TO_NON_CACHED";
    }

    switch (errorType) {
      case "INITIALIZATION_FAILED":
        // 对于初始化失败，降级到非缓存模式
        return "FALLBACK_TO_NON_CACHED";

      case "STORAGE_QUOTA_EXCEEDED":
        // 清理旧条目并重试
        return "CLEANUP_AND_RETRY";

      case "DATA_CORRUPTION":
        // 删除损坏的缓存并重试
        return "DELETE_CORRUPTED_CACHE";

      case "SERIALIZATION_ERROR":
        // 对于序列化错误，降级到非缓存模式
        // 因为数据可能无法序列化
        return "FALLBACK_TO_NON_CACHED";

      case "TIMEOUT_ERROR":
        // 使用指数退避重试超时错误
        return "RETRY_OPERATION";

      case "UNKNOWN_ERROR":
      default:
        // 对于未知错误，先尝试清理，然后降级
        return "CLEANUP_AND_RETRY";
    }
  }

  /**
   * Execute the selected recovery action
   * Requirements: 1.3, 3.4, 5.1, 5.2, 5.4, 5.5
   */
  public async executeRecovery(action: RecoveryAction): Promise<boolean> {
    try {
      switch (action) {
        case "RETRY_OPERATION":
          return await this.retryOperation();

        case "CLEANUP_AND_RETRY":
          return await this.cleanupAndRetry();

        case "FALLBACK_TO_NON_CACHED":
          return this.fallbackToNonCached();

        case "DELETE_CORRUPTED_CACHE":
          return await this.deleteCorruptedCache();

        case "REDUCE_BATCH_SIZE":
          return this.reduceBatchSize();

        default:
          console.warn(`Unknown recovery action: ${action}`);
          return this.fallbackToNonCached();
      }
    } catch (error) {
      console.error("Recovery action failed:", error);
      // 如果恢复失败，降级到非缓存模式
      return this.fallbackToNonCached();
    }
  }

  /**
   * Fallback to non-cached mode
   * Requirements: 1.3, 5.1
   */
  public fallbackToNonCached(): boolean {
    console.warn("Falling back to non-cached mode");
    this.fallbackMode = true;
    this.retryCount.clear();
    return true; // 总是成功
  }

  /**
   * Check if currently in fallback mode
   */
  public isInFallbackMode(): boolean {
    return this.fallbackMode;
  }

  /**
   * Reset fallback mode (for testing or manual recovery)
   */
  public resetFallbackMode(): void {
    this.fallbackMode = false;
    this.retryCount.clear();
  }

  /**
   * Get retry count for a specific operation
   */
  public getRetryCount(operationId: string): number {
    return this.retryCount.get(operationId) || 0;
  }

  /**
   * Increment retry count for an operation
   */
  public incrementRetryCount(operationId: string): number {
    const current = this.getRetryCount(operationId);
    const newCount = current + 1;
    this.retryCount.set(operationId, newCount);
    return newCount;
  }

  /**
   * Reset retry count for an operation
   */
  public resetRetryCount(operationId: string): void {
    this.retryCount.delete(operationId);
  }

  /**
   * Check if operation should be retried based on retry limits
   */
  public shouldRetry(operationId: string): boolean {
    const retryCount = this.getRetryCount(operationId);
    return retryCount < RETRY_CONFIG.MAX_RETRIES && !this.fallbackMode;
  }

  /**
   * Calculate delay for retry with exponential backoff
   */
  public calculateRetryDelay(operationId: string): number {
    const retryCount = this.getRetryCount(operationId);
    return (
      RETRY_CONFIG.RETRY_DELAY *
      Math.pow(RETRY_CONFIG.BACKOFF_MULTIPLIER, retryCount)
    );
  }

  /**
   * Retry operation with exponential backoff
   */
  private async retryOperation(): Promise<boolean> {
    // 这是一个占位符 - 实际的重试逻辑将由调用代码实现
    // 使用 shouldRetry() 和 calculateRetryDelay() 方法
    console.info("Retry operation strategy selected");
    return true;
  }

  /**
   * Cleanup and retry strategy
   */
  private async cleanupAndRetry(): Promise<boolean> {
    try {
      console.info("Executing cleanup and retry strategy");

      // 这通常涉及：
      // 1. 清理旧的/过期的缓存条目
      // 2. 释放存储空间
      // 3. 重置任何损坏的状态

      // 实际的清理将由缓存管理器执行
      // 此方法只是指示应该执行清理
      return true;
    } catch (error) {
      console.error("Cleanup and retry failed:", error);
      return false;
    }
  }

  /**
   * Delete corrupted cache strategy
   */
  private async deleteCorruptedCache(): Promise<boolean> {
    try {
      console.info("Executing delete corrupted cache strategy");

      // 这通常涉及：
      // 1. 识别损坏的缓存条目
      // 2. 从存储中删除它们
      // 3. 清除任何相关的元数据

      // 实际的删除将由缓存管理器执行
      // 此方法只是指示应该删除损坏的缓存
      return true;
    } catch (error) {
      console.error("Delete corrupted cache failed:", error);
      return false;
    }
  }

  /**
   * Reduce batch size strategy
   */
  private reduceBatchSize(): boolean {
    console.info("Executing reduce batch size strategy");

    // 这通常涉及：
    // 1. 减少操作的批次大小
    // 2. 使用更小的块来避免内存/存储问题

    // 实际的批次大小减少将由调用代码处理
    // 此方法只是指示应该减少批次大小
    return true;
  }

  /**
   * Handle specific error with automatic recovery
   * This is a convenience method that combines detection, strategy selection, and execution
   */
  public async handleError(
    error: Error,
    operationId: string,
    _context?: { cacheManager?: unknown; operation?: string }
  ): Promise<{
    recovered: boolean;
    action: RecoveryAction;
    shouldFallback: boolean;
  }> {
    try {
      // 检测错误类型
      const errorType = this.detectErrorType(error);
      console.debug(
        `Detected error type: ${errorType} for operation: ${operationId}`
      );

      // 检查是否应该重试此操作
      if (!this.shouldRetry(operationId)) {
        console.warn(
          `Max retries exceeded for operation: ${operationId}, falling back`
        );
        return {
          recovered: this.fallbackToNonCached(),
          action: "FALLBACK_TO_NON_CACHED",
          shouldFallback: true,
        };
      }

      // 选择恢复策略
      const action = this.selectRecoveryStrategy(errorType);
      console.debug(
        `Selected recovery action: ${action} for operation: ${operationId}`
      );

      // 增加重试计数
      this.incrementRetryCount(operationId);

      // 执行恢复
      const recovered = await this.executeRecovery(action);

      return {
        recovered,
        action,
        shouldFallback: this.fallbackMode,
      };
    } catch (recoveryError) {
      console.error("Error recovery failed:", recoveryError);
      return {
        recovered: this.fallbackToNonCached(),
        action: "FALLBACK_TO_NON_CACHED",
        shouldFallback: true,
      };
    }
  }

  /**
   * Create a recovery-aware wrapper for async operations
   * This can be used to automatically handle errors in cache operations
   */
  public createRecoveryWrapper<T>(
    operationId: string,
    operation: () => Promise<T>,
    fallbackValue: T
  ): () => Promise<T> {
    return async (): Promise<T> => {
      if (this.fallbackMode) {
        console.debug(`Operation ${operationId} skipped due to fallback mode`);
        return fallbackValue;
      }

      try {
        const result = await operation();
        // 成功时重置重试计数
        this.resetRetryCount(operationId);
        return result;
      } catch (error) {
        console.warn(`Operation ${operationId} failed:`, error);

        const recovery = await this.handleError(
          error instanceof Error ? error : new Error(String(error)),
          operationId
        );

        if (recovery.shouldFallback) {
          console.info(
            `Operation ${operationId} falling back to default value`
          );
          return fallbackValue;
        }

        // 如果恢复建议重试且我们没有超过限制
        if (
          recovery.action === "RETRY_OPERATION" &&
          this.shouldRetry(operationId)
        ) {
          const delay = this.calculateRetryDelay(operationId);
          console.debug(`Retrying operation ${operationId} after ${delay}ms`);

          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.createRecoveryWrapper(
            operationId,
            operation,
            fallbackValue
          )();
        }

        return fallbackValue;
      }
    };
  }
}

// 导出单例实例供全局使用
export const errorRecoveryStrategy = new ErrorRecoveryStrategyImpl();
