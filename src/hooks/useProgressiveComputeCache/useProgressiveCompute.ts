import { useState, useRef, useCallback, useEffect } from "react";
import type {
  ProgressiveComputeOptions,
  ProgressiveComputeResult,
  CacheStatus,
  CacheManager,
} from "./types";
import { CacheManagerImpl } from "./cacheManager";
import { InterruptHandler } from "./interruptHandler";

// 定义 Generator 返回值类型
type YieldValue<R> = {
  type?: "pause";
  partial?: R[];
  progress?: number;
};

type ComputeGenerator<R> = Generator<YieldValue<R>, R[], void>;

export function useProgressiveCompute<T, R>(
  data: T[],
  transformFn: (item: T) => R,
  options: ProgressiveComputeOptions = {}
): ProgressiveComputeResult<R> {
  const {
    batchSize = 500,
    debounceMs = 16,
    timeout = 1000,
    cache = false,
    cacheOptions = {},
  } = options;

  const [result, setResult] = useState<R[]>([]);
  const [isComputing, setIsComputing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const [cacheStatus, setCacheStatus] = useState<CacheStatus>({
    enabled: cache,
    hit: false,
    size: 0,
  });

  const generatorRef = useRef<ComputeGenerator<R> | null>(null);
  const isCancelledRef = useRef(false);
  const isPausedRef = useRef(false);
  const isMountedRef = useRef(true); // 防止内存泄漏
  const rafIdRef = useRef<number | null>(null);
  const timeoutIdRef = useRef<number | null>(null);
  const idleCallbackIdRef = useRef<number | null>(null);

  // 缓存相关的 refs
  const cacheManagerRef = useRef<CacheManager<T, R> | null>(null);
  const currentCacheKeyRef = useRef<string | null>(null);
  const cacheInitializedRef = useRef(false);

  // 中断处理
  const interruptHandlerRef = useRef<InterruptHandler<T, R> | null>(null);

  // 初始化缓存管理器和中断处理器
  const initializeCache = useCallback(async () => {
    if (!cache || cacheInitializedRef.current) {
      return;
    }

    try {
      const cacheManager = new CacheManagerImpl<T, R>(cacheOptions);
      const initialized = await cacheManager.initialize();

      if (initialized) {
        cacheManagerRef.current = cacheManager;
        cacheInitializedRef.current = true;

        // 使用缓存管理器初始化中断处理器
        if (!interruptHandlerRef.current) {
          interruptHandlerRef.current = new InterruptHandler<T, R>(
            cacheManager,
            true
          );
        } else {
          interruptHandlerRef.current.setCacheManager(cacheManager);
        }

        if (isMountedRef.current) {
          setCacheStatus((prev) => ({ ...prev, enabled: true }));
        }

        console.debug("Cache initialized successfully");
      } else {
        console.warn(
          "Cache initialization failed, falling back to non-cached mode"
        );

        // 初始化不带缓存管理器的中断处理器
        if (!interruptHandlerRef.current) {
          interruptHandlerRef.current = new InterruptHandler<T, R>(
            undefined,
            false
          );
        }

        if (isMountedRef.current) {
          setCacheStatus((prev) => ({ ...prev, enabled: false }));
        }
      }
    } catch (error) {
      console.error("Cache initialization error:", error);

      // 初始化不带缓存管理器的中断处理器
      if (!interruptHandlerRef.current) {
        interruptHandlerRef.current = new InterruptHandler<T, R>(
          undefined,
          false
        );
      }

      if (isMountedRef.current) {
        setCacheStatus((prev) => ({ ...prev, enabled: false }));
      }
    }
  }, [cache, cacheOptions]);

  // 清理所有异步任务 - 增强版本支持中断处理
  const cleanup = useCallback(
    async (reason: "cancel" | "unmount" = "cancel") => {
      isCancelledRef.current = true;

      // 通过中断处理器处理中断
      if (interruptHandlerRef.current) {
        if (reason === "cancel") {
          await interruptHandlerRef.current.handleCancel();
        } else if (reason === "unmount") {
          await interruptHandlerRef.current.handleUnmount();
        }
      }

      // 清理异步操作
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (timeoutIdRef.current !== null) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
      if (
        idleCallbackIdRef.current !== null &&
        typeof window !== "undefined" &&
        window.cancelIdleCallback
      ) {
        window.cancelIdleCallback(idleCallbackIdRef.current);
        idleCallbackIdRef.current = null;
      }
      if (isMountedRef.current) {
        setIsComputing(false);
      }
    },
    []
  );

  // 创建生成器
  const createGenerator = useCallback(
    function* (): ComputeGenerator<R> {
      const results: R[] = [];
      for (let i = 0; i < data.length; i += batchSize) {
        if (isCancelledRef.current) return results;

        // 暂停检查，直接 yield 并在外部处理
        if (isPausedRef.current) {
          yield { type: "pause" };
          i -= batchSize; // 回退索引，下次继续当前批次
          continue;
        }

        const chunk = data.slice(i, i + batchSize);
        const transformedChunk = chunk.map(transformFn);
        results.push(...transformedChunk);

        // 修正进度计算
        const currentProgress = Math.min(
          100,
          Math.round(((i + chunk.length) / data.length) * 100)
        );
        yield { partial: transformedChunk, progress: currentProgress };
      }
      return results;
    },
    [data, batchSize, transformFn]
  );

  // 智能调度器：优先 requestIdleCallback，否则 setTimeout
  const scheduleNextFrame = useCallback(
    (callback: () => void) => {
      if (typeof window === "undefined") {
        setTimeout(callback, 0);
        return;
      }

      if (window.requestIdleCallback) {
        idleCallbackIdRef.current = window.requestIdleCallback(
          (deadline) => {
            if (deadline.timeRemaining() > 0 || deadline.didTimeout) {
              callback();
            } else {
              scheduleNextFrame(callback);
            }
          },
          { timeout }
        );
      } else {
        setTimeout(callback, 0);
      }
    },
    [timeout]
  );

  // 核心执行逻辑（带时间片控制）
  const executeStep = useCallback(async () => {
    if (
      !generatorRef.current ||
      isCancelledRef.current ||
      !isMountedRef.current
    )
      return;

    try {
      const startTime = performance.now();
      let genResult;

      while (true) {
        if (isPausedRef.current) {
          if (isMountedRef.current) {
            setIsComputing(false);
          }
          return;
        }
        if (isCancelledRef.current) return;

        genResult = generatorRef.current.next();

        if (genResult.done) {
          if (!isCancelledRef.current && isMountedRef.current) {
            setResult(genResult.value);
            setProgress(100);
            setIsComputing(false);

            // 如果启用缓存，标记缓存为完成
            if (cacheManagerRef.current && currentCacheKeyRef.current) {
              try {
                await cacheManagerRef.current.markComplete(
                  currentCacheKeyRef.current,
                  genResult.value
                );
                console.debug("Cache marked as complete");
              } catch (error) {
                console.warn("Failed to mark cache as complete:", error);
                // 如果缓存标记失败，不要让计算失败
              }
            }
          }
          return;
        }

        // 处理暂停信号
        if (genResult.value?.type === "pause") {
          if (isMountedRef.current) {
            setIsComputing(false);
          }
          return;
        }

        if (genResult.value?.partial) {
          // 防抖更新 UI
          if (rafIdRef.current) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
          }
          if (timeoutIdRef.current) {
            clearTimeout(timeoutIdRef.current);
            timeoutIdRef.current = null;
          }

          const { partial, progress: prog } = genResult.value;

          // 如果启用缓存，将批次存储到缓存
          if (
            cacheManagerRef.current &&
            currentCacheKeyRef.current &&
            partial.length > 0
          ) {
            try {
              // 基于当前进度计算批次索引
              const batchIndex = Math.floor(
                (prog ?? 0) / (100 / Math.ceil(data.length / batchSize))
              );
              await cacheManagerRef.current.storeBatch(
                currentCacheKeyRef.current,
                partial,
                batchIndex
              );
            } catch (error) {
              console.warn("Failed to store batch to cache:", error);
              // 即使缓存存储失败也继续计算
            }
          }

          const updateUI = () => {
            if (!isMountedRef.current) return;
            setResult((prev) => [...prev, ...partial]);
            setProgress(prog ?? 0);
          };

          if (debounceMs <= 16) {
            rafIdRef.current = requestAnimationFrame(updateUI);
          } else {
            timeoutIdRef.current = setTimeout(updateUI, debounceMs);
          }
        }

        // 每帧最多执行 16ms，防止卡顿
        if (performance.now() - startTime > 16) break;
      }

      // 智能调度下一帧
      scheduleNextFrame(() => executeStep());
    } catch (err) {
      if (!isCancelledRef.current && isMountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsComputing(false);
      }
    }
  }, [debounceMs, scheduleNextFrame, data.length, batchSize]);

  // 在开始计算前检查缓存
  const checkCacheAndStart = useCallback(async () => {
    if (!cacheManagerRef.current || !cache) {
      return null; // 没有可用缓存，继续计算
    }

    try {
      // 生成缓存键
      const cacheKey = cacheManagerRef.current.generateKey(data, transformFn);
      currentCacheKeyRef.current = cacheKey;

      // 检查缓存结果
      const cachedResult = await cacheManagerRef.current.checkCache(cacheKey);

      if (cachedResult && cachedResult.isComplete) {
        // 缓存命中 - 立即返回缓存数据
        if (isMountedRef.current) {
          setResult(cachedResult.data);
          setProgress(100);
          setIsComputing(false);
          setCacheStatus((prev) => ({
            ...prev,
            hit: true,
            lastUpdated: new Date(cachedResult.timestamp),
          }));
        }

        console.debug("Cache hit - returning cached results");
        return cachedResult.data;
      } else {
        // 缓存未命中或不完整 - 更新状态
        if (isMountedRef.current) {
          setCacheStatus((prev) => ({ ...prev, hit: false }));
        }

        console.debug("Cache miss - proceeding with computation");
        return null;
      }
    } catch (error) {
      console.error("Cache check failed:", error);
      // 即使缓存检查失败也继续计算
      return null;
    }
  }, [cache, data, transformFn]);

  // 启动
  const start = useCallback(async () => {
    if (isComputing || data.length === 0) return;

    cleanup();
    isCancelledRef.current = false;
    isPausedRef.current = false;

    if (isMountedRef.current) {
      setError(null);
      setResult([]);
      setProgress(0);
      setIsComputing(true);
    }

    // 如果需要，初始化缓存
    if (cache && !cacheInitializedRef.current) {
      await initializeCache();
    }

    // 如果启用，首先检查缓存
    const cachedResult = await checkCacheAndStart();
    if (cachedResult) {
      return; // 缓存命中，无需计算
    }

    // 在中断处理器中设置缓存键以保留部分结果
    if (interruptHandlerRef.current && currentCacheKeyRef.current) {
      interruptHandlerRef.current.setCacheKey(currentCacheKeyRef.current);
    }

    // 没有缓存命中，继续计算
    generatorRef.current = createGenerator();
    scheduleNextFrame(() => executeStep());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isComputing, data.length, cache]);

  const pause = useCallback(async () => {
    isPausedRef.current = true;

    // 通过中断处理器处理暂停
    if (interruptHandlerRef.current) {
      await interruptHandlerRef.current.handlePause();
    }

    if (isMountedRef.current) {
      setIsComputing(false);
    }
  }, []);

  const resume = useCallback(() => {
    if (!isPausedRef.current || !generatorRef.current) return;

    // 通过中断处理器处理恢复
    if (interruptHandlerRef.current) {
      interruptHandlerRef.current.handleResume();
    }

    isPausedRef.current = false;
    if (isMountedRef.current) {
      setIsComputing(true);
    }
    scheduleNextFrame(() => executeStep());
  }, [scheduleNextFrame, executeStep]);

  const cancel = useCallback(async () => {
    await cleanup("cancel");
  }, [cleanup]);

  const reset = useCallback(
    async (clearCache?: boolean) => {
      await cleanup("cancel");

      // 重置中断处理器状态
      if (interruptHandlerRef.current) {
        interruptHandlerRef.current.reset();
      }

      if (isMountedRef.current) {
        setResult([]);
        setProgress(0);
        setError(null);
      }
      generatorRef.current = null;

      // 如果请求且缓存可用，清除缓存
      if (clearCache && cacheManagerRef.current && currentCacheKeyRef.current) {
        try {
          await cacheManagerRef.current.clearCache(currentCacheKeyRef.current);
          console.debug("Cache cleared for current computation");

          // 更新缓存状态
          if (isMountedRef.current) {
            setCacheStatus((prev) => ({
              ...prev,
              hit: false,
              lastUpdated: undefined,
            }));
          }
        } catch (error) {
          console.warn("Failed to clear cache:", error);
          // 如果缓存清除失败，不要让重置失败
        }
      }

      // 重置缓存键
      currentCacheKeyRef.current = null;
    },
    [cleanup]
  );

  useEffect(() => {
    isMountedRef.current = true;

    // 如果启用，初始化缓存和中断处理器
    const initCache = async () => {
      if (!cache || cacheInitializedRef.current) {
        return;
      }

      try {
        const cacheManager = new CacheManagerImpl<T, R>(cacheOptions);
        const initialized = await cacheManager.initialize();

        if (initialized) {
          cacheManagerRef.current = cacheManager;
          cacheInitializedRef.current = true;

          // 使用缓存管理器初始化中断处理器
          if (!interruptHandlerRef.current) {
            interruptHandlerRef.current = new InterruptHandler<T, R>(
              cacheManager,
              true
            );
          } else {
            interruptHandlerRef.current.setCacheManager(cacheManager);
          }

          if (isMountedRef.current) {
            setCacheStatus((prev) => ({ ...prev, enabled: true }));
          }

          console.debug("Cache initialized successfully");
        } else {
          console.warn(
            "Cache initialization failed, falling back to non-cached mode"
          );

          // 初始化不带缓存管理器的中断处理器
          if (!interruptHandlerRef.current) {
            interruptHandlerRef.current = new InterruptHandler<T, R>(
              undefined,
              false
            );
          }

          if (isMountedRef.current) {
            setCacheStatus((prev) => ({ ...prev, enabled: false }));
          }
        }
      } catch (error) {
        console.error("Cache initialization error:", error);

        // 初始化不带缓存管理器的中断处理器
        if (!interruptHandlerRef.current) {
          interruptHandlerRef.current = new InterruptHandler<T, R>(
            undefined,
            false
          );
        }

        if (isMountedRef.current) {
          setCacheStatus((prev) => ({ ...prev, enabled: false }));
        }
      }
    };

    if (cache) {
      initCache();
    } else {
      // 即使没有缓存也初始化中断处理器
      if (!interruptHandlerRef.current) {
        interruptHandlerRef.current = new InterruptHandler<T, R>(
          undefined,
          false
        );
      }
    }

    // 为异步操作注册清理回调
    if (interruptHandlerRef.current) {
      interruptHandlerRef.current.registerCleanupCallback(() => {
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
      }, "all");

      interruptHandlerRef.current.registerCleanupCallback(() => {
        if (timeoutIdRef.current !== null) {
          clearTimeout(timeoutIdRef.current);
          timeoutIdRef.current = null;
        }
      }, "all");

      interruptHandlerRef.current.registerCleanupCallback(() => {
        if (
          idleCallbackIdRef.current !== null &&
          typeof window !== "undefined" &&
          window.cancelIdleCallback
        ) {
          window.cancelIdleCallback(idleCallbackIdRef.current);
          idleCallbackIdRef.current = null;
        }
      }, "all");
    }

    return () => {
      isMountedRef.current = false;

      // 清理函数
      const cleanupAsync = async () => {
        isCancelledRef.current = true;

        // 通过中断处理器处理中断
        if (interruptHandlerRef.current) {
          await interruptHandlerRef.current.handleUnmount();
        }

        // 清理异步操作
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        if (timeoutIdRef.current !== null) {
          clearTimeout(timeoutIdRef.current);
          timeoutIdRef.current = null;
        }
        if (
          idleCallbackIdRef.current !== null &&
          typeof window !== "undefined" &&
          window.cancelIdleCallback
        ) {
          window.cancelIdleCallback(idleCallbackIdRef.current);
          idleCallbackIdRef.current = null;
        }
        if (isMountedRef.current) {
          setIsComputing(false);
        }
      };

      cleanupAsync();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cache]);

  return {
    result,
    isComputing,
    progress,
    error,
    start,
    pause,
    resume,
    cancel,
    reset,
    cacheStatus,
  };
}
