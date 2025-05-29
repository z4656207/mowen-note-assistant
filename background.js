// 后台脚本 - 处理API调用
class MowenNoteHelper {
    constructor() {
        this.setupMessageListener();
        this.setupActionListener();
        this.setupSidePanelSupport();
    }

    /**
     * 设置扩展图标点击监听器
     */
    setupActionListener() {
        // 监听扩展图标点击 - 始终打开侧边栏
        chrome.action.onClicked.addListener((tab) => {
            if (chrome.sidePanel) {
                chrome.sidePanel.open({ tabId: tab.id })
                    .then(() => {})
                    .catch((error) => {
                        console.error('打开侧边栏失败:', error);
                        // 如果侧边栏失败，作为后备方案显示popup
                        chrome.action.setPopup({ popup: 'popup.html' });
                    });
            } else {
                // 不支持侧边栏的环境，设置popup作为后备
                chrome.action.setPopup({ popup: 'popup.html' });
            }
        });
    }

    /**
     * 设置侧边栏支持
     */
    setupSidePanelSupport() {
        // 监听标签页激活事件，为侧边栏提供上下文
        if (chrome.tabs && chrome.tabs.onActivated) {
            chrome.tabs.onActivated.addListener(async(activeInfo) => {
                try {
                    // 检查是否启用了侧边栏模式
                    const result = await chrome.storage.local.get(['sidePanelMode']);
                    if (result.sidePanelMode === true && chrome.sidePanel) {
                        // 可以在这里添加侧边栏相关的逻辑
                    }
                } catch (error) {
                    console.error('处理标签页切换失败:', error);
                }
            });
        }

        // 监听标签页更新事件
        if (chrome.tabs && chrome.tabs.onUpdated) {
            chrome.tabs.onUpdated.addListener(async(tabId, changeInfo, tab) => {
                if (changeInfo.status === 'complete') {
                    try {
                        // 检查是否启用了侧边栏模式
                        const result = await chrome.storage.local.get(['sidePanelMode']);
                        if (result.sidePanelMode === true && chrome.sidePanel) {
                            // 页面加载完成，可以通知侧边栏更新
                        }
                    } catch (error) {
                        console.error('处理页面更新失败:', error);
                    }
                }
            });
        }
    }

