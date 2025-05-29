# 墨问笔记助手 - 侧边栏默认模式（简化版）

## 修改概述

简化扩展的默认行为：点击扩展图标始终打开侧边栏，并提供便捷的模式切换功能。

## 核心设计理念

**简单原则**：
- 扩展图标点击 → 始终打开侧边栏（无需状态存储）
- 侧边栏切换按钮 → 关闭侧边栏，立即打开传统popup
- popup切换按钮 → 关闭popup，立即打开侧边栏

## 主要修改

### 1. Manifest.json 修改
- **移除**: `"default_popup": "popup.html"` 从 action 配置中
- **移除**: `"windows"` 权限（不再创建新窗口）
- **保留**: `"side_panel"` 配置，指向 `sidepanel.html`

### 2. Background.js 简化
- **默认行为**: 点击扩展图标始终打开侧边栏
- **切换机制**: 
  - `switchToPopup`: 设置popup并清除侧边栏
  - `switchToSidePanel`: 清除popup设置并打开侧边栏
- **移除**: 复杂的状态存储和用户偏好管理

### 3. 侧边栏界面
- **切换按钮**: 在右上角，小三角图标（外部链接样式）
- **切换行为**: 点击后立即切换到popup，无需手动再次点击扩展图标

### 4. 弹窗界面
- **切换按钮**: 在右上角，侧边栏图标
- **切换行为**: 点击后立即切换到侧边栏，popup自动关闭

## 技术实现

### API策略
```javascript
// 侧边栏切换到popup
await chrome.action.setPopup({ popup: 'popup.html' });

// popup切换到侧边栏  
await chrome.action.setPopup({ popup: '' });
await chrome.sidePanel.open({ tabId: tabId });
```

### 消息处理
- `switchToPopup`: 设置popup模式
- `switchToSidePanel`: 恢复侧边栏模式

### 无状态设计
- 不保存用户偏好到storage
- 默认行为固定为侧边栏
- 切换是临时的，重新点击扩展图标恢复默认行为

## 用户体验优势

### 简化的交互
1. **一致的默认行为**: 点击扩展图标总是打开侧边栏
2. **即时切换**: 点击切换按钮立即生效，无需额外操作
3. **无状态混乱**: 不会因为状态同步问题导致行为异常

### 界面设计
- 切换按钮低调不显眼（28x28px，透明度0.7）
- 图标语义明确（外部链接 = 弹出，侧边栏 = 嵌入）
- 布局一致性好

## 移除的复杂性

### 不再需要
- ❌ 用户偏好存储 (`sidePanelMode`)
- ❌ 复杂的状态同步逻辑
- ❌ 用户手势上下文管理
- ❌ 创建新窗口 (`chrome.windows.create`)
- ❌ 状态恢复和错误处理

### 保留的核心功能
- ✅ 内容提取和AI处理
- ✅ 发布设置和任务管理
- ✅ 错误处理和诊断
- ✅ 完整的用户界面

## 代码简化对比

### 修改前（复杂版）
```javascript
chrome.action.onClicked.addListener(async(tab) => {
    const result = await chrome.storage.local.get(['sidePanelMode']);
    const useSidePanel = result.sidePanelMode !== false;
    if (useSidePanel) {
        await chrome.sidePanel.open({ tabId: tab.id }); // 可能报错
    } else {
        this.openPopupWindow(); // 创建新窗口
    }
});
```

### 修改后（简化版）
```javascript
chrome.action.onClicked.addListener((tab) => {
    if (chrome.sidePanel) {
        chrome.sidePanel.open({ tabId: tab.id }); // 始终打开侧边栏
    } else {
        chrome.action.setPopup({ popup: 'popup.html' }); // 后备方案
    }
});
```

## 兼容性
- 支持 Chrome 扩展 Manifest V3
- 需要 `sidePanel` 权限
- 向后兼容，不支持侧边栏时自动回退到popup

## 测试要点
1. ✅ 扩展图标点击始终打开侧边栏
2. ✅ 侧边栏切换按钮立即打开popup
3. ✅ popup切换按钮立即打开侧边栏
4. ✅ 不出现"用户手势"错误
5. ✅ 不出现工具栏的弹窗窗口
6. ✅ 切换后功能完全正常 