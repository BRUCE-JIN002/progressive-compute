import fs from "fs";
import path from "path";

// 词汇库
const surnames = ["张", "王", "李", "赵", "刘", "陈", "杨", "黄", "周", "吴"];
const names = ["伟", "芳", "娜", "敏", "静", "丽", "强", "磊", "军", "洋"];

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

function generateDescription() {
  // 随机选择1-3个描述片段组合
  const count = Math.floor(Math.random() * 3) + 1;
  const selectedDescs = [];

  for (let i = 0; i < count; i++) {
    const desc = descriptions[Math.floor(Math.random() * descriptions.length)];
    if (!selectedDescs.includes(desc)) {
      selectedDescs.push(desc);
    }
  }

  return selectedDescs.join("，");
}

function generateName() {
  const surname = surnames[Math.floor(Math.random() * surnames.length)];
  const name = names[Math.floor(Math.random() * names.length)];
  return surname + name;
}

// 生成并写入文件
async function generateAndWriteData(totalCount, filename) {
  const outputDir = path.join(process.cwd(), "src", "test");

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, filename);
  const stream = fs.createWriteStream(outputPath);

  console.log("=".repeat(60));
  console.log("测试数据生成工具");
  console.log("=".repeat(60));
  console.log(`目标数量: ${totalCount.toLocaleString()} 条`);
  console.log(`输出文件: ${outputPath}`);
  console.log("=".repeat(60));
  console.log();

  const startTime = Date.now();

  // 写入文件头
  stream.write("// 自动生成的示例测试数据\n");
  stream.write("// 生成时间: " + new Date().toLocaleString() + "\n\n");
  stream.write("export interface TestDataItem {\n");
  stream.write("  id: number;\n");
  stream.write("  name: string;\n");
  stream.write("  description: string;\n");
  stream.write("}\n\n");
  stream.write("export const testData: TestDataItem[] = [\n");

  // 逐条生成并写入
  for (let i = 0; i < totalCount; i++) {
    const name = generateName();
    const description = generateDescription();

    const item = {
      id: i + 1,
      name,
      description,
    };

    const jsonStr = JSON.stringify(item);
    stream.write(`  ${jsonStr}${i < totalCount - 1 ? "," : ""}\n`);

    // 打印进度
    if ((i + 1) % 100 === 0) {
      const progress = (((i + 1) / totalCount) * 100).toFixed(2);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      const speed = ((i + 1) / parseFloat(elapsed)).toFixed(0);
      console.log(
        `进度: ${progress}% (${(
          i + 1
        ).toLocaleString()}/${totalCount.toLocaleString()}) - 耗时: ${elapsed}秒 - 速度: ${speed}条/秒`
      );
    }
  }

  stream.write("];\n");
  stream.end();

  await new Promise((resolve) => stream.on("finish", resolve));

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  const fileSize = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(2);
  const avgSpeed = (totalCount / parseFloat(duration)).toFixed(0);

  console.log("\n" + "=".repeat(60));
  console.log("生成完成！");
  console.log("=".repeat(60));
  console.log(`总耗时: ${duration}秒`);
  console.log(`平均速度: ${avgSpeed} 条/秒`);
  console.log(`文件大小: ${fileSize} MB`);
  console.log(`文件路径: ${outputPath}`);
  console.log("=".repeat(60));
}

// 解析命令行参数
function parseArguments() {
  const args = process.argv.slice(2);
  let count = 1000; // 默认值
  let showHelp = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // 支持多种格式：-c, --count, c
    if (arg === "-c" || arg === "--count" || arg === "c") {
      const nextArg = args[i + 1];
      if (nextArg && !isNaN(nextArg)) {
        count = parseInt(nextArg, 10);
        i++; // 跳过下一个参数，因为它是数量值
      } else {
        console.error("错误: count 参数需要一个有效的数字");
        process.exit(1);
      }
    } else if (arg === "-h" || arg === "--help" || arg === "h") {
      showHelp = true;
    } else if (!isNaN(arg)) {
      // 如果是纯数字，直接作为数量
      count = parseInt(arg, 10);
    } else if (arg.startsWith("-")) {
      console.error(`错误: 未知参数 ${arg}`);
      process.exit(1);
    } else {
      console.error(`错误: 未知参数 ${arg}`);
      process.exit(1);
    }
  }

  return { count, showHelp };
}

// 显示帮助信息
function showHelpMessage() {
  console.log("测试数据生成工具");
  console.log("");
  console.log("用法:");
  console.log(
    "  npm run generate:test                    # 生成默认 1000 条数据"
  );
  console.log(
    "  npm run generate:test -- c 10000        # 生成 10000 条数据 (简洁格式)"
  );
  console.log(
    "  npm run generate:test -- -c 10000       # 生成 10000 条数据 (标准格式)"
  );
  console.log("  npm run generate:test -- 50000          # 直接指定数量");
  console.log("  npm run generate:test -- h              # 显示帮助信息");
  console.log("");
  console.log("参数:");
  console.log("  c, -c, --count <number>  指定生成的数据条数 (默认: 1000)");
  console.log("  h, -h, --help           显示帮助信息");
  console.log("  <number>                 直接指定数量");
  console.log("");
  console.log("示例:");
  console.log(
    "  npm run generate:test -- c 1000         # 基本测试 (1千条) - 简洁"
  );
  console.log(
    "  npm run generate:test -- 10000          # 性能测试 (1万条) - 最简"
  );
  console.log(
    "  npm run generate:test -- -c 100000      # 压力测试 (10万条) - 标准"
  );
  console.log(
    "  npm run generate:test -- c 1000000      # 极限测试 (100万条) - 简洁"
  );
}

// 主函数
async function main() {
  const { count, showHelp } = parseArguments();

  if (showHelp) {
    showHelpMessage();
    return;
  }

  // 验证数据量范围
  if (count <= 0) {
    console.error("错误: 数据条数必须大于 0");
    process.exit(1);
  }

  if (count > 10000000) {
    console.warn("警告: 生成超过 1000万条数据可能会消耗大量内存和时间");
    console.warn("建议分批生成或使用更小的数据量进行测试");
  }

  await generateAndWriteData(count, "testData.ts");
}

main().catch(console.error);
