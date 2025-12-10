// 重新导出所有缓存相关类型
export * from "./cache";

// 原始渐进式计算类型（如果存在其他类型）
export type YieldValue<R> = {
  type?: "pause";
  partial?: R[];
  progress?: number;
};

export type ComputeGenerator<R> = Generator<YieldValue<R>, R[], void>;
