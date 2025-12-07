import { useState, useRef, useCallback, useEffect } from "react";

interface ProgressiveComputeOptions {
  batchSize?: number;
  debounceMs?: number;
  timeout?: number; // requestIdleCallback 的兜底超时（ms）
}

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
) {
  const { batchSize = 500, debounceMs = 16, timeout = 1000 } = options;

  const [result, setResult] = useState<R[]>([]);
  const [isComputing, setIsComputing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  const generatorRef = useRef<ComputeGenerator<R> | null>(null);
  const isCancelledRef = useRef(false);
  const isPausedRef = useRef(false);
  const isMountedRef = useRef(true); // 防止内存泄漏
  const rafIdRef = useRef<number | null>(null);
  const timeoutIdRef = useRef<number | null>(null);
  const idleCallbackIdRef = useRef<number | null>(null);

  // 清理所有异步任务
  const cleanup = () => {
    isCancelledRef.current = true;
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
  const executeStep = useCallback(() => {
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
      scheduleNextFrame(executeStep);
    } catch (err) {
      if (!isCancelledRef.current && isMountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsComputing(false);
      }
    }
  }, [debounceMs, scheduleNextFrame]);

  // 启动
  const start = useCallback(() => {
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

    generatorRef.current = createGenerator();
    scheduleNextFrame(executeStep);
  }, [
    isComputing,
    data.length,
    createGenerator,
    scheduleNextFrame,
    executeStep,
  ]);

  const pause = useCallback(() => {
    isPausedRef.current = true;
    if (isMountedRef.current) {
      setIsComputing(false);
    }
  }, []);

  const resume = useCallback(() => {
    if (!isPausedRef.current || !generatorRef.current) return;
    isPausedRef.current = false;
    if (isMountedRef.current) {
      setIsComputing(true);
    }
    scheduleNextFrame(executeStep);
  }, [scheduleNextFrame, executeStep]);

  const cancel = useCallback(() => {
    cleanup();
  }, []);

  const reset = useCallback(() => {
    cleanup();
    if (isMountedRef.current) {
      setResult([]);
      setProgress(0);
      setError(null);
    }
    generatorRef.current = null;
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cleanup();
    };
  }, []);

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
  };
}
