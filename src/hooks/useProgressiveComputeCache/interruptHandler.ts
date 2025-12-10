import type { CacheManager } from "./types/cache";

/**
 * 中断处理器，用于管理计算暂停、取消和组件生命周期
 * 需求: 3.3, 4.5
 */
export class InterruptHandler<T, R> {
  private isInterrupted = false;
  private isPaused = false;
  private isCancelled = false;
  private cleanupCallbacks: Array<() => void> = [];
  private cacheManager: CacheManager<T, R> | null = null;
  private currentCacheKey: string | null = null;
  private preservePartialResults = true;

  constructor(
    cacheManager?: CacheManager<T, R>,
    preservePartialResults = true
  ) {
    this.cacheManager = cacheManager || null;
    this.preservePartialResults = preservePartialResults;
  }

  /**
   * 设置当前缓存键以保留部分结果
   */
  public setCacheKey(key: string): void {
    this.currentCacheKey = key;
  }

  /**
   * 设置缓存管理器以保留部分结果
   */
  public setCacheManager(cacheManager: CacheManager<T, R>): void {
    this.cacheManager = cacheManager;
  }

  /**
   * 处理计算暂停 - 保留部分结果
   * 需求: 3.3
   */
  public async handlePause(): Promise<void> {
    if (this.isPaused) {
      console.debug("Computation already paused");
      return;
    }

    console.debug("Pausing computation and preserving partial results");
    this.isPaused = true;
    this.isInterrupted = true;

    // 部分结果在 storeBatch 操作期间自动保存到缓存中
    // 这里不需要额外操作，因为批次是增量存储的

    // 执行任何已注册的暂停回调
    this.executeCleanupCallbacks("pause");
  }

  /**
   * 处理计算取消 - 如果启用则保留部分结果
   * 需求: 3.3
   */
  public async handleCancel(): Promise<void> {
    if (this.isCancelled) {
      console.debug("Computation already cancelled");
      return;
    }

    console.debug("Cancelling computation");
    this.isCancelled = true;
    this.isInterrupted = true;

    if (this.preservePartialResults) {
      console.debug("Preserving partial results in cache");
      // 部分结果在 storeBatch 操作期间自动保存到缓存中
      // 缓存条目将保持可用以供将来使用
    } else {
      // 如果不保留部分结果，清理缓存
      await this.cleanupPartialResults();
    }

    // 执行任何已注册的取消回调
    this.executeCleanupCallbacks("cancel");
  }

  /**
   * Handle component unmount - clean up async operations but preserve cache
   * Requirements: 4.5
   */
  public async handleUnmount(): Promise<void> {
    console.debug("Handling component unmount");
    this.isInterrupted = true;

    // 清理所有异步操作
    this.executeCleanupCallbacks("unmount");

    // 清除清理回调以防止内存泄漏
    this.cleanupCallbacks = [];

    // 注意：根据需求 4.5，我们保留 IndexedDB 缓存数据
    // 只清理内存状态和异步操作
  }

  /**
   * Resume computation from where it was paused
   */
  public handleResume(): void {
    if (!this.isPaused) {
      console.debug("Computation not paused, cannot resume");
      return;
    }

    console.debug("Resuming computation");
    this.isPaused = false;
    this.isInterrupted = false;

    // 实际的恢复逻辑由 useProgressiveCompute hook 处理
    // 此方法只是更新中断状态
  }

  /**
   * Check if computation is currently interrupted (paused or cancelled)
   */
  public isComputationInterrupted(): boolean {
    return this.isInterrupted;
  }

  /**
   * Check if computation is paused
   */
  public isComputationPaused(): boolean {
    return this.isPaused;
  }

  /**
   * Check if computation is cancelled
   */
  public isComputationCancelled(): boolean {
    return this.isCancelled;
  }

  /**
   * Register a cleanup callback for async operations
   * These will be called during pause, cancel, or unmount
   */
  public registerCleanupCallback(
    callback: () => void,
    type: "pause" | "cancel" | "unmount" | "all" = "all"
  ): void {
    const wrappedCallback = () => {
      try {
        callback();
      } catch (error) {
        console.error("Error in cleanup callback:", error);
      }
    };

    // 存储带有类型信息和原始引用的回调
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (wrappedCallback as any).__type = type;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (wrappedCallback as any).__original = callback;
    this.cleanupCallbacks.push(wrappedCallback);
  }

