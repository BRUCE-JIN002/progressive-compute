// 工具函数库

/** 简单的文本搜索匹配函数 */
export const matchText = (text: string, query: string): boolean => {
  if (!query.trim()) return true;
  return text.toLowerCase().includes(query.toLowerCase().trim());
};

/** 高亮匹配的文本 */
export const highlightText = (text: string, query: string): string => {
  if (!query.trim()) return text;

  const regex = new RegExp(`(${query.trim()})`, "gi");
  return text.replace(regex, "<mark>$1</mark>");
};

// 缓存管理相关的导出已移动到 hooks/useProgressiveComputeCache/ 目录下
