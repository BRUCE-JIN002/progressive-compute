// 基础版本 - 轻量级渐进式计算 Hook
export { useProgressiveCompute as useProgressiveComputeBasic } from "./useProgressiveCompute/useProgressiveCompute";

// 缓存版本 - 带 IndexedDB 缓存的进阶版本
export { useProgressiveCompute as useProgressiveComputeCache } from "./useProgressiveComputeCache/useProgressiveCompute";

// 默认导出缓存版本（推荐使用）
export { useProgressiveCompute } from "./useProgressiveComputeCache/useProgressiveCompute";

// 类型导出
export type {
  ProgressiveComputeOptions,
  ProgressiveComputeResult,
  CacheStatus,
} from "./useProgressiveComputeCache/types";
