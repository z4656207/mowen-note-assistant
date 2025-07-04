# Mowen Note Assistant (墨问笔记助手)

一个智能的Chrome浏览器插件，可以自动提取网页内容，通过AI整理或一键剪藏方式发布到墨问笔记。

## ✨ 功能特性

- 🔍 **智能内容提取**：自动识别并提取网页主要内容
- 🤖 **三种处理模式**：
  - **AI总结模式（推荐）**：提取和总结网页核心内容，适合长文章要点提取
  - **AI全文整理模式**：保留完整内容并进行格式整理，适合完整信息保存
  - **一键剪藏模式**：直接保存网页内容并转换为墨问富文本格式，无需AI配置
- 📝 **灵活发布选项**：
  - **公开笔记**：发布后任何人都可以访问和分享
  - **私有笔记**：只有自己可以查看，保护隐私内容
- 🏷️ **智能标签控制**：
  - **自动生成标签**：AI可为笔记生成1-3个相关标签
  - **标签开关控制**：用户可选择是否生成标签，默认关闭
  - **个性化管理**：支持手动管理标签或AI辅助分类
- 🎨 **丰富格式支持**：支持加粗、高亮、链接、标签等格式
- ⚙️ **智能设置记忆**：用户偏好设置自动保存，提升使用体验
- 🔒 **数据安全**：所有配置信息安全存储在本地
- 🌐 **兼容性强**：支持OpenAI兼容的各种AI模型

## 🚀 快速开始

### 1. 安装插件

1. 下载插件源码
2. 打开Chrome浏览器，进入 `chrome://extensions/`
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择插件文件夹

### 2. 配置API密钥

