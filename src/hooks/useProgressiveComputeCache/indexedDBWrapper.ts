import type { IndexedDBWrapper } from "./types/cache";
import { CacheError, CacheErrorType } from "./types/cache";
import { CACHE_TIMEOUTS } from "./constants/cache";

/**
 * IndexedDB 包装器类，为数据库操作提供简化接口
 * 包含错误处理和可用性检测
 */
export class IndexedDBWrapperImpl implements IndexedDBWrapper {
  private db: IDBDatabase | null = null;
  private isAvailable: boolean | null = null;

  /**
   * 检查当前环境中 IndexedDB 是否可用
   */
  public static isIndexedDBAvailable(): boolean {
    try {
      // 检查 IndexedDB 是否存在
      if (typeof indexedDB === "undefined" || indexedDB === null) {
        console.warn(
          "IndexedDB not available, falling back to non-cached mode"
        );
        return false;
      }

      // 在使用 fake-indexeddb 的测试环境中，如果 indexedDB 对象存在
      // 我们可以信任它是可用的
      if (typeof indexedDB.open === "function") {
        return true;
      }

      return false;
    } catch (error) {
      console.warn("IndexedDB availability check failed:", error);
      return false;
    }
  }

  /**
   * 初始化并检查 IndexedDB 可用性
   */
  public async checkAvailability(): Promise<boolean> {
    if (this.isAvailable !== null) {
      return this.isAvailable;
    }

    this.isAvailable = IndexedDBWrapperImpl.isIndexedDBAvailable();
    return this.isAvailable;
  }

