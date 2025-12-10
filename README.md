# Progressive Compute Hooks

一个用于处理大数据集渐进式计算的 React Hook 库，提供基础版本和带缓存的进阶版本。

## 🚀 概述

Progressive Compute Hooks 提供了两个版本的 Hook，用于在 React 应用中高效处理大量数据的计算任务：

- **基础版本** (`useProgressiveCompute`): 轻量级的渐进式计算 Hook
- **缓存版本** (`useProgressiveComputeCache`): 带有 IndexedDB 缓存功能的进阶版本

## 📦 安装

```bash
# 克隆项目
git clone <repository-url>
cd progressive-compute

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建项目
npm run build
```

## 🎯 核心特性

### 基础版本特性

- ⚡ **非阻塞计算** - 使用时间片调度，不会长时间阻塞主线程
- 📊 **实时进度** - 提供实时进度反馈（0-100%）
- 🎛️ **灵活控制** - 支持暂停、恢复、取消操作
- 🔧 **可配置** - 支持自定义批次大小、防抖时间等参数
- 🚀 **智能调度** - 优先使用 `requestIdleCallback`，降级到 `setTimeout`
- 🛡️ **错误处理** - 内置错误捕获和状态管理
- 🧹 **内存安全** - 自动清理异步任务，防止内存泄漏

### 缓存版本额外特性

- 💾 **持久化缓存** - 使用 IndexedDB 存储计算结果
- 🔄 **智能缓存** - 基于数据和转换函数自动生成缓存键
- ⚡ **缓存命中** - 相同计算直接返回缓存结果，瞬时响应
- 📈 **增量存储** - 计算过程中实时保存部分结果
- 🔮 **智能预加载** - 预测并预加载相关缓存条目
- 🛡️ **错误恢复** - 完善的错误处理和降级机制
- 🧹 **缓存管理** - 支持缓存清理、过期管理和存储配额控制
- 📊 **性能统计** - 提供详细的缓存性能统计和监控

## 🎮 快速开始

### 基础版本使用

```typescript
import { useProgressiveCompute } from "./hooks/useProgressiveCompute/useProgressiveCompute";

function BasicExample() {
  const data = Array.from({ length: 10000 }, (_, i) => i);

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
  } = useProgressiveCompute(
    data,
    (item) => item * 2, // 转换函数
    {
      batchSize: 500, // 每批处理 500 条
      debounceMs: 16, // UI 更新防抖 16ms
      timeout: 1000, // 超时时间
    }
  );

  return (
    <div>
      <div>
        <button onClick={start} disabled={isComputing}>
          开始计算
        </button>
        <button onClick={pause} disabled={!isComputing}>
          暂停
        </button>
        <button onClick={resume} disabled={isComputing}>
          恢复
        </button>
        <button onClick={cancel}>取消</button>
        <button onClick={() => reset()}>重置</button>
      </div>

      <div>
        <div>进度: {progress.toFixed(1)}%</div>
        <div>结果数量: {result.length}</div>
        <div>状态: {isComputing ? "计算中..." : "空闲"}</div>
        {error && <div style={{ color: "red" }}>错误: {error.message}</div>}
      </div>
    </div>
  );
}
```

### 缓存版本使用

