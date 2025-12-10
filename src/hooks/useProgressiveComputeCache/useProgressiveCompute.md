# useProgressiveCompute

一个用于渐进式计算的 React Hook，通过时间片调度和智能任务分割，避免长时间阻塞主线程，保持 UI 流畅响应。

## 特性

- ✅ **非阻塞计算** - 使用时间片调度，不会长时间阻塞主线程
- ✅ **实时进度** - 提供实时进度反馈（0-100%）
- ✅ **暂停/恢复** - 支持暂停和恢复计算
- ✅ **取消操作** - 可随时取消正在进行的计算
- ✅ **重置状态** - 一键重置到初始状态
- ✅ **智能调度** - 优先使用 `requestIdleCallback`，降级到 `setTimeout`
- ✅ **防抖更新** - 可配置的 UI 更新防抖，减少渲染次数
- ✅ **错误处理** - 内置错误捕获和状态管理
- ✅ **内存安全** - 自动清理异步任务，防止内存泄漏
- 🆕 **智能缓存** - IndexedDB 持久化缓存，避免重复计算
- 🆕 **增量存储** - 边计算边缓存，支持部分结果恢复
- 🆕 **预加载优化** - 智能预测和预加载相关数据
- 🆕 **性能监控** - 详细的缓存和性能统计信息

## 安装

```bash
# 将 useProgressiveCompute.ts 复制到你的项目中
cp useProgressiveCompute.ts src/hooks/
```

## 基本用法

```tsx
import { useProgressiveCompute } from './hooks/useProgressiveCompute';

function MyComponent() {
  const data = [1, 2, 3, 4, 5, ...]; // 大量数据

  // 定义转换函数
  const transformFn = (item: number) => item * 2;

  // 使用 hook（带缓存）
  const { result, isComputing, progress, start, cacheStatus } = useProgressiveCompute(
    data,
    transformFn,
    {
      batchSize: 500,      // 每批处理 500 条
      debounceMs: 16,      // UI 更新防抖 16ms
      timeout: 1000,       // requestIdleCallback 超时时间
      cache: true,         // 启用缓存
      cacheOptions: {      // 缓存配置
        maxAge: 5 * 60 * 1000,    // 5分钟过期
        maxSize: 100,             // 最多100个缓存条目
        maxStorageSize: 50 * 1024 * 1024  // 50MB存储限制
      }
    }
  );

  return (
    <div>
      <button onClick={start} disabled={isComputing}>
        开始计算
      </button>
      <div>进度: {progress.toFixed(1)}%</div>
      <div>结果数量: {result.length}</div>
    </div>
  );
}
```

## API

### 参数

```typescript
useProgressiveCompute<T, R>(
  data: T[],                           // 源数据数组
  transformFn: (item: T) => R,         // 转换函数
  options?: ProgressiveComputeOptions  // 配置选项
)
```

#### Options

| 参数           | 类型           | 默认值  | 说明                           |
| -------------- | -------------- | ------- | ------------------------------ |
| `batchSize`    | `number`       | `500`   | 每批处理的数据量               |
| `debounceMs`   | `number`       | `16`    | UI 更新防抖延迟（毫秒）        |
| `timeout`      | `number`       | `1000`  | requestIdleCallback 的超时时间 |
| `cache`        | `boolean`      | `false` | 是否启用 IndexedDB 缓存        |
| `cacheOptions` | `CacheOptions` | `{}`    | 缓存配置选项                   |

#### CacheOptions

| 参数             | 类型     | 默认值                      | 说明                 |
| ---------------- | -------- | --------------------------- | -------------------- |
| `dbName`         | `string` | `"ProgressiveComputeCache"` | IndexedDB 数据库名   |
| `storeName`      | `string` | `"cache_entries"`           | 对象存储名           |
| `version`        | `number` | `1`                         | 数据库版本           |
| `maxAge`         | `number` | `24 * 60 * 60 * 1000`       | 缓存过期时间（毫秒） |
| `maxSize`        | `number` | `100`                       | 最大缓存条目数       |
| `maxStorageSize` | `number` | `50 * 1024 * 1024`          | 最大存储大小（字节） |

### 返回值

```typescript
{
  result: R[];                    // 计算结果数组
  isComputing: boolean;           // 是否正在计算
  progress: number;               // 进度百分比 (0-100)
  error: Error | null;            // 错误信息
  start: () => void;              // 开始计算
  pause: () => void;              // 暂停计算
  resume: () => void;             // 恢复计算
  cancel: () => void;             // 取消计算
  reset: (clearCache?: boolean) => void;  // 重置状态，可选择清理缓存
  cacheStatus?: CacheStatus;      // 缓存状态信息
}
```

#### CacheStatus

```typescript
{
  enabled: boolean;         // 缓存是否启用
  hit: boolean;            // 是否命中缓存
  size: number;            // 缓存条目数量
  lastUpdated?: Date;      // 最后更新时间
}
```