  /**
   * 打开数据库连接
   */
  public async openDatabase(
    name: string,
    version: number
  ): Promise<IDBDatabase> {
    const isAvailable = await this.checkAvailability();
    if (!isAvailable) {
      throw new CacheError(
        "IndexedDB is not available in this environment",
        CacheErrorType.INITIALIZATION_FAILED
      );
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new CacheError(
            "Database open operation timed out",
            CacheErrorType.TIMEOUT_ERROR
          )
        );
      }, CACHE_TIMEOUTS.INITIALIZATION_TIMEOUT);

      try {
        const request = indexedDB.open(name, version);

        request.onerror = () => {
          clearTimeout(timeout);
          reject(
            new CacheError(
              `Failed to open database: ${request.error?.message}`,
              CacheErrorType.INITIALIZATION_FAILED,
              request.error || undefined
            )
          );
        };

        request.onsuccess = () => {
          clearTimeout(timeout);
          this.db = request.result;
          resolve(request.result);
        };

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;

          // 如果对象存储不存在则创建
          if (!db.objectStoreNames.contains("cache_entries")) {
            const store = db.createObjectStore("cache_entries", {
              keyPath: "key",
            });
            store.createIndex("timestamp", "metadata.timestamp");
            store.createIndex("lastAccessed", "metadata.lastAccessed");
            store.createIndex("dataHash", "metadata.dataHash");
          }

          if (!db.objectStoreNames.contains("cache_metadata")) {
            const metaStore = db.createObjectStore("cache_metadata", {
              keyPath: "key",
            });
            metaStore.createIndex("size", "totalSize");
            metaStore.createIndex("created", "timestamp");
          }
        };
      } catch (error) {
        clearTimeout(timeout);
        reject(
          new CacheError(
            `Failed to initiate database open: ${
              error instanceof Error ? error.message : String(error)
            }`,
            CacheErrorType.INITIALIZATION_FAILED,
            error instanceof Error ? error : undefined
          )
        );
      }
    });
  }

  /**
   * 在指定的对象存储中存储值
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async put(storeName: string, key: string, value: any): Promise<void> {
    if (!this.db) {
      throw new CacheError(
        "Database not initialized",
        CacheErrorType.INITIALIZATION_FAILED
      );
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new CacheError(
            "Put operation timed out",
            CacheErrorType.TIMEOUT_ERROR
          )
        );
      }, CACHE_TIMEOUTS.OPERATION_TIMEOUT);

      try {
        const transaction = this.db!.transaction([storeName], "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.put({ key, ...value });

        request.onerror = () => {
          clearTimeout(timeout);
          reject(
            new CacheError(
              `Failed to put data: ${request.error?.message}`,
              CacheErrorType.UNKNOWN_ERROR,
              request.error || undefined
            )
          );
        };

        request.onsuccess = () => {
          clearTimeout(timeout);
          resolve();
        };
      } catch (error) {
        clearTimeout(timeout);
        reject(
          new CacheError(
            `Put operation failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
            CacheErrorType.UNKNOWN_ERROR,
            error instanceof Error ? error : undefined
          )
        );
      }
    });
  }

  /**
   * 从指定的对象存储中检索值
   */
  public async get(storeName: string, key: string): Promise<unknown> {
    if (!this.db) {
      throw new CacheError(
        "Database not initialized",
        CacheErrorType.INITIALIZATION_FAILED
      );
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new CacheError(
            "Get operation timed out",
            CacheErrorType.TIMEOUT_ERROR
          )
        );
      }, CACHE_TIMEOUTS.OPERATION_TIMEOUT);

      try {
        const transaction = this.db!.transaction([storeName], "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onerror = () => {
          clearTimeout(timeout);
          reject(
            new CacheError(
              `Failed to get data: ${request.error?.message}`,
              CacheErrorType.UNKNOWN_ERROR,
              request.error || undefined
            )
          );
        };

        request.onsuccess = () => {
          clearTimeout(timeout);
          resolve(request.result);
        };
      } catch (error) {
        clearTimeout(timeout);
        reject(
          new CacheError(
            `Get operation failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
            CacheErrorType.UNKNOWN_ERROR,
            error instanceof Error ? error : undefined
          )
        );
      }
    });
  }

  /**
   * 从指定的对象存储中删除值
   */
  public async delete(storeName: string, key: string): Promise<void> {
    if (!this.db) {
      throw new CacheError(
        "Database not initialized",
        CacheErrorType.INITIALIZATION_FAILED
      );
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new CacheError(
            "Delete operation timed out",
            CacheErrorType.TIMEOUT_ERROR
          )
        );
      }, CACHE_TIMEOUTS.OPERATION_TIMEOUT);

      try {
        const transaction = this.db!.transaction([storeName], "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.delete(key);

        request.onerror = () => {
          clearTimeout(timeout);
          reject(
            new CacheError(
              `Failed to delete data: ${request.error?.message}`,
              CacheErrorType.UNKNOWN_ERROR,
              request.error || undefined
            )
          );
        };

        request.onsuccess = () => {
          clearTimeout(timeout);
          resolve();
        };
      } catch (error) {
        clearTimeout(timeout);
        reject(
          new CacheError(
            `Delete operation failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
            CacheErrorType.UNKNOWN_ERROR,
            error instanceof Error ? error : undefined
          )
        );
      }
    });
  }

  /**
   * 清除指定对象存储中的所有数据
   */
  public async clear(storeName: string): Promise<void> {
    if (!this.db) {
      throw new CacheError(
        "Database not initialized",
        CacheErrorType.INITIALIZATION_FAILED
      );
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new CacheError(
            "Clear operation timed out",
            CacheErrorType.TIMEOUT_ERROR
          )
        );
      }, CACHE_TIMEOUTS.OPERATION_TIMEOUT);

      try {
        const transaction = this.db!.transaction([storeName], "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.clear();

        request.onerror = () => {
          clearTimeout(timeout);
          reject(
            new CacheError(
              `Failed to clear store: ${request.error?.message}`,
              CacheErrorType.UNKNOWN_ERROR,
              request.error || undefined
            )
          );
        };

        request.onsuccess = () => {
          clearTimeout(timeout);
          resolve();
        };
      } catch (error) {
        clearTimeout(timeout);
        reject(
          new CacheError(
            `Clear operation failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
            CacheErrorType.UNKNOWN_ERROR,
            error instanceof Error ? error : undefined
          )
        );
      }
    });
  }

  /**
   * 获取指定对象存储中的所有键
   */
  public async getAllKeys(storeName: string): Promise<string[]> {
    if (!this.db) {
      throw new CacheError(
        "Database not initialized",
        CacheErrorType.INITIALIZATION_FAILED
      );
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new CacheError(
            "GetAllKeys operation timed out",
            CacheErrorType.TIMEOUT_ERROR
          )
        );
      }, CACHE_TIMEOUTS.OPERATION_TIMEOUT);

      try {
        const transaction = this.db!.transaction([storeName], "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.getAllKeys();

        request.onerror = () => {
          clearTimeout(timeout);
          reject(
            new CacheError(
              `Failed to get all keys: ${request.error?.message}`,
              CacheErrorType.UNKNOWN_ERROR,
              request.error || undefined
            )
          );
        };

        request.onsuccess = () => {
          clearTimeout(timeout);
          resolve(request.result as string[]);
        };
      } catch (error) {
        clearTimeout(timeout);
        reject(
          new CacheError(
            `GetAllKeys operation failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
            CacheErrorType.UNKNOWN_ERROR,
            error instanceof Error ? error : undefined
          )
        );
      }
    });
  }

  /**
   * 计算指定对象存储中的条目数量
   */
  public async count(storeName: string): Promise<number> {
    if (!this.db) {
      throw new CacheError(
        "Database not initialized",
        CacheErrorType.INITIALIZATION_FAILED
      );
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new CacheError(
            "Count operation timed out",
            CacheErrorType.TIMEOUT_ERROR
          )
        );
      }, CACHE_TIMEOUTS.OPERATION_TIMEOUT);

      try {
        const transaction = this.db!.transaction([storeName], "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.count();

        request.onerror = () => {
          clearTimeout(timeout);
          reject(
            new CacheError(
              `Failed to count entries: ${request.error?.message}`,
              CacheErrorType.UNKNOWN_ERROR,
              request.error || undefined
            )
          );
        };

        request.onsuccess = () => {
          clearTimeout(timeout);
          resolve(request.result);
        };
      } catch (error) {
        clearTimeout(timeout);
        reject(
          new CacheError(
            `Count operation failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
            CacheErrorType.UNKNOWN_ERROR,
            error instanceof Error ? error : undefined
          )
        );
      }
    });
  }

  /**
   * 为指定的对象存储创建事务
   */
  public transaction(
    storeNames: string[],
    mode: IDBTransactionMode
  ): IDBTransaction {
    if (!this.db) {
      throw new CacheError(
        "Database not initialized",
        CacheErrorType.INITIALIZATION_FAILED
      );
    }

    try {
      return this.db!.transaction(storeNames, mode);
    } catch (error) {
      throw new CacheError(
        `Failed to create transaction: ${
          error instanceof Error ? error.message : String(error)
        }`,
        CacheErrorType.UNKNOWN_ERROR,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * 关闭数据库连接
   */
  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