#### 必需配置（所有模式）
- **墨问API密钥**：需要墨问Pro会员才能获取API密钥，在[墨问开放平台](https://open.mowen.cn)获取

#### AI模式额外配置（仅AI处理模式需要）
1. 点击插件图标，选择"设置"
2. 配置AI模型信息：
   - **AI API地址**：如 `https://api.openai.com/v1/chat/completions`
   - **AI API密钥**：您的AI服务商API密钥
   - **AI模型名称**：如 `deepseek-chat`、`gpt-3.5-turbo`、`gpt-4`等

### 3. 使用插件

1. 在任意网页点击插件图标
2. **选择处理模式**：
   - **AI智能整理（默认）**：
     - 关闭"全文整理模式"：AI将生成内容总结
     - 开启"全文整理模式"：AI将整理完整内容格式
   - **一键剪藏**：直接保存网页内容，保持原有格式，无需AI配置
3. **选择发布方式**：
   - 开启"发布公开笔记"：笔记发布后任何人都可以访问（默认）
   - 关闭"发布公开笔记"：笔记将发布为私有，只有自己可见
4. **选择标签设置（仅AI模式）**：
   - 关闭"生成标签"：不生成任何标签（默认）
   - 开启"生成标签"：AI将为内容生成1-3个相关标签
5. 点击对应的处理按钮开始执行
6. 等待处理完成并自动发布到墨问
7. 查看处理结果和笔记链接

## 🚀 功能特性

### 📎 一键剪藏模式
- **快速保存功能**
  - 支持直接保存网页内容到墨问笔记
  - 无需AI配置，仅需墨问API密钥即可使用
  - 适合快速收集资料和保存重要信息

- **智能格式转换**
  - 自动将网页内容转换为墨问富文本格式
  - 保持原有的段落结构和基本格式
  - 智能识别并保留链接、标题等关键元素

- **简化配置需求**
  - 一键剪藏模式只需要墨问API密钥
  - 无需配置AI API，降低使用门槛
  - 适合不需要AI处理的快速剪藏场景

### 🏷️ 智能标签管理
- **标签生成控制**
  - 支持AI自动生成1-3个相关标签
  - 用户可自主控制是否生成标签
  - 默认关闭标签生成，避免意外生成不需要的标签

- **灵活标签设置**
  - 支持弹窗模式和侧边栏模式的同步设置
  - 设置状态自动保存，下次使用时保持选择
  - 关闭时保持空标签数组，便于手动管理

- **智能提示词优化**
  - 根据用户设置动态调整AI提示词
  - 确保AI输出符合用户期望
  - 支持自定义标签生成规则

### 💡 使用建议
- **资料收集**：使用一键剪藏快速保存网页内容
- **重要信息保存**：适合保存不需要AI处理的原始信息
- **成本控制**：一键剪藏不消耗AI Token，完全免费
- **标签管理**：根据个人习惯选择是否启用AI标签生成

#### 💡 使用建议
- **个人知识管理**：如果您习惯手动分类，建议关闭标签生成
- **内容快速整理**：如果希望AI辅助分类，建议开启标签生成
- **混合使用场景**：可根据不同类型内容灵活切换开关状态

### v2.0 新增功能

#### 🎯 双模式AI处理
- **总结模式（默认）**
  - 智能提取网页核心内容
  - 去除冗余信息，突出重点
  - 适合快速获取文章要点
  - Token消耗：最大4000，处理速度快

- **全文整理模式**
  - 保留完整原文内容
  - 优化格式和段落结构
  - 适合完整信息保存和后续查阅
  - Token消耗：最大6000，内容更完整

#### 🔐 灵活发布控制
- **公开笔记（默认）**
  - 发布后可被搜索和分享
  - 适合知识分享和协作
  - 提高内容曝光度

- **私有笔记**
  - 仅自己可见和编辑
  - 保护敏感信息
  - 适合个人资料收集

#### ⚙️ 智能设置记忆
- 用户选择的处理模式自动保存
- 发布方式偏好记忆功能
- 下次使用时保持上次选择
- 提升使用体验和操作效率

#### 🎨 界面体验升级
- 动态按钮文本，清晰显示当前操作
- 智能进度提示，区分不同处理模式
- 详细结果展示，包含处理模式信息
- 完善的帮助说明和使用指导

### 使用建议

1. **选择合适的处理模式**
   - 快速剪藏资料：推荐一键剪藏模式
   - 新闻文章、博客：推荐AI总结模式
   - 技术文档、教程：推荐AI全文整理模式
   - 参考资料、重要内容：推荐AI全文整理模式或一键剪藏

2. **合理控制成本**
   - 不需要AI处理时使用一键剪藏模式
   - 日常阅读多使用AI总结模式
   - 重要内容收集时使用AI全文整理模式
   - 注意AI token消耗和费用控制

3. **发布方式选择**
   - 学习笔记、心得体会：可选择公开分享
   - 工作资料、私人信息：建议设为私有
   - 根据内容敏感性灵活调整

4. **用户界面** (`popup.*`, `options.*`)
   - 现代化的用户界面设计
   - **智能控制面板**：
     - 处理模式切换（AI智能整理/一键剪藏）
     - AI细分模式选择（总结/全文整理）
     - 发布方式选择（公开/私有）
     - 标签生成控制（开启/关闭）
     - 设置状态实时保存
   - 实时状态反馈和进度显示
   - 完整的配置管理和诊断工具

## 🛠️ 技术架构

### 文件结构

```
mowen-note-assistant/
├── manifest.json          # 插件配置文件
├── background.js          # 后台脚本，处理API调用
├── content.js            # 内容脚本，提取网页内容
├── popup.html            # 弹出窗口HTML
├── popup.css             # 弹出窗口样式
├── popup.js              # 弹出窗口逻辑
├── options.html          # 设置页面HTML
├── options.css           # 设置页面样式
├── options.js            # 设置页面逻辑
├── icons/                # 插件图标
└── README.md             # 项目文档
```

7. **"笔记发布失败"**
   - 检查墨问API密钥是否正确
   - 确认是否为墨问Pro会员
   - 检查今日API配额是否充足

8. **"标签生成问题"**
   - 检查"生成标签"开关是否按预期设置
   - 关闭状态：确认笔记中tags字段为空数组
   - 开启状态：确认AI生成了相关标签（1-3个）
   - 如果标签不合适，可以关闭功能后手动管理

9. **"一键剪藏相关问题"**
   - 一键剪藏模式只需要墨问API密钥，无需AI配置
   - 如果内容格式异常，可能是网页结构复杂导致
   - 一键剪藏保持原有格式，不进行AI优化
   - 适合快速保存，后续可在墨问中手动编辑

3. **配置验证**
   - 确认所有API密钥格式正确（无多余空格）
   - **一键剪藏模式**：只需配置墨问API密钥
   - **AI处理模式**：需要同时配置AI API和墨问API
   - 检查API地址是否可访问
   - 验证墨问Pro会员状态
   - **检查处理模式设置**：
     - 一键剪藏适合快速收集场景
     - AI总结模式适合快速阅读场景
     - AI全文整理模式适合资料收集场景
   - **验证发布权限设置**：
     - 公开笔记会被其他人搜索到
     - 私有笔记只有自己可见
   - **确认标签生成设置（仅AI模式）**：
     - 关闭状态适合手动管理标签的用户
     - 开启状态适合希望AI辅助分类的用户
     - 标签设置状态会影响AI提示词和最终输出