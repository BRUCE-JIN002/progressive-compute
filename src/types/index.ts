// Re-export all cache-related types
export * from "./cache";

// Original progressive compute types (if any additional ones exist)
export type YieldValue<R> = {
  type?: "pause";
  partial?: R[];
  progress?: number;
};

export type ComputeGenerator<R> = Generator<YieldValue<R>, R[], void>;