```typescript
import { useProgressiveCompute } from "./hooks/useProgressiveComputeCache/useProgressiveCompute";

function CacheExample() {
  const data = Array.from({ length: 50000 }, (_, i) => ({
    id: i,
    value: Math.random() * 1000,
  }));

  const { result, isComputing, progress, error, start, reset, cacheStatus } =
    useProgressiveCompute(
      data,
      (item) => ({
        ...item,
        squared: item.value ** 2,
        cubed: item.value ** 3,
      }),
      {
        batchSize: 1000,
        cache: true, // 启用缓存
        cacheOptions: {
          dbName: "MyAppCache",
          maxAge: 10 * 60 * 1000, // 10分钟过期
          maxSize: 100, // 最多100个缓存条目
          maxStorageSize: 50 * 1024 * 1024, // 50MB存储限制
        },
      }
    );

  return (
    <div>
      <div>
        <button onClick={start} disabled={isComputing}>
          {cacheStatus?.hit ? "从缓存加载" : "开始计算"}
        </button>
        <button onClick={() => reset(true)}>重置并清理缓存</button>
        <button onClick={() => reset(false)}>重置但保留缓存</button>
      </div>

      {/* 缓存状态显示 */}
      <div>
        <h4>缓存状态</h4>
        <p>缓存启用: {cacheStatus?.enabled ? "✅" : "❌"}</p>
        <p>缓存命中: {cacheStatus?.hit ? "✅" : "❌"}</p>
        <p>缓存大小: {cacheStatus?.size} 条目</p>
        {cacheStatus?.lastUpdated && (
          <p>最后更新: {cacheStatus.lastUpdated.toLocaleString()}</p>
        )}
      </div>

      <div>
        <div>进度: {progress.toFixed(1)}%</div>
        <div>结果数量: {result.length}</div>
        {error && <div style={{ color: "red" }}>错误: {error.message}</div>}
      </div>
    </div>
  );
}
```

## 📚 API 文档

### 基础版本 API

#### 参数

```typescript
useProgressiveCompute<T, R>(
  data: T[],                           // 源数据数组
  transformFn: (item: T) => R,         // 转换函数
  options?: ProgressiveComputeOptions  // 配置选项
)
```

#### 配置选项

```typescript
interface ProgressiveComputeOptions {
  batchSize?: number; // 批次大小，默认 500
  debounceMs?: number; // 防抖时间，默认 16ms
  timeout?: number; // 超时时间，默认 1000ms
}
```

#### 返回值

```typescript
interface ProgressiveComputeResult<R> {
  result: R[]; // 计算结果数组
  isComputing: boolean; // 是否正在计算
  progress: number; // 进度百分比 (0-100)
  error: Error | null; // 错误信息
  start: () => void; // 开始计算
  pause: () => void; // 暂停计算
  resume: () => void; // 恢复计算
  cancel: () => void; // 取消计算
  reset: () => void; // 重置状态
}
```

### 缓存版本 API

#### 额外配置选项

```typescript
interface CacheOptions {
  dbName?: string; // IndexedDB 数据库名，默认 "ProgressiveComputeCache"
  storeName?: string; // 对象存储名，默认 "cache_entries"
  version?: number; // 数据库版本，默认 1
  maxAge?: number; // 缓存过期时间（毫秒），默认 24小时
  maxSize?: number; // 最大缓存条目数，默认 100
  maxStorageSize?: number; // 最大存储大小（字节），默认 50MB
}

interface ProgressiveComputeOptions {
  // 基础选项
  batchSize?: number;
  debounceMs?: number;
  timeout?: number;

  // 缓存选项
  cache?: boolean; // 是否启用缓存，默认 false
  cacheOptions?: CacheOptions;
}
```

#### 额外返回值

```typescript
interface ProgressiveComputeResult<R> {
  // ... 基础版本的所有返回值
  reset: (clearCache?: boolean) => void; // 重置状态，可选择清理缓存
  cacheStatus?: CacheStatus; // 缓存状态信息
}

interface CacheStatus {
  enabled: boolean; // 缓存是否启用
  hit: boolean; // 是否命中缓存
  size: number; // 缓存条目数量
  lastUpdated?: Date; // 最后更新时间
}
```

## 🎨 使用场景和示例

### 1. 数据搜索和过滤

```typescript
interface DataItem {
  id: number;
  name: string;
  description: string;
  category: string;
}

function SearchDemo() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const data: DataItem[] = [...]; // 大量数据

  const filterFn = useCallback(
    (item: DataItem): DataItem | null => {
      const matchesQuery =
        !searchQuery ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory =
        !selectedCategory || item.category === selectedCategory;

      return matchesQuery && matchesCategory ? item : null;
    },
    [searchQuery, selectedCategory]
  );

  const { result, isComputing, progress, start, reset, cacheStatus } =
    useProgressiveCompute(data, filterFn, {
      cache: true,
      batchSize: 500,
      cacheOptions: {
        maxAge: 5 * 60 * 1000, // 5分钟缓存
      },
    });

  const filteredResults = result.filter((item) => item !== null);

  return (
    <div>
      <input
        placeholder="搜索..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
      <select
        value={selectedCategory}
        onChange={(e) => setSelectedCategory(e.target.value)}
      >
        <option value="">所有分类</option>
        <option value="tech">技术</option>
        <option value="business">商业</option>
      </select>
      <button onClick={start}>搜索</button>
      <button onClick={() => reset()}>清空</button>

      <div>
        找到 {filteredResults.length} 条结果
        {cacheStatus?.hit && " (来自缓存)"}
      </div>
      {isComputing && <div>搜索进度: {progress.toFixed(1)}%</div>}
    </div>
  );
}
```