## 缓存功能

### 启用缓存

```tsx
const { result, isComputing, cacheStatus, start, reset } =
  useProgressiveCompute(data, transformFn, {
    cache: true,
    cacheOptions: {
      maxAge: 10 * 60 * 1000, // 10分钟过期
      maxSize: 50, // 最多50个缓存条目
    },
  });

// 检查缓存状态
if (cacheStatus?.hit) {
  console.log("缓存命中！瞬时返回结果");
} else {
  console.log("缓存未命中，开始计算...");
}

// 清理缓存
const handleClearCache = () => {
  reset(true); // 传入 true 清理缓存
};
```

### 缓存工作原理

1. **智能键生成** - 基于输入数据和转换函数生成唯一缓存键
2. **增量存储** - 计算过程中实时存储批次结果
3. **智能预加载** - 预测并预加载相关缓存条目
4. **自动清理** - 管理存储配额，清理过期和旧数据
5. **错误恢复** - 缓存失败时自动降级到无缓存模式

### 缓存性能优化

```tsx
// 大数据集优化
const optimizedOptions = {
  cache: true,
  cacheOptions: {
    maxAge: 30 * 60 * 1000, // 30分钟缓存
    maxSize: 200, // 更多缓存条目
    maxStorageSize: 100 * 1024 * 1024, // 100MB存储
  },
  batchSize: 1000, // 更大批次减少存储次数
  debounceMs: 50, // 更长防抖减少UI更新
};
```

## 高级用法

### 1. 搜索/过滤场景

```tsx
interface DataItem {
  id: number;
  name: string;
  description: string;
}

function SearchComponent() {
  const [searchQuery, setSearchQuery] = useState('');
  const data: DataItem[] = [...]; // 大量数据

  // 过滤函数，返回 null 表示不匹配
  const filterFn = (item: DataItem): DataItem | null => {
    if (item.name.includes(searchQuery) ||
        item.description.includes(searchQuery)) {
      return item;
    }
    return null;
  };

  const { result, isComputing, progress, start, reset } =
    useProgressiveCompute(data, filterFn);

  // 过滤掉 null 值
  const matchedResults = result.filter(item => item !== null);

  return (
    <div>
      <input
        value={searchQuery}
        onChange={(e) => {
          setSearchQuery(e.target.value);
          if (!e.target.value) {
            reset(); // 清空时重置
          }
        }}
      />
      <button onClick={start}>搜索</button>
      <div>找到 {matchedResults.length} 条结果</div>
      <div>进度: {progress}%</div>
    </div>
  );
}
```

### 2. 数据转换场景

```tsx
interface RawData {
  id: number;
  value: number;
}

interface ProcessedData {
  id: number;
  squared: number;
  cubed: number;
  isPrime: boolean;
}

function DataProcessor() {
  const rawData: RawData[] = [...];

  const transformFn = (item: RawData): ProcessedData => {
    return {
      id: item.id,
      squared: item.value ** 2,
      cubed: item.value ** 3,
      isPrime: isPrimeNumber(item.value)
    };
  };

  const { result, isComputing, progress, start, pause, resume, cancel } =
    useProgressiveCompute(rawData, transformFn, {
      batchSize: 1000,
      debounceMs: 32
    });

  return (
    <div>
      <button onClick={start} disabled={isComputing}>开始</button>
      <button onClick={pause} disabled={!isComputing}>暂停</button>
      <button onClick={resume} disabled={isComputing}>恢复</button>
      <button onClick={cancel}>取消</button>

      <progress value={progress} max={100} />
      <div>已处理: {result.length} / {rawData.length}</div>
    </div>
  );
}
```

### 3. 带错误处理

```tsx
function SafeProcessor() {
  const data = [...];

  const transformFn = (item: any) => {
    // 可能抛出错误的转换逻辑
    if (!item.valid) {
      throw new Error('Invalid data');
    }
    return processItem(item);
  };

  const { result, error, isComputing, start, reset } =
    useProgressiveCompute(data, transformFn);

  return (
    <div>
      <button onClick={start}>开始</button>

      {error && (
        <div style={{ color: 'red' }}>
          错误: {error.message}
          <button onClick={reset}>重试</button>
        </div>
      )}

      {isComputing && <div>处理中...</div>}
      {!isComputing && !error && <div>完成！</div>}
    </div>
  );
}
```

### 4. 性能监控

```tsx
function PerformanceMonitor() {
  const [startTime, setStartTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const data = [...];

  const { result, isComputing, progress, start } =
    useProgressiveCompute(data, transformFn);

  useEffect(() => {
    if (isComputing && startTime === 0) {
      setStartTime(Date.now());
    }

    if (!isComputing && startTime > 0) {
      setDuration(Date.now() - startTime);
      setStartTime(0);
    }
  }, [isComputing]);

  return (
    <div>
      <button onClick={start}>开始</button>
      <div>进度: {progress.toFixed(1)}%</div>
      <div>耗时: {duration}ms</div>
      <div>速度: {(result.length / duration * 1000).toFixed(0)} 条/秒</div>
    </div>
  );
}
```

