# 贡献指南

感谢您对墨问笔记助手的关注！我们欢迎任何形式的贡献。

## 🚀 快速开始

### 开发环境设置

1. **克隆仓库**
   ```bash
   git clone https://github.com/z4656207/mowen-plugin.git
   cd mowen-plugin
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **开发模式加载扩展**
   - 打开 Chrome 浏览器
   - 访问 `chrome://extensions/`
   - 开启"开发者模式"
   - 点击"加载已解压的扩展程序"
   - 选择项目根目录

## 📋 开发规范

### 代码风格
- 使用 UTF-8 编码
- 缩进使用 4 个空格
- 函数和变量使用驼峰命名
- 添加必要的注释，特别是复杂逻辑

### 提交规范
使用语义化提交信息：
- `feat: 新功能`
- `fix: 修复bug`
- `docs: 文档更新`
- `style: 代码格式调整`
- `refactor: 重构代码`
- `test: 测试相关`

### 分支管理
- `main` - 主分支，稳定版本
- `develop` - 开发分支
- `feature/xxx` - 新功能分支
- `fix/xxx` - 修复分支

## 🐛 报告问题

### Bug 报告
请包含以下信息：
- Chrome 版本
- 操作系统
- 复现步骤
- 期望行为 vs 实际行为
- 相关截图（如果有）

### 功能请求
- 清晰描述想要的功能
- 说明使用场景
- 提供设计思路（可选）

## 🔧 开发指南

### 项目结构
```
mowen-plugin/
├── manifest.json          # 扩展配置
├── background.js          # 后台脚本
├── content.js            # 内容脚本
├── popup.html/js/css     # 弹窗界面
├── sidepanel.html/js/css # 侧边栏界面
├── options.html/js/css   # 设置页面
├── icons/                # 图标资源
└── docs/                 # 文档
```

### 核心功能模块
1. **内容提取** (`content.js`) - 提取网页内容
2. **AI处理** (`background.js`) - 调用AI API整理内容
3. **墨问发布** (`background.js`) - 发布到墨问笔记
4. **用户界面** - 弹窗和侧边栏

### API 配置
开发时需要配置：
- AI API（OpenAI兼容）
- 墨问 API

请不要在代码中硬编码 API 密钥！

## 🧪 测试

### 手动测试
1. 安装开发版扩展
2. 配置必要的API密钥
3. 测试各个功能模块
4. 验证在不同网站的兼容性

### 构建测试
```bash
npm run build
```

## 📦 发布流程

1. 更新版本号（`manifest.json` 和 `package.json`）
2. 更新 `CHANGELOG.md`
3. 运行构建脚本：`npm run build`
4. 测试构建包
5. 创建 GitHub Release
6. 提交到 Chrome Web Store

## ❓ 获得帮助

- 查看 [文档](docs/)
- 提交 [Issue](https://github.com/z4656207/mowen-plugin/issues)
- 参与 [Discussions](https://github.com/z4656207/mowen-plugin/discussions)

## 📝 许可证

本项目采用 [MIT License](LICENSE)。贡献代码即表示您同意将代码置于该许可证下。

---

再次感谢您的贡献！🎉 