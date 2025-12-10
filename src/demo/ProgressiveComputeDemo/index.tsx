import { useState, useEffect, useRef } from "react";
import styles from "./styles.module.scss";
import { useProgressiveCompute } from "../../hooks/useProgressiveComputeCache/useProgressiveCompute";

interface DataItem {
  id: number;
  value: number;
}

interface TransformedItem {
  id: number;
  squared: number;
  cubed: number;
  isPrime: boolean;
}

// 判断是否为质数（用于增加计算复杂度）
const isPrime = (num: number): boolean => {
  if (num <= 1) return false;
  if (num <= 3) return true;
  if (num % 2 === 0 || num % 3 === 0) return false;
  for (let i = 5; i * i <= num; i += 6) {
    if (num % i === 0 || num % (i + 2) === 0) return false;
  }
  return true;
};

// 生成随机数据（组件外部函数，避免 React 编译器警告）
const generateRandomData = (size: number): DataItem[] => {
  const data: DataItem[] = [];
  for (let i = 0; i < size; i++) {
    data.push({
      id: i,
      value: Math.floor(Math.random() * 1000),
    });
  }
  return data;
};

interface PerformanceMetrics {
  startTime: number;
  endTime: number;
  duration: number;
  itemsPerSecond: number;
  memoryUsed?: number;
}