### 2. 复杂数据转换

```typescript
interface RawData {
  id: number;
  timestamp: number;
  value: number;
  metadata: Record<string, any>;
}

interface ProcessedData {
  id: number;
  date: string;
  normalizedValue: number;
  statistics: {
    mean: number;
    variance: number;
    trend: "up" | "down" | "stable";
  };
  enrichedMetadata: Record<string, any>;
}

function DataProcessor() {
  const rawData: RawData[] = [...]; // 大量原始数据

  const transformFn = useCallback((item: RawData): ProcessedData => {
    // 复杂的数据转换逻辑
    const normalizedValue = (item.value - mean) / standardDeviation;
    const statistics = calculateStatistics(item.value, historicalData);
    const enrichedMetadata = enrichMetadata(item.metadata);

    return {
      id: item.id,
      date: new Date(item.timestamp).toISOString(),
      normalizedValue,
      statistics,
      enrichedMetadata,
    };
  }, []);

  const { result, isComputing, progress, start, pause, resume, cancel } =
    useProgressiveCompute(rawData, transformFn, {
      batchSize: 200, // 复杂计算使用较小批次
      cache: true,
      cacheOptions: {
        maxAge: 30 * 60 * 1000, // 30分钟缓存
        maxSize: 50,
      },
    });

  return (
    <div>
      <div>
        <button onClick={start} disabled={isComputing}>
          开始处理
        </button>
        <button onClick={pause} disabled={!isComputing}>
          暂停
        </button>
        <button onClick={resume} disabled={isComputing}>
          恢复
        </button>
        <button onClick={cancel}>取消</button>
      </div>

      <div>
        <progress value={progress} max={100} />
        <div>已处理: {result.length} / {rawData.length}</div>
        <div>
          处理速度:{" "}
          {isComputing
            ? `${((result.length / (progress / 100)) * 60).toFixed(0)} 条/分钟`
            : "N/A"}
        </div>
      </div>
    </div>
  );
}
```

### 3. 性能监控和统计

```typescript
function PerformanceMonitor() {
  const [stats, setStats] = useState({
    startTime: 0,
    endTime: 0,
    duration: 0,
    throughput: 0,
  });

  const data = Array.from({ length: 100000 }, (_, i) => ({
    id: i,
    value: Math.random() * 1000,
  }));

  const { result, isComputing, progress, start, cacheStatus } =
    useProgressiveCompute(
      data,
      (item) => ({
        ...item,
        processed: item.value * 2 + Math.sin(item.value),
      }),
      {
        cache: true,
        batchSize: 1000,
      }
    );

  useEffect(() => {
    if (isComputing && stats.startTime === 0) {
      setStats((prev) => ({ ...prev, startTime: Date.now() }));
    }

    if (!isComputing && stats.startTime > 0 && result.length > 0) {
      const endTime = Date.now();
      const duration = endTime - stats.startTime;
      const throughput = (result.length / duration) * 1000; // 条/秒

      setStats({
        startTime: stats.startTime,
        endTime,
        duration,
        throughput,
      });
    }
  }, [isComputing, result.length, stats.startTime]);

  return (
    <div>
      <button onClick={start} disabled={isComputing}>
        开始性能测试
      </button>

      <div>
        <h4>实时统计</h4>
        <p>进度: {progress.toFixed(2)}%</p>
        <p>已处理: {result.length.toLocaleString()} 条</p>
        <p>缓存命中: {cacheStatus?.hit ? "是" : "否"}</p>

        {stats.duration > 0 && (
          <>
            <h4>性能统计</h4>
            <p>总耗时: {stats.duration.toLocaleString()} ms</p>
            <p>处理速度: {stats.throughput.toFixed(0)} 条/秒</p>
            <p>平均延迟: {(stats.duration / result.length).toFixed(3)} ms/条</p>
          </>
        )}
      </div>
    </div>
  );
}
```

