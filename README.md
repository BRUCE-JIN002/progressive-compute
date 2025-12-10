# Progressive Compute Hooks

一个用于处理大数据集渐进式计算的 React Hook 库，提供基础版本和带缓存的进阶版本。

## 概述

Progressive Compute Hooks 提供了两个版本的 Hook，用于在 React 应用中高效处理大量数据的计算任务：

- **基础版本** (`useProgressiveCompute`): 轻量级的渐进式计算 Hook
- **缓存版本** (`useProgressiveComputeCache`): 带有 IndexedDB 缓存功能的进阶版本

## 基础版本 - useProgressiveCompute

### 特性

- ⚡ **渐进式处理**: 将大数据集分批处理，避免阻塞 UI
- 🎛️ **灵活控制**: 支持暂停、恢复、取消操作
- 📊 **实时进度**: 提供详细的进度信息和状态
- 🔧 **可配置**: 支持自定义批次大小、防抖时间等参数
- 🚀 **性能优化**: 使用时间片和智能调度避免卡顿

### 基本用法

```typescript
import { useProgressiveCompute } from "./hooks/useProgressiveCompute/useProgressiveCompute";

function MyComponent() {
  const data = [
    /* 大量数据 */
  ];

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
    (item) => processItem(item), // 转换函数
    {
      batchSize: 100, // 每批处理的数据量
      debounceMs: 16, // 防抖时间
      timeout: 1000, // 超时时间
    }
  );

  return (
    <div>
      <button onClick={start} disabled={isComputing}>
        开始计算
      </button>
      <button onClick={pause} disabled={!isComputing}>
        暂停
      </button>
      <button onClick={resume}>恢复</button>
      <button onClick={cancel}>取消</button>
      <button onClick={() => reset()}>重置</button>

      <div>进度: {progress}%</div>
      <div>结果数量: {result.length}</div>
      {error && <div>错误: {error.message}</div>}
    </div>
  );
}
```

### 配置选项

```typescript
interface ProgressiveComputeOptions {
  batchSize?: number; // 批次大小，默认 500
  debounceMs?: number; // 防抖时间，默认 16ms
  timeout?: number; // 超时时间，默认 1000ms
}
```

### 返回值

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

## 进阶版本 - useProgressiveComputeCache

### 额外特性

在基础版本的所有特性基础上，缓存版本还提供：

- 💾 **持久化缓存**: 使用 IndexedDB 存储计算结果
- 🔄 **智能缓存**: 基于数据和转换函数自动生成缓存键
- ⚡ **缓存命中**: 相同计算直接返回缓存结果
- 📈 **增量存储**: 计算过程中实时保存部分结果
- 🛡️ **错误恢复**: 完善的错误处理和降级机制
- 🧹 **缓存管理**: 支持缓存清理和过期管理
- 📊 **缓存统计**: 提供详细的缓存性能统计

### 缓存版本用法

```typescript
import { useProgressiveCompute } from "./hooks/useProgressiveComputeCache/useProgressiveCompute";

function MyComponent() {
  const data = [
    /* 大量数据 */
  ];

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
    cacheStatus, // 缓存状态信息
  } = useProgressiveCompute(data, (item) => processItem(item), {
    batchSize: 100,
    debounceMs: 16,
    timeout: 1000,
    cache: true, // 启用缓存
    cacheOptions: {
      // 缓存配置
      dbName: "MyAppCache",
      storeName: "computeResults",
      version: 1,
      maxAge: 24 * 60 * 60 * 1000, // 24小时
      maxSize: 100, // 最大缓存条目数
      maxStorageSize: 50 * 1024 * 1024, // 50MB
    },
  });

  return (
    <div>
      {/* 基础控制按钮 */}
      <button onClick={start} disabled={isComputing}>
        开始计算
      </button>
      <button onClick={() => reset(true)}>重置并清理缓存</button>
      <button onClick={() => reset(false)}>重置但保留缓存</button>

      {/* 缓存状态显示 */}
      <div>
        <h3>缓存状态</h3>
        <p>缓存启用: {cacheStatus?.enabled ? "是" : "否"}</p>
        <p>缓存命中: {cacheStatus?.hit ? "是" : "否"}</p>
        <p>缓存大小: {cacheStatus?.size}</p>
        {cacheStatus?.lastUpdated && (
          <p>最后更新: {cacheStatus.lastUpdated.toLocaleString()}</p>
        )}
      </div>

      <div>进度: {progress}%</div>
      <div>结果数量: {result.length}</div>
      {error && <div>错误: {error.message}</div>}
    </div>
  );
}
```

### 缓存配置选项

