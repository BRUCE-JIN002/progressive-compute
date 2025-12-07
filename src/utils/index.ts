import { pinyin } from "pinyin-pro";

const enum Languages {
  ZH_CN = "zh-cn",
}

/** 生成拼音搜索索引 - 优化版，只保留首字母拼音 */
export const generateKeywordsMap = (
  text: string,
  lang: Languages = Languages.ZH_CN
) => {
  if (lang === Languages.ZH_CN) {
    // 只保留完整文本的首字母拼音索引
    const firstPinyin = pinyin(text, {
      toneType: "none",
      pattern: "first",
      type: "array",
    }).join("");

    return firstPinyin;
  }
  return null;
};