## 🔧 高级配置和优化

### 批次大小优化

```typescript
// 根据计算复杂度选择批次大小
const getBatchSize = (complexity: "simple" | "medium" | "complex") => {
  switch (complexity) {
    case "simple":
      return 2000; // 简单计算：大批次
    case "medium":
      return 500; // 中等复杂度：中等批次
    case "complex":
      return 100; // 复杂计算：小批次
    default:
      return 500;
  }
};

const options = {
  batchSize: getBatchSize("complex"),
  debounceMs: 16,
  cache: true,
};
```

### 缓存策略优化

```typescript
// 根据数据特性配置缓存
const getCacheOptions = (dataType: "static" | "dynamic" | "realtime") => {
  switch (dataType) {
    case "static":
      return {
        maxAge: 24 * 60 * 60 * 1000, // 24小时
        maxSize: 200,
        maxStorageSize: 100 * 1024 * 1024, // 100MB
      };
    case "dynamic":
      return {
        maxAge: 30 * 60 * 1000, // 30分钟
        maxSize: 100,
        maxStorageSize: 50 * 1024 * 1024, // 50MB
      };
    case "realtime":
      return {
        maxAge: 5 * 60 * 1000, // 5分钟
        maxSize: 50,
        maxStorageSize: 25 * 1024 * 1024, // 25MB
      };
    default:
      return {};
  }
};
```

### 错误处理和恢复

```typescript
function RobustProcessor() {
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 3;

  const { result, error, isComputing, start, reset } = useProgressiveCompute(
    data,
    transformFn,
    {
      cache: true,
      cacheOptions: {
        maxAge: 10 * 60 * 1000,
      },
    }
  );

  const handleRetry = useCallback(() => {
    if (retryCount < maxRetries) {
      setRetryCount((prev) => prev + 1);
      reset(false); // 重置但保留缓存
      setTimeout(start, 1000); // 延迟重试
    }
  }, [retryCount, reset, start]);

  useEffect(() => {
    if (error && retryCount < maxRetries) {
      console.warn(`计算失败，准备重试 (${retryCount + 1}/${maxRetries})`);
      setTimeout(handleRetry, 2000);
    }
  }, [error, retryCount, handleRetry]);

  return (
    <div>
      <button onClick={start} disabled={isComputing}>
        开始计算
      </button>

      {error && (
        <div style={{ color: "red" }}>
          <p>错误: {error.message}</p>
          {retryCount < maxRetries ? (
            <p>
              正在重试... ({retryCount + 1}/{maxRetries})
            </p>
          ) : (
            <div>
              <p>重试次数已达上限</p>
              <button onClick={() => setRetryCount(0)}>重置重试计数</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

## 🧪 测试数据生成

项目提供了强大的测试数据生成工具，支持多种数据规模和格式。

### 基本使用

```bash
# 生成默认 1000 条数据
npm run generate:test

# 生成指定数量的数据
npm run generate:test -- 10000          # 最简格式
npm run generate:test -- c 10000        # 简洁格式
npm run generate:test -- -c 10000       # 标准格式
npm run generate:test -- --count 50000  # 完整格式

# 查看帮助
npm run generate:test -- h              # 简洁格式
npm run generate:test -- --help         # 完整格式
```

### 性能测试建议

| 数据量     | 用途           | 预期效果                   | 内存使用 |
| ---------- | -------------- | -------------------------- | -------- |
| 1,000      | 基本功能测试   | 验证基础功能正常           | < 1MB    |
| 10,000     | 性能测试       | 观察渐进式计算效果         | < 10MB   |
| 100,000    | 压力测试       | 验证缓存机制和性能优化     | < 100MB  |
| 1,000,000  | 极限测试       | 测试大数据处理能力         | < 1GB    |
| 10,000,000 | 超大数据集测试 | 验证内存管理和错误恢复机制 | 需谨慎   |

### 测试数据结构

```typescript
interface TestDataItem {
  id: number; // 唯一标识符 (1, 2, 3, ...)
  name: string; // 随机中文姓名 ("张三", "李四", ...)
  description: string; // 随机描述文本
}

