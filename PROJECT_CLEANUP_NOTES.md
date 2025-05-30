# 项目清理说明

## 已清理的文件结构

```
mowen-note-assistant/
├── manifest.json          # 插件核心配置
├── background.js          # 后台服务
├── content.js            # 内容提取脚本
├── popup.*               # 弹出窗口（主要界面）
├── sidepanel.*           # 侧边栏（备用界面）
├── options.*             # 设置页面
├── icons/                # 图标文件
├── build/                # 构建工具
└── docs/                 # 文档
```

## 已删除的文件
- `test*.html` - 所有测试HTML文件
- `debug.js` - 调试脚本
- `测试指南.md` - 测试文档

## 文档分类建议

### 🟢 建议保留的核心文档
- `README.md` - 项目主文档
- `PRIVACY_POLICY.md` - 隐私政策
- `INSTALL.md` - 安装说明
- `package.json` / `package-lock.json` - 依赖管理

### 🟡 建议移动到 docs/ 目录的文档
这些文档对开发有用，但不应在根目录：
- `SIDEPANEL_*.md` - 侧边栏相关文档
- `POPUP_RESULT_OPTIMIZATION.md` - 弹窗优化文档
- `CHROME_STORE_PUBLISH_GUIDE.md` - 发布指南
- `PUBLISH_SUCCESS_GUIDE.md` - 发布成功指南

### 🔴 建议删除或移动到私有文档的文件
- `墨问API.md` - 可能包含敏感API信息
- `build/release/` - 构建产物（已在.gitignore中）

## .gitignore 配置
已创建 `.gitignore` 文件，排除了：
- 依赖包 (`node_modules/`)
- 构建产物 (`build/release/`, `*.zip`)
- 测试文件 (`test*.html`)
- IDE文件 (`.vscode/`, `.idea/`)
- 临时文件 (`*.tmp`, `*.log`)
- 敏感信息文件 (`*.env`, `config.json`)

## 下一步建议
1. 审查并移动文档到合适位置
2. 更新 README.md，添加项目介绍和使用说明
3. 检查代码中是否有硬编码的敏感信息
4. 添加开源许可证文件 (LICENSE)
5. 创建贡献指南 (CONTRIBUTING.md)

## 注意事项
- 在提交前，请检查所有文件，确保没有包含API密钥或其他敏感信息
- 考虑添加GitHub Actions进行自动化构建和测试
- 为重要的配置文件添加示例文件（如 `config.example.json`） 