    /**
     * 设置消息监听器
     */
    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'processContent') {
                // 异步处理，不阻塞消息响应
                this.handleProcessContentAsync(request)
                    .catch(error => {
                        console.error('异步处理内容失败:', error);
                    });

                // 立即响应，告知任务已开始
                sendResponse({ success: true, message: '任务已开始处理' });
                return false; // 不保持消息通道开放
            } else if (request.action === 'switchToPopup') {
                // 处理切换到popup的请求
                this.handleSwitchToPopup(request, sender, sendResponse);
                return true; // 保持消息通道开放
            } else if (request.action === 'switchToSidePanel') {
                // 处理切换到侧边栏的请求
                this.handleSwitchToSidePanel(request, sender, sendResponse);
                return true; // 保持消息通道开放
            } else if (request.action === 'ping') {
                // 处理ping请求，用于测试扩展通信
                sendResponse({
                    success: true,
                    message: 'pong',
                    timestamp: Date.now(),
                    version: chrome.runtime.getManifest().version
                });
                return false;
            }
        });
    }

    /**
     * 处理切换到popup
     */
    async handleSwitchToPopup(request, sender, sendResponse) {
        try {
            const { tabId } = request;

            // 设置popup
            await chrome.action.setPopup({ popup: 'popup.html' });

            // 尝试关闭侧边栏 - Chrome没有直接的关闭API，但设置popup后会自动处理
            if (chrome.sidePanel) {
                try {
                    // 通过设置popup来覆盖侧边栏行为
                } catch (error) {}
            }

            // 立即通过程序化方式打开popup
            try {
                // Chrome 99+ 支持 openPopup API
                if (chrome.action.openPopup) {
                    await chrome.action.openPopup();
                } else {
                    // 备用方案：通过windows API创建popup样式的窗口
                    const popupWindow = await chrome.windows.create({
                        url: chrome.runtime.getURL('popup.html'),
                        type: 'popup',
                        width: 400,
                        height: 600,
                        focused: true
                    });
                }
            } catch (openError) {
                console.error('打开popup失败:', openError);
                // 如果都失败了，至少popup已经设置好了，用户可以手动点击图标
            }

            sendResponse({ success: true, message: '已切换到popup模式' });
        } catch (error) {
            console.error('切换到popup失败:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    /**
     * 处理切换到侧边栏
     */
    async handleSwitchToSidePanel(request, sender, sendResponse) {
        try {
            const { tabId } = request;

            // 先清除popup设置，恢复点击时打开侧边栏的行为
            await chrome.action.setPopup({ popup: '' });

            // 在同步上下文中立即打开侧边栏，避免用户手势丢失
            if (chrome.sidePanel && tabId) {
                // 这里不能用await，必须在同步上下文中执行
                chrome.sidePanel.open({ tabId: tabId })
                    .then(() => {
                        sendResponse({ success: true, message: '已切换到侧边栏模式' });
                    })
                    .catch((error) => {
                        console.error('切换到侧边栏失败:', error);
                        sendResponse({ success: false, error: error.message });
                    });

                // 立即返回true保持消息通道开放，等待异步操作完成
                return true;
            } else {
                sendResponse({ success: false, error: '侧边栏API不可用或缺少标签页ID' });
            }

        } catch (error) {
            console.error('切换到侧边栏失败:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    /**
     * 异步处理内容
     */
    async handleProcessContentAsync(request) {
        const { taskId, tabId, data, settings } = request;

        try {
            // 更新任务状态为处理中
            await this.updateTaskStatus(tabId, taskId, 'processing', '正在使用AI处理内容...');

            // 在AI处理前检查任务是否被取消
            if (await this.isTaskCancelled(tabId, taskId)) {
                return;
            }

            // 处理内容
            const result = await this.processContentWithAI(data, settings);

            // 在发布前再次检查任务是否被取消
            if (await this.isTaskCancelled(tabId, taskId)) {
                return;
            }

            // 更新任务状态为完成
            await this.updateTaskStatus(tabId, taskId, 'completed', '任务已完成', result);
        } catch (error) {
            console.error('处理内容失败:', error);

            // 检查是否是因为任务被取消导致的错误
            if (await this.isTaskCancelled(tabId, taskId)) {
                return;
            }

            // 更新任务状态为失败
            await this.updateTaskStatus(tabId, taskId, 'failed', '任务处理失败', null, error.message);
        }
    }

    /**
     * 更新任务状态
     */
    async updateTaskStatus(tabId, taskId, status, progressText, result = null, error = null) {
        const taskKey = `task_${tabId}`;

        try {
            const taskData = {
                taskId: taskId,
                status: status,
                progressText: progressText,
                updateTime: Date.now()
            };

            if (result) {
                taskData.result = result;
            }

            if (error) {
                taskData.error = error;
            }

            await new Promise((resolve) => {
                chrome.storage.local.set({
                    [taskKey]: taskData
                }, resolve);
            });

            // 发送通知
            if (status === 'completed') {
                await this.sendNotification('任务完成', (result && result.message) || '内容已成功处理并发布到墨问笔记', 'success');
            } else if (status === 'failed') {
                await this.sendNotification('任务失败', error || '内容处理失败，请重试', 'error');
            }

        } catch (error) {
            console.error('更新任务状态失败:', error);
        }
    }

    /**
     * 发送通知
     */
    async sendNotification(title, message, type = 'info') {
        try {
            const iconUrl = type === 'success' ? 'icons/icon48.png' :
                type === 'error' ? 'icons/icon48.png' : 'icons/icon48.png';

            await chrome.notifications.create({
                type: 'basic',
                iconUrl: iconUrl,
                title: `墨问笔记助手 - ${title}`,
                message: message,
                priority: 1
            });
        } catch (error) {
            console.error('发送通知失败:', error);
        }
    }

    /**
     * 使用AI处理内容并发布到墨问
     * @param {Object} pageData - 页面数据
     * @param {Object} settings - 用户设置
     * @returns {Promise<Object>} 处理结果
     */
    async processContentWithAI(pageData, settings = {}) {
        try {
            // 获取用户配置
            const config = await this.getStoredConfig();

            // 详细验证配置
            const configError = this.validateConfigDetailed(config);
            if (configError) {
                throw new Error(configError);
            }

            // 使用AI整理内容
            const aiResult = await this.callAIAPI(pageData, config, settings);

            // 发布到墨问
            const mowenResult = await this.publishToMowen(aiResult, config, settings);

            const autoPublish = settings.autoPublish !== false;
            const message = autoPublish ? '内容已成功发布到墨问笔记' : '内容未公开';

            return {
                aiResult,
                mowenResult,
                message,
                autoPublish,
                fullTextMode: settings.fullTextMode || false
            };
        } catch (error) {
            console.error('处理内容失败:', error);
            throw error;
        }
    }

    /**
     * 获取存储的配置
     * @returns {Promise<Object>} 配置对象
     */
    async getStoredConfig() {
        return new Promise((resolve) => {
            chrome.storage.sync.get([
                'aiApiUrl',
                'aiApiKey',
                'aiModel',
                'mowenApiKey'
            ], (result) => {
                resolve(result);
            });
        });
    }

    /**
     * 验证配置是否完整
     * @param {Object} config - 配置对象
     * @returns {boolean} 是否有效
     */
    validateConfig(config) {
        return config.aiApiUrl &&
            config.aiApiKey &&
            config.aiModel &&
            config.mowenApiKey;
    }

    /**
     * 详细验证配置并提供具体错误信息
     * @param {Object} config - 配置对象
     * @returns {string|null} 错误信息，如果配置正确则返回null
     */
    validateConfigDetailed(config) {
        if (!config.aiApiUrl) {
            return '请在设置中配置AI API地址';
        }
        if (!config.aiApiKey) {
            return '请在设置中配置AI API密钥';
        }
        if (!config.aiModel) {
            return '请在设置中配置AI模型名称';
        }
        if (!config.mowenApiKey) {
            return '请在设置中配置墨问API密钥';
        }

        // 验证URL格式
        try {
            new URL(config.aiApiUrl);
        } catch (error) {
            return 'AI API地址格式不正确，请检查设置';
        }

        // 验证API密钥格式
        if (config.aiApiKey.length < 10) {
            return 'AI API密钥格式不正确，请检查设置';
        }
        if (config.mowenApiKey.length < 10) {
            return '墨问API密钥格式不正确，请检查设置';
        }

        return null;
    }

    /**
     * 调用AI API整理内容
     * @param {Object} pageData - 页面数据
     * @param {Object} config - 配置
     * @param {Object} settings - 用户设置
     * @returns {Promise<Object>} AI处理结果
     */
    async callAIAPI(pageData, config, settings = {}) {
        const prompt = settings.fullTextMode ?
            this.buildFullTextPrompt(pageData, settings) :
            this.buildSummaryPrompt(pageData, settings);

        const requestBody = {
            model: config.aiModel,
            messages: [{
                    role: "system",
                    content: "你是一个专业的内容整理助手，擅长将网页内容整理成结构化的笔记格式。"
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.3,
            max_tokens: settings.fullTextMode ? 6000 : 4000
        };

        const response = await fetch(config.aiApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.aiApiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            let errorMessage = `AI API调用失败: ${response.status} ${response.statusText}`;

            // 提供更具体的错误信息
            if (response.status === 401) {
                errorMessage = 'AI API密钥无效或已过期，请检查设置中的API密钥';
            } else if (response.status === 403) {
                errorMessage = 'AI API访问被拒绝，请检查API密钥权限或余额';
            } else if (response.status === 429) {
                errorMessage = 'AI API请求过于频繁，请稍后重试';
            } else if (response.status === 404) {
                errorMessage = 'AI API地址不正确，请检查设置中的API地址';
            } else if (response.status >= 500) {
                errorMessage = 'AI服务暂时不可用，请稍后重试';
            }

            throw new Error(errorMessage);
        }

        const result = await response.json();
        const content = result.choices[0].message.content;

        try {
            // 尝试解析原始内容
            return JSON.parse(content);
        } catch (error) {
            // 如果解析失败，尝试处理Markdown格式的JSON
            try {
                const cleanedContent = this.extractJSONFromMarkdown(content);
                return JSON.parse(cleanedContent);
            } catch (secondError) {
                console.error('AI返回内容解析失败:', content);
                console.error('原始错误:', error.message);
                console.error('清理后错误:', secondError.message);
                throw new Error('AI返回的内容格式不正确');
            }
        }
    }

    /**
     * 从Markdown格式中提取JSON内容
     * @param {string} content - 可能包含Markdown格式的内容
     * @returns {string} 清理后的JSON字符串
     */
    extractJSONFromMarkdown(content) {
        // 移除可能的Markdown代码块标记
        let cleaned = content.trim();

        // 处理 ```json 开头和 ``` 结尾的情况
        if (cleaned.startsWith('```json')) {
            cleaned = cleaned.replace(/^```json\s*/, '');
        } else if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```\s*/, '');
        }

        // 移除结尾的 ```
        if (cleaned.endsWith('```')) {
            cleaned = cleaned.replace(/\s*```$/, '');
        }

        // 移除可能的其他Markdown格式
        cleaned = cleaned.replace(/^`+|`+$/g, '');

        // 移除可能存在的其他文字说明
        // 寻找第一个 { 和最后一个 }
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');

        if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
            cleaned = cleaned.substring(firstBrace, lastBrace + 1);
        }

        return cleaned.trim();
    }

    /**
     * 构建AI总结提示词
     * @param {Object} pageData - 页面数据
     * @param {Object} settings - 用户设置
     * @returns {string} 提示词
     */
    buildSummaryPrompt(pageData, settings = {}) {
        const shouldGenerateTags = settings.generateTags === true;
        const customPrompt = settings.customPrompt || '';

        const tagsInstruction = shouldGenerateTags ?
            "4. 为内容生成不超过1-3个相关标签" :
            "4. 不需要生成标签";

        const tagsJsonField = shouldGenerateTags ?
            '"tags": ["标签1", "标签2", "标签3"],' :
            '"tags": [],';

        const tagsNote = shouldGenerateTags ?
            "- 标签要简洁有意义，不超过3个" :
            "- 不生成标签，tags字段保持为空数组";

        // 构建自定义提示词部分
        const customPromptSection = customPrompt ?
            `

**特别要求：**
${customPrompt}

请在整理内容时特别注意上述要求。` : '';

        return `请将以下网页内容整理成适合发布到墨问笔记的格式。

网页信息：
标题: ${pageData.title}
URL: ${pageData.url}
描述: ${pageData.description}

网页内容：
${pageData.content}

请按照以下要求整理内容：

1. 提取并总结主要内容，去除无关信息
2. 将内容分成多个段落，段落之间用空行分隔
3. 识别重要信息并标记格式：
   - 重要概念或关键词用加粗格式
   - 特别重要的信息用高亮格式
   - 保留原文中的链接
${tagsInstruction}
5. 保持内容的逻辑性和可读性${customPromptSection}

请严格按照以下JSON格式返回结果，不要添加任何其他文字：

{
  "title": "整理后的标题",
  "paragraphs": [
    {
      "texts": [
        {"text": "普通文本"},
        {"text": "加粗文本", "bold": true},
        {"text": "高亮文本", "highlight": true},
        {"text": "链接文本", "link": "https://example.com"}
      ]
    }
  ],
  ${tagsJsonField}
  "sourceUrl": "${pageData.url}"
}

注意：
- 每个段落是一个对象，包含texts数组
- texts数组中的每个对象代表一段文本及其格式
- 段落之间会自动添加空行
- 段落之间中西文之间加空格
${tagsNote}
- 不管文章使用什么语言，输出一定使用中文`;
    }

    /**
     * 构建AI全文整理提示词
     * @param {Object} pageData - 页面数据
     * @param {Object} settings - 用户设置
     * @returns {string} 提示词
     */
    buildFullTextPrompt(pageData, settings = {}) {
        const shouldGenerateTags = settings.generateTags === true;
        const customPrompt = settings.customPrompt || '';

        const tagsInstruction = shouldGenerateTags ?
            "5. 为内容生成不超过1-3个相关标签" :
            "5. 不需要生成标签";

        const tagsJsonField = shouldGenerateTags ?
            '"tags": ["标签1", "标签2", "标签3"],' :
            '"tags": [],';

        const tagsNote = shouldGenerateTags ?
            "- 标签要简洁有意义，不超过3个" :
            "- 不生成标签，tags字段保持为空数组";

        // 构建自定义提示词部分
        const customPromptSection = customPrompt ?
            `

**特别要求：**
${customPrompt}

请在整理内容时特别注意上述要求。` : '';

        return `请将以下网页内容进行格式整理，转换为适合发布到墨问笔记的结构化格式。

网页信息：
标题: ${pageData.title}
URL: ${pageData.url}
描述: ${pageData.description}

网页内容：
${pageData.content}

请按照以下要求整理内容：

1. 保留完整的原文内容，不要总结或删减重要信息
2. 优化内容结构和段落划分，提高可读性
3. 识别并标记重要信息：
   - 标题和重要概念用加粗格式
   - 关键信息和要点用高亮格式
   - 保留并优化原文中的链接
4. 修正明显的格式问题和错误
${tagsInstruction}
6. 保持原文的完整性和准确性${customPromptSection}

请严格按照以下JSON格式返回结果，不要添加任何其他文字：

{
  "title": "整理后的标题",
  "paragraphs": [
    {
      "texts": [
        {"text": "普通文本"},
        {"text": "加粗文本", "bold": true},
        {"text": "高亮文本", "highlight": true},
        {"text": "链接文本", "link": "https://example.com"}
      ]
    }
  ],
  ${tagsJsonField}
  "sourceUrl": "${pageData.url}"
}

注意：
- 每个段落是一个对象，包含texts数组
- texts数组中的每个对象代表一段文本及其格式
- 段落之间会自动添加空行
- 段落之间中西文之间加空格
${tagsNote}
- 重点是格式整理而不是内容总结`;
    }

    /**
     * 发布内容到墨问
     * @param {Object} aiResult - AI处理结果
     * @param {Object} config - 配置
     * @param {Object} settings - 用户设置
     * @returns {Promise<Object>} 发布结果
     */
    async publishToMowen(aiResult, config, settings = {}) {
        // 构建墨问API需要的NoteAtom结构
        const noteAtom = this.buildNoteAtom(aiResult);

        // 获取自动发布设置，默认为true
        const autoPublish = settings.autoPublish !== false;

        // 根据generateTags设置决定是否传递标签
        const shouldGenerateTags = settings.generateTags === true;
        const tags = shouldGenerateTags ? (aiResult.tags || []) : [];

        const requestBody = {
            body: noteAtom,
            settings: {
                autoPublish: autoPublish,
                tags: tags
            }
        };

        const response = await fetch('https://open.mowen.cn/api/open/api/v1/note/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.mowenApiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `墨问API调用失败: ${response.status}`;

            // 提供更具体的错误信息
            if (response.status === 401) {
                errorMessage = '墨问API密钥无效或已过期，请检查设置中的墨问API密钥';
            } else if (response.status === 403) {
                if (errorText.includes('Quota')) {
                    errorMessage = '墨问API配额不足，请检查今日使用次数';
                } else {
                    errorMessage = '墨问API权限不足，请确认是否为Pro会员';
                }
            } else if (response.status === 429) {
                errorMessage = '墨问API请求过于频繁，请稍后重试';
            } else if (response.status === 400) {
                errorMessage = '请求参数错误，请检查内容格式';
            } else if (response.status >= 500) {
                errorMessage = '墨问服务暂时不可用，请稍后重试';
            }

            // 如果有详细错误信息，添加到消息中
            if (errorText && errorText.length < 200) {
                errorMessage += `\n详细信息: ${errorText}`;
            }

            throw new Error(errorMessage);
        }

        return await response.json();
    }

    /**
     * 构建墨问API需要的NoteAtom结构
     * @param {Object} aiResult - AI处理结果
     * @returns {Object} NoteAtom结构
     */
    buildNoteAtom(aiResult) {
        const content = [];

        // 添加标题段落
        if (aiResult.title) {
            content.push({
                type: "paragraph",
                content: [{
                    type: "text",
                    text: aiResult.title,
                    marks: [{ type: "bold" }]
                }]
            });

            // 标题后添加空行
            content.push({ type: "paragraph" });
        }

        // 添加来源链接
        if (aiResult.sourceUrl) {
            content.push({
                type: "paragraph",
                content: [{
                        type: "text",
                        text: "来源：",
                        marks: [{ type: "bold" }]
                    },
                    {
                        type: "text",
                        text: "原文链接",
                        marks: [{
                            type: "link",
                            attrs: { href: aiResult.sourceUrl }
                        }]
                    }
                ]
            });

            // 添加空行
            content.push({ type: "paragraph" });
        }

        // 处理段落内容
        if (aiResult.paragraphs && Array.isArray(aiResult.paragraphs)) {
            aiResult.paragraphs.forEach((paragraph, index) => {
                if (paragraph.texts && Array.isArray(paragraph.texts)) {
                    const textNodes = paragraph.texts.map(textItem => {
                        const node = {
                            type: "text",
                            text: textItem.text
                        };

                        // 添加格式标记
                        const marks = [];
                        if (textItem.bold) {
                            marks.push({ type: "bold" });
                        }
                        if (textItem.highlight) {
                            marks.push({ type: "highlight" });
                        }
                        if (textItem.link) {
                            marks.push({
                                type: "link",
                                attrs: { href: textItem.link }
                            });
                        }

                        if (marks.length > 0) {
                            node.marks = marks;
                        }

                        return node;
                    });

                    content.push({
                        type: "paragraph",
                        content: textNodes
                    });

                    // 段落间添加空行（除了最后一个段落）
                    if (index < aiResult.paragraphs.length - 1) {
                        content.push({ type: "paragraph" });
                    }
                }
            });
        }

        return {
            type: "doc",
            content: content
        };
    }

    /**
     * 检查任务是否被取消
     * @param {string} tabId - 标签页ID
     * @param {string} taskId - 任务ID
     * @returns {Promise<boolean>} 是否被取消
     */
    async isTaskCancelled(tabId, taskId) {
        try {
            const taskKey = `task_${tabId}`;
            const result = await new Promise((resolve) => {
                chrome.storage.local.get([taskKey], resolve);
            });

            const taskData = result[taskKey];
            // 如果任务数据不存在，说明可能被取消了
            if (!taskData) {
                return true;
            }

            // 检查任务ID是否匹配（防止任务ID冲突）
            if (taskData.taskId !== taskId) {
                return true;
            }

            return false;
        } catch (error) {
            console.error('检查任务取消状态失败:', error);
            // 如果检查失败，为了安全起见，认为任务被取消
            return true;
        }
    }
}

// 初始化后台脚本
new MowenNoteHelper();