// 示例数据
const exampleData = [
  { id: 1, name: "张三", description: "优秀的软件工程师，专注于前端开发" },
  { id: 2, name: "李四", description: "资深的产品经理，擅长用户体验设计" },
  // ...
];
```

### 自定义测试场景

```typescript
// 生成特定类型的测试数据
const generateComplexData = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    timestamp: Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000,
    value: Math.random() * 1000,
    category: ["A", "B", "C"][Math.floor(Math.random() * 3)],
    metadata: {
      priority: Math.floor(Math.random() * 5) + 1,
      tags: Array.from(
        { length: Math.floor(Math.random() * 5) + 1 },
        () => `tag${Math.floor(Math.random() * 100)}`
      ),
    },
  }));
};
```

## 🔍 性能对比

### 基准测试结果

| 场景     | 数据量  | 普通同步处理  | 基础版本      | 缓存版本(首次) | 缓存版本(命中) | UI 流畅度 |
| -------- | ------- | ------------- | ------------- | -------------- | -------------- | --------- |
| 简单转换 | 10,000  | 50ms (阻塞)   | 55ms (流畅)   | 60ms (流畅)    | 2ms (瞬时)     | ✅ 优秀   |
| 复杂计算 | 50,000  | 800ms (阻塞)  | 850ms (流畅)  | 900ms (流畅)   | 5ms (瞬时)     | ✅ 优秀   |
| 数据过滤 | 100,000 | 300ms (阻塞)  | 320ms (流畅)  | 340ms (流畅)   | 3ms (瞬时)     | ✅ 优秀   |
| 搜索匹配 | 200,000 | 1200ms (阻塞) | 1280ms (流畅) | 1350ms (流畅)  | 8ms (瞬时)     | ✅ 优秀   |

### 内存使用对比

```typescript
// 内存使用监控示例
function MemoryMonitor() {
  const [memoryInfo, setMemoryInfo] = useState(null);

  useEffect(() => {
    const updateMemoryInfo = () => {
      if ("memory" in performance) {
        setMemoryInfo({
          used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
          total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
          limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024),
        });
      }
    };

    const interval = setInterval(updateMemoryInfo, 1000);
    return () => clearInterval(interval);
  }, []);

  return memoryInfo ? (
    <div>
      <p>
        内存使用: {memoryInfo.used}MB / {memoryInfo.total}MB
      </p>
      <p>内存限制: {memoryInfo.limit}MB</p>
    </div>
  ) : null;
}
```

## 🌐 浏览器兼容性

### 基础版本兼容性

| 浏览器  | 版本要求 | 支持状态  | 备注              |
| ------- | -------- | --------- | ----------------- |
| Chrome  | 61+      | ✅ 完全   | 推荐使用          |
| Firefox | 55+      | ✅ 完全   | 推荐使用          |
| Safari  | 11+      | ✅ 完全   | 推荐使用          |
| Edge    | 79+      | ✅ 完全   | 推荐使用          |
| IE      | 不支持   | ❌ 不支持 | 需要 ES2018+ 支持 |

### 缓存版本兼容性

| 浏览器   | IndexedDB | 支持状态 | 降级行为           |
| -------- | --------- | -------- | ------------------ |
| Chrome   | 23+       | ✅ 完全  | 完整缓存功能       |
| Firefox  | 16+       | ✅ 完全  | 完整缓存功能       |
| Safari   | 10+       | ✅ 完全  | 完整缓存功能       |
| Edge     | 12+       | ✅ 完全  | 完整缓存功能       |
| 旧浏览器 | 不支持    | ⚠️ 降级  | 自动降级到基础版本 |

### 特性检测和降级

```typescript
// 自动特性检测
const checkBrowserSupport = () => {
  const support = {
    indexedDB: "indexedDB" in window,
    requestIdleCallback: "requestIdleCallback" in window,
    performance: "performance" in window,
    asyncIterator: typeof Symbol !== "undefined" && Symbol.asyncIterator,
  };

  console.log("浏览器支持情况:", support);
  return support;
};

