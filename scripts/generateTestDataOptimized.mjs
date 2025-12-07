import fs from "fs";
import path from "path";
import { pinyin } from "pinyin-pro";

/** 最优化的拼音索引生成 - 只保留首字母拼音 */
const generateKeywordsMapOptimized = (text) => {
  // 只保留完整文本的首字母拼音索引
  const firstPinyin = pinyin(text, {
    toneType: "none",
    pattern: "first",
    type: "array",
  }).join("");

  return firstPinyin;
};

// 词汇库
const surnames = ["张", "王", "李", "赵", "刘", "陈", "杨", "黄", "周", "吴"];
const names = ["伟", "芳", "娜", "敏", "静", "丽", "强", "磊", "军", "洋"];
const adjectives = ["优秀的", "专业的", "高效的", "创新的", "可靠的"];
const nouns = ["系统", "平台", "服务", "产品", "方案"];
const actions = ["提供", "实现", "支持", "优化", "管理"];
const features = ["高性能", "易用性", "稳定性", "扩展性"];
const descriptions = [
  "致力于为用户提供最优质的服务体验",
  "采用先进的技术架构和设计理念",
  "具有强大的数据处理和分析能力",
  "支持多种业务场景和应用需求",
  "提供完善的技术支持和售后服务",
  "注重用户体验和产品质量",
  "持续创新和技术升级",
  "确保系统的稳定性和可靠性",
  "满足企业级应用的各项要求",
  "拥有丰富的行业经验和成功案例",
];

function generateDescription(minLength, maxLength) {
  const length =
    Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
  let desc = "";

  while (desc.length < length) {
    const parts = [
      adjectives[Math.floor(Math.random() * adjectives.length)],
      nouns[Math.floor(Math.random() * nouns.length)],
      actions[Math.floor(Math.random() * actions.length)],
      features[Math.floor(Math.random() * features.length)],
      descriptions[Math.floor(Math.random() * descriptions.length)],
    ];
    // 移除标点符号，只保留纯中文
    desc += parts.join("");
  }

  // 移除可能包含的标点符号
  return desc
    .replace(/[，。、；：！？""''（）【】《》]/g, "")
    .substring(0, length);
}

function generateName() {
  const surname = surnames[Math.floor(Math.random() * surnames.length)];
  const name = names[Math.floor(Math.random() * names.length)];
  return surname + name;
}

// 渐进式生成并写入文件
async function generateAndWriteData(totalCount, filename) {
  const outputDir = path.join(process.cwd(), "src", "sourceData");

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, filename);
  const stream = fs.createWriteStream(outputPath);

  console.log("=".repeat(60));
  console.log("最优化版测试数据生成工具");
  console.log("=".repeat(60));
  console.log(`目标数量: ${totalCount.toLocaleString()} 条`);
  console.log(`输出文件: ${outputPath}`);
  console.log(`优化策略: 只保留首字母拼音索引（最小内存占用）`);
  console.log("=".repeat(60));
  console.log();

  const startTime = Date.now();

  // 写入文件头
  stream.write(
    "// 自动生成的测试数据 - 共 " + totalCount.toLocaleString() + " 条\n"
  );
  stream.write("// 生成时间: " + new Date().toLocaleString() + "\n");
  stream.write("// 最优化版本: 只保留首字母拼音索引\n\n");
  stream.write("export interface TestDataItem {\n");
  stream.write("  id: number;\n");
  stream.write("  name: string;\n");
  stream.write("  description: string;\n");
  stream.write("  keywordsMap: string; // 首字母拼音\n");
  stream.write("}\n\n");
  stream.write("export const testData: TestDataItem[] = [\n");

  // 逐条生成并写入
  for (let i = 0; i < totalCount; i++) {
    const name = generateName();
    const description = generateDescription(10, 50); // 限制描述长度为10-50
    const keywordsMap = generateKeywordsMapOptimized(description);

    const item = {
      id: i + 1,
      name,
      description,
      keywordsMap,
    };

    const jsonStr = JSON.stringify(item);
    stream.write(`  ${jsonStr}${i < totalCount - 1 ? "," : ""}\n`);

    // 打印进度
    if ((i + 1) % 500 === 0) {
      const progress = (((i + 1) / totalCount) * 100).toFixed(2);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      const speed = ((i + 1) / parseFloat(elapsed)).toFixed(0);
      const memUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(
        2
      );
      console.log(
        `进度: ${progress}% (${(
          i + 1
        ).toLocaleString()}/${totalCount.toLocaleString()}) - 耗时: ${elapsed}秒 - 速度: ${speed}条/秒 - 内存: ${memUsage}MB`
      );
    }
  }

  stream.write("];\n");
  stream.end();

  await new Promise((resolve) => stream.on("finish", resolve));

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  const fileSize = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(2);
  const avgSpeed = (totalCount / parseFloat(duration)).toFixed(0);
  const finalMemUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(
    2
  );

  console.log("\n" + "=".repeat(60));
  console.log("生成完成！");
  console.log("=".repeat(60));
  console.log(`总耗时: ${duration}秒`);
  console.log(`平均速度: ${avgSpeed} 条/秒`);
  console.log(`文件大小: ${fileSize} MB`);
  console.log(`最终内存: ${finalMemUsage} MB`);
  console.log(`文件路径: ${outputPath}`);
  console.log("=".repeat(60));
}

// 主函数
async function main() {
  const totalCount = 500000;
  await generateAndWriteData(totalCount, "testData.ts");
}

main().catch(console.error);