export default function ProgressiveComputeDemo() {
  const [dataSize, setDataSize] = useState(10000);
  const [batchSize, setBatchSize] = useState(500);
  const [debounceMs, setDebounceMs] = useState(16);
  const [sourceData, setSourceData] = useState<DataItem[]>([]);
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [memoryUsage, setMemoryUsage] = useState<number>(0);

  const startTimeRef = useRef<number>(0);

  // 转换函数：模拟复杂计算
  const transformFn = (item: DataItem): TransformedItem => {
    return {
      id: item.id,
      squared: item.value ** 2,
      cubed: item.value ** 3,
      isPrime: isPrime(item.value),
    };
  };

  const [cacheEnabled, setCacheEnabled] = useState(false);

  const {
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
  } = useProgressiveCompute<DataItem, TransformedItem>(
    sourceData,
    transformFn,
    {
      batchSize,
      debounceMs,
      timeout: 1000,
      cache: cacheEnabled,
      cacheOptions: {
        maxAge: 5 * 60 * 1000, // 5 minutes
        maxSize: 100, // Max 100 cache entries
      },
    }
  );

  // 监控内存使用（如果浏览器支持）
  useEffect(() => {
    if (!isComputing) return;

    const updateMemory = () => {
      const perf = performance as Performance & {
        memory?: {
          usedJSHeapSize: number;
          totalJSHeapSize: number;
          jsHeapSizeLimit: number;
        };
      };
      if (perf.memory) {
        const usedMB = perf.memory.usedJSHeapSize / 1024 / 1024;
        setMemoryUsage(usedMB);
      }
    };

    updateMemory();
    const interval = setInterval(updateMemory, 500);
    return () => clearInterval(interval);
  }, [isComputing]);

  // 计算性能指标
  useEffect(() => {
    if (isComputing && startTimeRef.current === 0) {
      startTimeRef.current = Date.now();
    }

    if (!isComputing && result.length > 0 && startTimeRef.current > 0) {
      const endTime = Date.now();
      const duration = endTime - startTimeRef.current;
      const itemsPerSecond = (result.length / duration) * 1000;

      setMetrics({
        startTime: startTimeRef.current,
        endTime,
        duration,
        itemsPerSecond,
        memoryUsed: memoryUsage,
      });
    }
  }, [isComputing, result.length, memoryUsage]);

  // 生成测试数据
  const generateData = () => {
    resetMetrics();
    const data = generateRandomData(dataSize);
    setSourceData(data);
  };

  // 重置性能指标
  const resetMetrics = () => {
    setMetrics(null);
    startTimeRef.current = 0;
  };

  // 包装 start 函数
  const handleStart = () => {
    resetMetrics();
    start();
  };

  // 包装 cancel 函数
  const handleCancel = () => {
    cancel();
    if (startTimeRef.current > 0) {
      const duration = Date.now() - startTimeRef.current;
      setMetrics({
        startTime: startTimeRef.current,
        endTime: Date.now(),
        duration,
        itemsPerSecond: (result.length / duration) * 1000,
        memoryUsed: memoryUsage,
      });
    }
  };

  // 导出结果为 JSON
  const exportResults = () => {
    const dataStr = JSON.stringify(result, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `progressive-compute-results-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // 测试用例
  const testCases = [
    {
      name: "小数据集 (100)",
      size: 100,
      batch: 50,
    },
    {
      name: "中等数据集 (5000)",
      size: 5000,
      batch: 500,
    },
    {
      name: "大数据集 (50000)",
      size: 50000,
      batch: 1000,
    },
  ];

  const runTestCase = (size: number, batch: number) => {
    resetMetrics();
    setDataSize(size);
    setBatchSize(batch);
    const data = generateRandomData(size);
    setSourceData(data);
    // 延迟启动，确保状态更新
    setTimeout(() => start(), 100);
  };

  return (
    <div className={styles.container}>
      <h2>渐进式计算 Hook 测试</h2>

      {/* 配置区 */}
      <div className={styles.config}>
        <div className={styles.configItem}>
          <label>
            数据量:
            <input
              type="number"
              value={dataSize}
              onChange={(e) => setDataSize(Number(e.target.value))}
              min={100}
              max={100000}
              step={100}
            />
          </label>
        </div>

        <div className={styles.configItem}>
          <label>
            批次大小:
            <input
              type="number"
              value={batchSize}
              onChange={(e) => setBatchSize(Number(e.target.value))}
              min={10}
              max={5000}
              step={10}
            />
          </label>
        </div>

        <div className={styles.configItem}>
          <label>
            防抖延迟 (ms):
            <input
              type="number"
              value={debounceMs}
              onChange={(e) => setDebounceMs(Number(e.target.value))}
              min={0}
              max={1000}
              step={16}
            />
          </label>
        </div>

        <div className={styles.configItem}>
          <label>
            <input
              type="checkbox"
              checked={cacheEnabled}
              onChange={(e) => setCacheEnabled(e.target.checked)}
            />
            启用缓存
          </label>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className={styles.actions}>
        <button onClick={generateData} disabled={isComputing}>
          生成数据
        </button>
        <button
          onClick={handleStart}
          disabled={isComputing || sourceData.length === 0}
        >
          开始计算
        </button>
        <button onClick={pause} disabled={!isComputing}>
          暂停
        </button>
        <button onClick={resume} disabled={isComputing}>
          恢复
        </button>
        <button onClick={handleCancel}>取消</button>
        <button onClick={() => reset(false)} disabled={isComputing}>
          重置 (保留缓存)
        </button>
        <button onClick={() => reset(true)} disabled={isComputing}>
          重置 (清理缓存)
        </button>
        <button
          onClick={exportResults}
          disabled={result.length === 0}
          className={styles.exportBtn}
        >
          📥 导出结果
        </button>
      </div>

      {/* 测试用例 */}
      <div className={styles.testCases}>
        <h3>快速测试</h3>
        <div className={styles.testButtons}>
          {testCases.map((testCase) => (
            <button
              key={testCase.name}
              onClick={() => runTestCase(testCase.size, testCase.batch)}
              disabled={isComputing}
            >
              {testCase.name}
            </button>
          ))}
        </div>
      </div>

      {/* 状态显示 */}
      <div className={styles.status}>
        <div className={styles.statusItem}>
          <span>状态:</span>
          <strong>{isComputing ? "计算中..." : "空闲"}</strong>
        </div>
        <div className={styles.statusItem}>
          <span>源数据:</span>
          <strong>{sourceData.length} 条</strong>
        </div>
        <div className={styles.statusItem}>
          <span>已处理:</span>
          <strong>{result.length} 条</strong>
        </div>
        <div className={styles.statusItem}>
          <span>进度:</span>
          <strong>{progress.toFixed(1)}%</strong>
        </div>
        {memoryUsage > 0 && (
          <div className={styles.statusItem}>
            <span>内存使用:</span>
            <strong>{memoryUsage.toFixed(2)} MB</strong>
          </div>
        )}
        <div className={styles.statusItem}>
          <span>缓存状态:</span>
          <strong>
            {cacheStatus?.enabled
              ? cacheStatus.hit
                ? "命中 ✅"
                : "未命中 ❌"
              : "禁用"}
          </strong>
        </div>
        {cacheStatus?.lastUpdated && (
          <div className={styles.statusItem}>
            <span>缓存时间:</span>
            <strong>{cacheStatus.lastUpdated.toLocaleTimeString()}</strong>
          </div>
        )}
        {cacheStatus?.enabled && (
          <div className={styles.statusItem}>
            <span>缓存条目:</span>
            <strong>{cacheStatus.size || 0}</strong>
          </div>
        )}
      </div>

      {/* 进度条 */}
      <div className={styles.progressBar}>
        <div
          className={styles.progressFill}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* 错误显示 */}
      {error && (
        <div className={styles.error}>
          <strong>错误:</strong> {error.message}
        </div>
      )}

      {/* 性能指标 - 常驻显示 */}
      <div className={styles.performance}>
        <h3>⚡ 性能指标</h3>
        <div className={styles.metricsGrid}>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>总耗时</span>
            <strong className={styles.metricValue}>
              {metrics ? (metrics.duration / 1000).toFixed(2) : "0.00"} 秒
            </strong>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>处理速度</span>
            <strong className={styles.metricValue}>
              {metrics ? metrics.itemsPerSecond.toFixed(0) : "0"} 条/秒
            </strong>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>平均每条</span>
            <strong className={styles.metricValue}>
              {metrics ? (1000 / metrics.itemsPerSecond).toFixed(2) : "0.00"} ms
            </strong>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>内存峰值</span>
            <strong className={styles.metricValue}>
              {metrics?.memoryUsed ? metrics.memoryUsed.toFixed(2) : "0.00"} MB
            </strong>
          </div>
          {cacheEnabled && cacheStatus?.hit && (
            <div className={styles.metricCard + " " + styles.cacheHit}>
              <span className={styles.metricLabel}>缓存加速</span>
              <strong className={styles.metricValue}>🚀 瞬时完成</strong>
            </div>
          )}
        </div>
      </div>

      {/* 缓存性能展示 */}
      {cacheEnabled && (
        <div className={styles.cachePerformance}>
          <h3>🎯 缓存性能展示</h3>
          <div className={styles.cacheDemo}>
            <div className={styles.cacheDemoSection}>
              <h4>缓存优势对比</h4>
              <div className={styles.comparisonGrid}>
                <div className={styles.comparisonItem}>
                  <span className={styles.comparisonLabel}>首次计算</span>
                  <div className={styles.comparisonBar}>
                    <div
                      className={styles.comparisonFill}
                      style={{ width: "100%" }}
                    >
                      {metrics
                        ? `${(metrics.duration / 1000).toFixed(2)}s`
                        : "计算中..."}
                    </div>
                  </div>
                </div>
                <div className={styles.comparisonItem}>
                  <span className={styles.comparisonLabel}>缓存命中</span>
                  <div className={styles.comparisonBar}>
                    <div
                      className={
                        styles.comparisonFill + " " + styles.cacheSpeed
                      }
                      style={{ width: "5%" }}
                    >
                      &lt;0.01s ⚡
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.cacheDemoSection}>
              <h4>智能缓存特性</h4>
              <div className={styles.featureList}>
                <div className={styles.featureItem}>
                  <span className={styles.featureIcon}>🔑</span>
                  <span className={styles.featureText}>
                    智能键生成 - 基于数据和函数特征
                  </span>
                </div>
                <div className={styles.featureItem}>
                  <span className={styles.featureIcon}>📦</span>
                  <span className={styles.featureText}>
                    增量存储 - 边计算边缓存
                  </span>
                </div>
                <div className={styles.featureItem}>
                  <span className={styles.featureIcon}>🧠</span>
                  <span className={styles.featureText}>
                    预加载 - 智能预测相关数据
                  </span>
                </div>
                <div className={styles.featureItem}>
                  <span className={styles.featureIcon}>🗜️</span>
                  <span className={styles.featureText}>
                    数据压缩 - 优化存储空间
                  </span>
                </div>
                <div className={styles.featureItem}>
                  <span className={styles.featureIcon}>🔄</span>
                  <span className={styles.featureText}>
                    自动清理 - 管理存储配额
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
