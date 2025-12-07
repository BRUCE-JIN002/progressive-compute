// 示例测试数据 - 优化版（只保留首字母拼音索引）
export interface TestDataItem {
  id: number;
  name: string;
  description: string;
  keywordsMap: string; // 首字母拼音
}

export const sampleData: TestDataItem[] = [
  {
    id: 1,
    name: "张伟",
    description: "优秀的系统提供高性能致力于为用户提供最优质的服务体验",
    keywordsMap: "yxdxtggjnzlywyhtzgzyzdfw ty",
  },
  {
    id: 2,
    name: "王芳",
    description: "专业的平台实现易用性采用先进的技术架构和设计理念",
    keywordsMap: "zydptsxyyx cyx xjdjsjghsjln",
  },
  {
    id: 3,
    name: "李静",
    description: "创新产品方案支持多种业务场景应用需求",
    keywordsMap: "cxcpfazcdzy wccjyyxq",
  },
  {
    id: 4,
    name: "赵强",
    description: "可靠技术工具集成部署管理监控分析",
    keywordsMap: "kkjsgj jcbsgl jkfx",
  },
  {
    id: 5,
    name: "刘磊",
    description: "高效服务产品优化处理稳定性扩展性",
    keywordsMap: "gxfwcpy hclwdxkzx",
  },
];