  /**
   * Unregister a cleanup callback
   */
  public unregisterCleanupCallback(callback: () => void): void {
    const index = this.cleanupCallbacks.findIndex(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (wrappedCallback) => (wrappedCallback as any).__original === callback
    );
    if (index > -1) {
      this.cleanupCallbacks.splice(index, 1);
    }
  }

  /**
   * Execute cleanup callbacks for a specific event type
   */
  private executeCleanupCallbacks(
    eventType: "pause" | "cancel" | "unmount"
  ): void {
    console.debug(`Executing cleanup callbacks for event: ${eventType}`);

    for (const callback of this.cleanupCallbacks) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const callbackType = (callback as any).__type || "all";

      // 如果回调匹配事件类型或注册为所有事件，则执行回调
      if (callbackType === "all" || callbackType === eventType) {
        try {
          callback();
        } catch (error) {
          console.error(
            `Error executing cleanup callback for ${eventType}:`,
            error
          );
        }
      }
    }
  }

  /**
   * Clean up partial results from cache (when not preserving)
   */
  private async cleanupPartialResults(): Promise<void> {
    if (!this.cacheManager || !this.currentCacheKey) {
      console.debug("No cache manager or cache key available for cleanup");
      return;
    }

    try {
      console.debug(
        `Cleaning up partial results for key: ${this.currentCacheKey}`
      );
      await this.cacheManager.clearCache(this.currentCacheKey);
    } catch (error) {
      console.error("Failed to clean up partial results:", error);
      // Don't throw - cleanup failure shouldn't break the cancellation
    }
  }

  /**
   * Reset interrupt state (for restarting computation)
   */
  public reset(): void {
    console.debug("Resetting interrupt handler state");
    this.isInterrupted = false;
    this.isPaused = false;
    this.isCancelled = false;
    this.currentCacheKey = null;

    // Don't clear cleanup callbacks as they might be needed for the next computation
  }

  /**
   * Get current interrupt state for debugging
   */
  public getState(): {
    isInterrupted: boolean;
    isPaused: boolean;
    isCancelled: boolean;
    hasCleanupCallbacks: boolean;
    currentCacheKey: string | null;
  } {
    return {
      isInterrupted: this.isInterrupted,
      isPaused: this.isPaused,
      isCancelled: this.isCancelled,
      hasCleanupCallbacks: this.cleanupCallbacks.length > 0,
      currentCacheKey: this.currentCacheKey,
    };
  }

  /**
   * Create a wrapper for async operations that respects interrupt state
   * This can be used to make operations interrupt-aware
   */
  public createInterruptAwareWrapper<TResult>(
    operation: () => Promise<TResult>,
    operationName: string
  ): () => Promise<TResult | null> {
    return async (): Promise<TResult | null> => {
      if (this.isInterrupted) {
        console.debug(`Operation ${operationName} skipped due to interrupt`);
        return null;
      }

      try {
        const result = await operation();

        // Check if interrupted during operation
        if (this.isInterrupted) {
          console.debug(
            `Operation ${operationName} interrupted during execution`
          );
          return null;
        }

        return result;
      } catch (error) {
        console.error(`Operation ${operationName} failed:`, error);
        throw error;
      }
    };
  }

  /**
   * Wait for interrupt state to change (useful for pause/resume logic)
   */
  public async waitForResume(checkInterval = 100): Promise<void> {
    while (this.isPaused && !this.isCancelled) {
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }
  }

  /**
   * Check if operation should continue (not interrupted)
   */
  public shouldContinue(): boolean {
    return !this.isInterrupted;
  }

  /**
   * Check if operation should pause
   */
  public shouldPause(): boolean {
    return this.isPaused && !this.isCancelled;
  }

  /**
   * Check if operation should be cancelled
   */
  public shouldCancel(): boolean {
    return this.isCancelled;
  }
}