## 工作原理

### 时间片调度

Hook 使用生成器函数将大任务分割成小批次，每批处理完成后：

1. 检查是否超过 16ms（一帧的时间）
2. 如果超过，让出主线程，等待下一帧
3. 使用 `requestIdleCallback` 或 `setTimeout` 调度下一批

```
数据: [1, 2, 3, ..., 10000]
      ↓
批次1: [1...500]   → 处理 → 更新 UI → 让出线程
批次2: [501...1000] → 处理 → 更新 UI → 让出线程
...
批次20: [9501...10000] → 处理 → 完成
```

### 防抖更新

为了减少渲染次数，UI 更新使用防抖策略：

- `debounceMs <= 16`: 使用 `requestAnimationFrame`
- `debounceMs > 16`: 使用 `setTimeout`

### 智能调度

优先使用 `requestIdleCallback`，在浏览器空闲时执行：

```typescript
if (window.requestIdleCallback) {
  requestIdleCallback(callback, { timeout: 1000 });
} else {
  setTimeout(callback, 0);
}
```

## 性能对比

### 普通同步处理 vs 渐进式处理

| 场景 | 数据量  | 普通处理    | 渐进式处理  | UI 流畅度 |
| ---- | ------- | ----------- | ----------- | --------- |
| 搜索 | 100,000 | 阻塞 500ms  | 分批 520ms  | ✅ 流畅   |
| 转换 | 50,000  | 阻塞 300ms  | 分批 310ms  | ✅ 流畅   |
| 过滤 | 200,000 | 阻塞 1000ms | 分批 1050ms | ✅ 流畅   |

**关键优势**: 虽然总耗时略有增加（~5%），但 UI 始终保持响应，动画不卡顿。

## 最佳实践

### 1. 选择合适的批次大小

```typescript
// 简单计算：较大批次
{
  batchSize: 1000;
}

// 复杂计算：较小批次
{
  batchSize: 100;
}

// 搜索/过滤：中等批次
{
  batchSize: 500;
}
```

### 2. 防抖配置

```typescript
// 高频更新（如进度条）
{
  debounceMs: 16;
} // 使用 RAF

// 低频更新（如列表渲染）
{
  debounceMs: 100;
} // 减少渲染次数
```

### 3. 清理和重置

```typescript
// 组件卸载时自动清理（内置）
// 手动重置
const handleClear = () => {
  reset(); // 清空结果、进度、错误
};
```

### 4. 避免频繁重新创建

```typescript
// ❌ 不好：每次渲染都创建新函数
const transformFn = (item) => item * 2;

// ✅ 好：使用 useCallback
const transformFn = useCallback((item) => item * 2, []);
```

## 注意事项

1. **数据依赖**: `data` 和 `transformFn` 变化时，需要重新调用 `start()`
2. **内存占用**: `result` 数组会累积所有结果，大数据量时注意内存
3. **浏览器兼容**: `requestIdleCallback` 在某些浏览器不支持，会降级到 `setTimeout`
4. **并发控制**: 同时只能有一个计算任务，新任务会取消旧任务

## 常见问题

### Q: 为什么总耗时比同步处理略长？

A: 因为需要时间片调度和任务切换的开销，但换来的是 UI 流畅度，这是值得的权衡。

### Q: 如何处理大量结果的渲染？

A: 建议配合虚拟滚动（如 `react-window`）或分页显示，避免一次性渲染大量 DOM。

### Q: 可以在 Node.js 中使用吗？

A: 不建议。这个 Hook 依赖浏览器 API（`requestAnimationFrame`、`requestIdleCallback`），主要用于浏览器环境。

### Q: 缓存什么时候会失效？

A: 缓存在以下情况会失效：

- 超过 `maxAge` 设置的过期时间
- 输入数据或转换函数发生变化
- 手动调用 `reset(true)` 清理缓存
- 存储配额不足时自动清理旧缓存

### Q: 缓存会占用多少存储空间？

A: 缓存使用 IndexedDB 存储，默认限制为 50MB。可以通过 `maxStorageSize` 配置。浏览器通常为每个域名提供几百 MB 到几 GB 的存储配额。

### Q: 如何测试？

A: 可以 mock `requestIdleCallback` 和 `requestAnimationFrame`，或使用 `@testing-library/react` 的异步工具。对于缓存功能，可以使用 `fake-indexeddb` 模拟 IndexedDB。

## 示例项目

查看完整示例：

- `src/components/SearchDemo` - 搜索场景
- `src/components/ProgressiveComputeDemo` - 数据转换场景

## License

MIT
