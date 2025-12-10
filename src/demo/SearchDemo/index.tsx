import { useState, useMemo, useRef, useEffect } from "react";
import { useProgressiveCompute } from "../../hooks/useProgressiveComputeCache/useProgressiveCompute";
import styles from "./styles.module.scss";
import type { TestDataItem } from "../../test/testData";
import { testData } from "../../test/testData";

export default function SearchDemo() {
  const [searchQuery, setSearchQuery] = useState("");
  const [batchSize, setBatchSize] = useState(500);
  const [debounceMs, setDebounceMs] = useState(16);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [normalElapsedTime, setNormalElapsedTime] = useState(0);
  const [normalResults, setNormalResults] = useState<TestDataItem[]>([]);
  const [isNormalSearching, setIsNormalSearching] = useState(false);
  const startTimeRef = useRef<number>(0);

  // 搜索过滤函数
  const filterFn = (item: TestDataItem): TestDataItem | null => {
    const query = searchQuery.toLowerCase().trim();

    // 搜索范围：name, description
    const matchName = item.name.toLowerCase().includes(query);
    const matchDescription = item.description.toLowerCase().includes(query);

    if (matchName || matchDescription) {
      return item;
    }

    return null;
  };

  // 缓存配置状态
  const [cacheEnabled, setCacheEnabled] = useState(true);
  const [cacheStats, setCacheStats] = useState<{
    hits: number;
    misses: number;
    totalQueries: number;
  }>({ hits: 0, misses: 0, totalQueries: 0 });

  // 使用 useProgressiveCompute 进行渐进式搜索（带缓存）
  const {
    result,
    isComputing,
    progress,
    error,
    start,
    cancel,
    reset,
    cacheStatus,
  } = useProgressiveCompute<TestDataItem, TestDataItem | null>(
    testData,
    filterFn,
    {
      batchSize,
      debounceMs,
      timeout: 1000,
      cache: cacheEnabled,
      cacheOptions: {
        maxAge: 10 * 60 * 1000, // 10 minutes cache
        maxSize: 50, // Max 50 search results cached
        maxStorageSize: 10 * 1024 * 1024, // 10MB max storage
      },
    }
  );

  // 过滤掉 null 值，得到匹配的结果，并去重
  const matchedResults = useMemo(() => {
    const filtered = result.filter(
      (item): item is TestDataItem => item !== null
    );

    // 使用 Map 去重，保留第一次出现的项
    const uniqueMap = new Map<number, TestDataItem>();
    filtered.forEach((item) => {
      if (!uniqueMap.has(item.id)) {
        uniqueMap.set(item.id, item);
      }
    });

    return Array.from(uniqueMap.values());
  }, [result]);

  // 计算耗时 - 只在搜索完成时更新
  useEffect(() => {
    if (!isComputing && startTimeRef.current > 0) {
      const duration = Date.now() - startTimeRef.current;
      setElapsedTime(duration);
      startTimeRef.current = 0;

      // 更新缓存统计
      if (cacheStatus?.hit) {
        setCacheStats((prev) => ({ ...prev, hits: prev.hits + 1 }));
      } else {
        setCacheStats((prev) => ({ ...prev, misses: prev.misses + 1 }));
      }
    }
  }, [isComputing, cacheStatus]);

  // 处理搜索
  const handleSearch = () => {
    if (!searchQuery.trim()) {
      return; // 没有搜索关键词时不执行搜索
    }
    cancel(); // 先取消之前的搜索
    setElapsedTime(0);
    startTimeRef.current = 0;

    // 更新缓存统计
    setCacheStats((prev) => ({ ...prev, totalQueries: prev.totalQueries + 1 }));

    setTimeout(() => {
      startTimeRef.current = Date.now(); // 在启动时记录开始时间
      start();
    }, 50);
  };

  // 普通搜索（同步阻塞式）
  const handleNormalSearch = () => {
    if (!searchQuery.trim()) {
      return;
    }

    setIsNormalSearching(true);
    const startTime = Date.now();

    // 同步执行搜索，会阻塞主线程
    const query = searchQuery.toLowerCase().trim();
    const results: TestDataItem[] = [];

    for (let i = 0; i < testData.length; i++) {
      const item = testData[i];
      const matchName = item.name.toLowerCase().includes(query);
      const matchDescription = item.description.toLowerCase().includes(query);

      if (matchName || matchDescription) {
        results.push(item);
      }
    }

    const duration = Date.now() - startTime;
    setNormalResults(results);
    setNormalElapsedTime(duration);
    setIsNormalSearching(false);
  };

  // 清空搜索
  const handleClear = () => {
    setSearchQuery("");
    setElapsedTime(0);
    setNormalElapsedTime(0);
    setNormalResults([]);
    startTimeRef.current = 0;
    reset(); // 使用 reset 清空渐进式搜索数据
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.container}>
        <h2>渐进式搜索 Demo</h2>

        {/* 搜索配置 */}
        <div className={styles.searchConfig}>
          <div className={styles.searchBox}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                const value = e.target.value;
                setSearchQuery(value);
                // 输入框为空时清空所有结果
                if (!value.trim()) {
                  setElapsedTime(0);
                  setNormalElapsedTime(0);
                  setNormalResults([]);
                  startTimeRef.current = 0;
                  reset(); // 使用 reset 清空渐进式搜索数据
                }
              }}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="输入关键词搜索（支持姓名、描述）"
              className={styles.searchInput}
            />
            <button
              onClick={handleSearch}
              disabled={isComputing || isNormalSearching}
              className={styles.progressiveBtn}
            >
              渐进式搜索
            </button>
            <button
              onClick={handleNormalSearch}
              disabled={isComputing || isNormalSearching}
              className={styles.normalBtn}
            >
              普通搜索
            </button>
            <button onClick={handleClear} className={styles.clearBtn}>
              清空
            </button>
          </div>

          <div className={styles.configRow}>
            <div className={styles.configItem}>
              <label>
                批次大小:
                <input
                  type="number"
                  value={batchSize}
                  onChange={(e) => setBatchSize(Number(e.target.value))}
                  min={100}
                  max={5000}
                  step={100}
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
                启用智能缓存
              </label>
            </div>
          </div>
        </div>

        {/* 渐进式搜索统计 */}
        <div className={styles.statsSection}>
          <h3>渐进式搜索</h3>
          {/* 渐进式搜索进度条 */}
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${progress}%` }}
            >
              {progress > 5 && `${progress.toFixed(0)}%`}
            </div>
          </div>
          <div className={styles.stats}>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>状态</span>
              <strong className={styles.statValue}>
                {isComputing ? "🔄 搜索中" : "✅ 完成"}
              </strong>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>匹配结果</span>
              <strong className={styles.statValue + " " + styles.highlight}>
                {matchedResults.length}
              </strong>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>已处理</span>
              <strong className={styles.statValue}>
                {Math.round((progress / 100) * testData.length)}
              </strong>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>总数据量</span>
              <strong className={styles.statValue}>{testData.length}</strong>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>进度</span>
              <strong className={styles.statValue}>
                {progress.toFixed(1)}%
              </strong>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>耗时</span>
              <strong className={styles.statValue}>
                {elapsedTime > 0 ? `${elapsedTime} ms` : "-"}
              </strong>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>缓存状态</span>
              <strong className={styles.statValue}>
                {cacheEnabled
                  ? cacheStatus?.hit
                    ? "🎯 命中"
                    : "❌ 未命中"
                  : "🚫 禁用"}
              </strong>
            </div>
            {cacheStatus?.lastUpdated && (
              <div className={styles.statItem}>
                <span className={styles.statLabel}>缓存时间</span>
                <strong className={styles.statValue}>
                  {cacheStatus.lastUpdated.toLocaleTimeString()}
                </strong>
              </div>
            )}
          </div>
        </div>

        {/* 普通搜索统计 */}
        <div className={styles.statsSection}>
          <h3>普通搜索（对比）</h3>
          {/* 普通搜索进度条 */}
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{
                width: `${normalResults.length > 0 ? 100 : 0}%`,
              }}
            >
              {normalResults.length > 0 && "100%"}
            </div>
          </div>
          <div className={styles.stats}>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>状态</span>
              <strong className={styles.statValue}>
                {isNormalSearching ? "🔄 搜索中" : "✅ 完成"}
              </strong>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>匹配结果</span>
              <strong className={styles.statValue + " " + styles.highlight}>
                {normalResults.length}
              </strong>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>已处理</span>
              <strong className={styles.statValue}>
                {normalResults.length > 0 ? testData.length : 0}
              </strong>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>总数据量</span>
              <strong className={styles.statValue}>{testData.length}</strong>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>进度</span>
              <strong className={styles.statValue}>
                {normalResults.length > 0 ? "100.0%" : "0.0%"}
              </strong>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>耗时</span>
              <strong className={styles.statValue}>
                {normalElapsedTime > 0 ? `${normalElapsedTime} ms` : "-"}
              </strong>
            </div>
          </div>
        </div>

        {/* 错误显示 */}
        {error && (
          <div className={styles.error}>
            <strong>错误:</strong> {error.message}
          </div>
        )}

        {/* 缓存性能统计 */}
        {cacheEnabled && (
          <div className={styles.cacheStats}>
            <h3>🚀 缓存性能统计</h3>
            <div className={styles.stats}>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>总查询</span>
                <strong className={styles.statValue}>
                  {cacheStats.totalQueries}
                </strong>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>缓存命中</span>
                <strong className={styles.statValue + " " + styles.highlight}>
                  {cacheStats.hits}
                </strong>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>缓存未命中</span>
                <strong className={styles.statValue}>
                  {cacheStats.misses}
                </strong>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>命中率</span>
                <strong className={styles.statValue}>
                  {cacheStats.totalQueries > 0
                    ? `${(
                        (cacheStats.hits / cacheStats.totalQueries) *
                        100
                      ).toFixed(1)}%`
                    : "0%"}
                </strong>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>缓存大小</span>
                <strong className={styles.statValue}>
                  {cacheStatus?.size || 0}
                </strong>
              </div>
            </div>
            <div className={styles.cacheActions}>
              <button
                onClick={() => reset(true)}
                className={styles.clearCacheBtn}
                disabled={isComputing}
              >
                🗑️ 清理缓存
              </button>
              <button
                onClick={() =>
                  setCacheStats({ hits: 0, misses: 0, totalQueries: 0 })
                }
                className={styles.resetStatsBtn}
              >
                📊 重置统计
              </button>
            </div>
          </div>
        )}

        {/* 搜索提示 */}
        <div className={styles.hint}>
          <p>💡 搜索提示：</p>
          <div className={styles.hintSection}>
            <span className={styles.hintLabel}>姓名搜索：</span>
            <div className={styles.exampleButtons}>
              <button
                className={styles.exampleBtn}
                onClick={() => setSearchQuery("张")}
              >
                张
              </button>
              <button
                className={styles.exampleBtn}
                onClick={() => setSearchQuery("王")}
              >
                王
              </button>
              <button
                className={styles.exampleBtn}
                onClick={() => setSearchQuery("李")}
              >
                李
              </button>
            </div>
          </div>
          <div className={styles.hintSection}>
            <span className={styles.hintLabel}>原文搜索：</span>
            <div className={styles.exampleButtons}>
              <button
                className={styles.exampleBtn}
                onClick={() => setSearchQuery("优秀")}
              >
                优秀
              </button>
              <button
                className={styles.exampleBtn}
                onClick={() => setSearchQuery("系统")}
              >
                系统
              </button>
              <button
                className={styles.exampleBtn}
                onClick={() => setSearchQuery("开发")}
              >
                开发
              </button>
            </div>
          </div>

          <p className={styles.hintTip}>
            💡 按 Enter 键快速搜索，启用缓存后重复搜索会更快！
          </p>
        </div>
      </div>

      {/* 右侧动画区域 */}
      <div className={styles.animationPanel}>
        <h3>动画性能测试</h3>
        <p>观察搜索时动画是否流畅</p>
        <div className={styles.animationContainer}>
          {/* 旋转的方块 */}
          <div className={styles.rotatingBox}></div>

          {/* 多个弹跳的球 */}
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className={styles.bouncingBall}
              style={{
                animationDelay: `${i * 0.1}s`,
                left: `${(i % 5) * 20 + 10}%`,
              }}
            ></div>
          ))}

          {/* 波浪效果 */}
          <div className={styles.waveContainer}>
            {[...Array(10)].map((_, i) => (
              <div
                key={i}
                className={styles.wave}
                style={{ animationDelay: `${i * 0.1}s` }}
              ></div>
            ))}
          </div>

          {/* 脉冲圆环 */}
          <div className={styles.pulseRing}></div>
        </div>
      </div>
    </div>
  );
}