```typescript
interface CacheOptions {
  dbName?: string; // IndexedDB 数据库名
  storeName?: string; // 对象存储名
  version?: number; // 数据库版本
  maxAge?: number; // 缓存过期时间（毫秒）
  maxSize?: number; // 最大缓存条目数
  maxStorageSize?: number; // 最大存储大小（字节）
}

interface ProgressiveComputeOptions {
  // 基础选项
  batchSize?: number;
  debounceMs?: number;
  timeout?: number;

  // 缓存选项
  cache?: boolean; // 是否启用缓存
  cacheOptions?: CacheOptions;
}
```

### 缓存状态

```typescript
interface CacheStatus {
  enabled: boolean; // 缓存是否启用
  hit: boolean; // 是否命中缓存
  size: number; // 缓存条目数量
  lastUpdated?: Date; // 最后更新时间
}
```

## 使用场景

### 基础版本适用于：

- 简单的数据转换和过滤
- 不需要持久化的一次性计算
- 轻量级应用
- 快速原型开发

### 缓存版本适用于：

- 复杂的数据处理和分析
- 需要重复计算相同数据的场景
- 大型数据集的搜索和过滤
- 需要离线支持的应用
- 性能要求较高的生产环境

## 性能优化建议

### 基础版本优化：

1. **合理设置批次大小**: 根据数据复杂度调整 `batchSize`
2. **优化转换函数**: 避免在转换函数中进行复杂计算
3. **使用防抖**: 适当设置 `debounceMs` 避免频繁更新

### 缓存版本优化：

1. **缓存策略**: 根据数据变化频率设置合适的 `maxAge`
2. **存储管理**: 定期清理过期缓存，控制存储空间
3. **键值设计**: 确保缓存键能准确反映数据和函数的变化
4. **错误处理**: 利用内置的错误恢复机制处理异常情况

## 错误处理

两个版本都提供了完善的错误处理机制：

```typescript
const { error } = useProgressiveCompute(data, transformFn, options);

if (error) {
  console.error("计算过程中发生错误:", error.message);
  // 处理错误逻辑
}
```

缓存版本还提供了额外的错误恢复功能：

- 自动降级到非缓存模式
- 损坏缓存的自动清理
- 存储配额超限的处理

## 浏览器兼容性

### 基础版本：

- 支持所有现代浏览器
- 需要 ES2018+ 支持

### 缓存版本：

- 需要 IndexedDB 支持
- 在不支持 IndexedDB 的环境中自动降级到基础版本
- 推荐在现代浏览器中使用

## 测试数据生成

项目提供了一个便捷的测试数据生成工具，用于生成大量模拟数据来测试渐进式计算的性能。

### 生成测试数据

运行以下命令生成测试数据：

```bash
# 生成默认 1000 条数据
npm run generate:test

# 生成指定数量的数据 (多种格式)
npm run generate:test -- c 10000        # 简洁格式
npm run generate:test -- -c 10000       # 标准格式
npm run generate:test -- --count 50000  # 完整格式
npm run generate:test -- 25000          # 最简格式

# 查看帮助信息
npm run generate:test -- h              # 简洁格式
npm run generate:test -- -h             # 标准格式
```

### 命令行参数

| 参数       | 格式                 | 说明               | 默认值 |
| ---------- | -------------------- | ------------------ | ------ |
| `count`    | `c`, `-c`, `--count` | 指定生成的数据条数 | 1000   |
| `help`     | `h`, `-h`, `--help`  | 显示帮助信息       | -      |
| `<number>` | 直接数字             | 直接指定数量       | -      |

### 快速生成不同规模的测试数据

```bash
# 基本功能测试 (推荐简洁格式)
npm run generate:test -- c 1000
npm run generate:test -- 1000           # 最简

# 性能测试
npm run generate:test -- c 10000
npm run generate:test -- 10000          # 最简

# 压力测试
npm run generate:test -- c 100000
npm run generate:test -- 100000         # 最简

# 极限测试（注意内存使用）
npm run generate:test -- c 1000000
npm run generate:test -- 1000000        # 最简
```

### 测试数据结构

生成的测试数据包含以下字段：

```typescript
interface TestDataItem {
  id: number; // 唯一标识符
  name: string; // 随机生成的中文姓名
  description: string; // 随机组合的描述文本
}
```

### 大数据测试建议

- **1,000 条数据**: 适合基本功能测试
- **10,000 条数据**: 适合性能测试，观察渐进式计算效果
- **100,000 条数据**: 适合压力测试，验证缓存机制效果
- **1,000,000 条数据**: 适合极限测试，需要注意浏览器内存限制

生成的测试数据会自动保存到 `src/test/testData.ts` 文件中，并可直接在 Demo 中使用。

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

## 更新日志

### v1.0.0

- 发布基础版本 useProgressiveCompute
- 发布缓存版本 useProgressiveComputeCache
- 完整的 TypeScript 支持
- 完善的错误处理和恢复机制