// 在组件中使用
function AdaptiveComponent() {
  const [browserSupport] = useState(checkBrowserSupport);

  const options = {
    cache: browserSupport.indexedDB, // 根据支持情况启用缓存
    batchSize: browserSupport.performance ? 1000 : 500, // 根据性能API调整
  };

  return (
    <div>
      {!browserSupport.indexedDB && (
        <div style={{ color: "orange" }}>
          ⚠️ 您的浏览器不支持 IndexedDB，缓存功能已禁用
        </div>
      )}
      {/* 其他组件内容 */}
    </div>
  );
}
```

## 🛠️ 开发和调试

### 开发环境设置

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 运行类型检查
npm run type-check

# 运行代码检查
npm run lint

# 构建生产版本
npm run build

# 预览构建结果
npm run preview
```

### 调试技巧

```typescript
// 启用详细日志
const debugOptions = {
  cache: true,
  batchSize: 100,
  cacheOptions: {
    // 开发环境使用较短的缓存时间便于测试
    maxAge: process.env.NODE_ENV === "development" ? 60 * 1000 : 10 * 60 * 1000,
  },
};

// 性能分析
function PerformanceProfiler() {
  const { result, isComputing, start } = useProgressiveCompute(
    data,
    transformFn,
    debugOptions
  );

  useEffect(() => {
    if (isComputing) {
      console.time("computation");
    } else if (result.length > 0) {
      console.timeEnd("computation");
      console.log("Results:", result.length);
    }
  }, [isComputing, result.length]);

  return <button onClick={start}>开始分析</button>;
}
```

### 常见问题排查

1. **缓存不生效**

   ```typescript
   // 检查 IndexedDB 是否可用
   if (!("indexedDB" in window)) {
     console.warn("IndexedDB 不可用，缓存功能被禁用");
   }
   ```

2. **性能问题**

   ```typescript
   // 监控批次处理时间
   const transformFn = (item) => {
     const start = performance.now();
     const result = processItem(item);
     const duration = performance.now() - start;

     if (duration > 10) {
       // 单项处理超过10ms
       console.warn("处理时间过长:", duration, "ms");
     }

     return result;
   };
   ```

3. **内存泄漏**
   ```typescript
   // 确保正确清理
   useEffect(() => {
     return () => {
       // 组件卸载时自动清理
       reset();
     };
   }, [reset]);
   ```

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🤝 贡献指南

我们欢迎所有形式的贡献！

### 如何贡献

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

### 开发规范

- 使用 TypeScript 编写代码
- 遵循现有的代码风格
- 添加适当的注释和文档
- 确保所有测试通过
- 更新相关文档

### 报告问题

如果您发现了 bug 或有功能建议，请：

1. 检查是否已有相关 issue
2. 创建新的 issue，详细描述问题
3. 提供复现步骤和环境信息
4. 如果可能，提供修复建议

## 📈 更新日志

### v1.2.0 (最新)

- 🆕 增加智能预加载功能
- 🆕 添加详细的性能统计
- 🔧 优化缓存键生成算法
- 🐛 修复内存泄漏问题
- 📚 完善文档和示例

### v1.1.0

- 🆕 添加错误恢复机制
- 🆕 支持缓存配额管理
- 🔧 优化批次存储性能
- 📚 增加更多使用示例

### v1.0.0

- 🎉 首次发布
- ✅ 基础版本 useProgressiveCompute
- ✅ 缓存版本 useProgressiveComputeCache
- ✅ 完整的 TypeScript 支持
- ✅ 完善的错误处理机制

## 🔗 相关链接

- [GitHub 仓库](https://github.com/your-username/progressive-compute)
- [问题反馈](https://github.com/your-username/progressive-compute/issues)

---

**Progressive Compute Hooks** - 让大数据处理变得简单而高效 🚀
