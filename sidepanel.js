// 侧边栏脚本
class SidePanelController {
    constructor() {
        this.currentPageData = null;
        this.taskId = null; // 当前任务ID
        this.isTaskRunning = false; // 任务运行状态
        this.currentPollInterval = null; // 当前轮询间隔ID
        this.init();
    }

    /**
     * 初始化侧边栏
     */
    async init() {
        // 确保DOM完全加载
        await this.waitForDOM();

        this.bindEvents();
        await this.loadPageInfo();
        await this.checkConfiguration();
        await this.loadPublishSettings();

        // 检查是否有正在进行的任务
        await this.checkRunningTask();

        // 添加强制重置功能（开发调试用）
        this.addForceResetFeature();

        // 侧边栏特有的初始化
        this.initSidePanelFeatures();
    }

    /**
     * 初始化侧边栏特有功能
     */
    initSidePanelFeatures() {
        // 设置侧边栏模式标识
        this.setSidePanelMode(true);

        // 监听页面变化
        this.setupPageChangeListener();

        // 设置自动刷新页面信息
        this.setupAutoRefresh();
    }

    /**
     * 设置侧边栏模式
     */
    setSidePanelMode(enabled) {
        // 保存模式状态
        chrome.storage.local.set({ 'sidePanelMode': enabled });

        // 更新UI状态
        const modeIndicator = document.querySelector('.mode-indicator');
        if (modeIndicator) {
            modeIndicator.style.display = enabled ? 'block' : 'none';
        }
    }

    /**
     * 监听页面变化
     */
    setupPageChangeListener() {
        // 侧边栏无法直接监听chrome.tabs事件
        // 改为通过消息通信或定期检查的方式
        console.log('侧边栏模式：使用定期检查方式跟踪页面变化');

        // 可以通过storage变化来监听页面切换
        if (chrome.storage && chrome.storage.onChanged) {
            chrome.storage.onChanged.addListener((changes, namespace) => {
                if (namespace === 'local' && changes.currentTabId) {
                    console.log('检测到标签页切换:', changes.currentTabId);
                    this.handleTabChange(changes.currentTabId.newValue);
                }
            });
        }
    }

    /**
     * 处理标签页切换
     */
    async handleTabChange(tabId) {
        try {
            // 在侧边栏中，我们需要通过查询当前活动标签页来获取信息
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                await this.updatePageInfo(tab);
                // 检查新页面是否有正在进行的任务
                await this.checkRunningTask();
            }
        } catch (error) {
            console.error('处理标签页切换失败:', error);
        }
    }

    /**
     * 处理页面更新
     */
    async handlePageUpdate(tab) {
        await this.updatePageInfo(tab);
    }

    /**
     * 更新页面信息
     */
    async updatePageInfo(tab) {
        if (!tab) {
            const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            tab = currentTab;
        }

        if (tab) {
            document.getElementById('pageTitle').textContent = tab.title || '无标题';
            document.getElementById('pageUrl').textContent = tab.url || '';

            // 重新提取页面内容
            this.extractPageContent(tab.id);
        }
    }

    /**
     * 设置自动刷新
     */
    setupAutoRefresh() {
        // 每30秒检查一次页面状态
        setInterval(() => {
            this.refreshPageStatus();
        }, 30000);
    }

    /**
     * 刷新页面状态
     */
    async refreshPageStatus() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                await this.updatePageInfo(tab);
            }
        } catch (error) {
            console.error('刷新页面状态失败:', error);
        }
    }

    /**
     * 等待DOM元素准备就绪
     */
    async waitForDOM() {
        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 100; // 最多等待1秒

            const checkDOM = () => {
                const autoPublishToggle = document.getElementById('autoPublishToggle');
                const fullTextModeToggle = document.getElementById('fullTextModeToggle');
                const generateTagsToggle = document.getElementById('generateTagsToggle');
                const extractBtnText = document.getElementById('extractBtnText');
                const extractBtn = document.getElementById('extractBtn');

                if (autoPublishToggle && fullTextModeToggle && generateTagsToggle && extractBtnText && extractBtn) {
                    console.log('DOM元素准备就绪');
                    resolve();
                } else {
                    attempts++;
                    if (attempts < maxAttempts) {
                        setTimeout(checkDOM, 10);
                    } else {
                        console.error('等待DOM超时，但继续初始化');
                        resolve(); // 即使超时也继续，让错误处理机制处理
                    }
                }
            };
            checkDOM();
        });
    }

    /**
     * 绑定事件监听器
     */
    bindEvents() {
        // 提取并发布按钮
        document.getElementById('extractBtn').addEventListener('click', () => {
            this.handleExtractAndPublish();
        });

        // 设置按钮
        document.getElementById('settingsBtn').addEventListener('click', () => {
            chrome.runtime.openOptionsPage();
        });

        // 模式切换按钮
        document.getElementById('toggleModeBtn').addEventListener('click', () => {
            this.toggleToPopupMode();
        });

        // 关闭结果按钮
        document.getElementById('closeResult').addEventListener('click', () => {
            this.hideResult();
        });

        // 自动发布开关
        document.getElementById('autoPublishToggle').addEventListener('change', (e) => {
            this.updateButtonText();
        });

        // 全文整理模式开关
        document.getElementById('fullTextModeToggle').addEventListener('change', (e) => {
            this.updateButtonText();
        });

        // 生成标签开关
        document.getElementById('generateTagsToggle').addEventListener('change', (e) => {
            this.updateButtonText();
        });

        // 帮助链接
        document.getElementById('helpLink').addEventListener('click', (e) => {
            e.preventDefault();
            this.showHelp();
        });

        // 反馈链接
        document.getElementById('feedbackLink').addEventListener('click', (e) => {
            e.preventDefault();
            this.showFeedback();
        });

        // 诊断按钮
        document.getElementById('diagnoseBtn').addEventListener('click', () => {
            this.runDiagnosis();
        });

        // 取消任务按钮
        document.getElementById('cancelBtn').addEventListener('click', () => {
            this.handleCancelTask();
        });
    }

    /**
     * 切换到弹窗模式
     */
    async toggleToPopupMode() {
        try {
            // 保存当前状态
            await this.setSidePanelMode(false);

            // 显示提示
            this.showStatus('已切换到弹窗模式，请点击扩展图标使用', 'info');

            // 可选：关闭侧边栏
            if (chrome.sidePanel && chrome.sidePanel.setOptions) {
                await chrome.sidePanel.setOptions({
                    enabled: false
                });
            }
        } catch (error) {
            console.error('切换模式失败:', error);
            this.showStatus('切换模式失败: ' + error.message, 'error');
        }
    }

    /**
     * 检查是否可以注入脚本
     */
    canInjectScript(url) {
        if (!url) return false;

        // 不能注入脚本的页面类型
        const restrictedProtocols = [
            'chrome://',
            'chrome-extension://',
            'moz-extension://',
            'edge://',
            'about:',
            'data:',
            'file://'
        ];

        // 不能注入脚本的特殊域名
        const restrictedDomains = [
            'chrome.google.com/webstore',
            'addons.mozilla.org',
            'microsoftedge.microsoft.com'
        ];

        // 检查协议
        for (const protocol of restrictedProtocols) {
            if (url.startsWith(protocol)) {
                return false;
            }
        }

        // 检查特殊域名
        for (const domain of restrictedDomains) {
            if (url.includes(domain)) {
                return false;
            }
        }

        return true;
    }

    /**
     * 显示页面类型帮助信息
     */
    showPageTypeHelp(url) {
        let helpMessage = '';

        if (url.startsWith('chrome://')) {
            helpMessage = '这是Chrome内部页面，无法提取内容。请切换到普通网页。';
        } else if (url.startsWith('chrome-extension://')) {
            helpMessage = '这是扩展页面，无法提取内容。请切换到普通网页。';
        } else if (url.includes('chrome.google.com/webstore')) {
            helpMessage = '这是Chrome应用商店页面，无法提取内容。请切换到普通网页。';
        } else {
            helpMessage = '当前页面受保护，无法提取内容。请切换到普通网页。';
        }

        // 显示帮助信息
        const helpElement = document.createElement('div');
        helpElement.className = 'help-message';
        helpElement.innerHTML = `
            <div style="padding: 12px; background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; margin: 8px 0;">
                <strong>💡 提示：</strong><br>
                ${helpMessage}<br><br>
                <strong>支持的页面类型：</strong><br>
                • 普通网站 (http://, https://)<br>
                • 新闻文章、博客文章<br>
                • 文档和资料页面
            </div>
        `;

        const statusElement = document.getElementById('status');
        if (statusElement && statusElement.parentNode) {
            statusElement.parentNode.insertBefore(helpElement, statusElement.nextSibling);
        }
    }

    /**
     * 加载当前页面信息
     */
    async loadPageInfo() {
        try {
            // 获取当前活动标签页
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            if (!tab) {
                this.showStatus('无法获取当前页面信息', 'error');
                return;
            }

            // 检查页面是否可以注入脚本
            if (!this.canInjectScript(tab.url)) {
                this.showStatus('当前页面不支持内容提取', 'warning');

                // 禁用提取按钮
                const extractBtn = document.getElementById('extractBtn');
                if (extractBtn) {
                    extractBtn.disabled = true;
                    extractBtn.title = '当前页面不支持内容提取';
                }

                // 显示帮助信息
                this.showPageTypeHelp(tab.url);

                // 仍然更新页面信息显示
                document.getElementById('pageTitle').textContent = tab.title || '无标题';
                document.getElementById('pageUrl').textContent = tab.url || '';
                return;
            }

            // 更新页面信息显示
            document.getElementById('pageTitle').textContent = tab.title || '无标题';
            document.getElementById('pageUrl').textContent = tab.url || '';

            // 运行调试（开发模式）
            if (window.location.hostname === 'localhost' || window.location.protocol === 'file:') {
                console.log('开发模式：运行内容脚本调试');
                await this.debugContentScript();
            }

            // 向内容脚本发送消息获取页面内容
            this.extractPageContent(tab.id);

        } catch (error) {
            console.error('加载页面信息失败:', error);
            this.showStatus('加载页面信息失败: ' + error.message, 'error');
        }
    }

    /**
     * 提取页面内容（带重试机制）
     */
    async extractPageContent(tabId, retryCount = 0) {
        const maxRetries = 3;

        try {
            console.log(`开始提取页面内容，标签页ID: ${tabId}, 重试次数: ${retryCount}`);

            // 首先检查内容脚本是否已准备好
            const isReady = await this.checkContentScriptReady(tabId);
            console.log(`内容脚本准备状态: ${isReady}`);

            // 如果内容脚本未准备好，尝试手动注入
            if (!isReady) {
                console.log('内容脚本未准备好，尝试手动注入...');
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tabId },
                        files: ['content.js']
                    });
                    console.log('手动注入内容脚本成功');

                    // 等待脚本初始化
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    // 再次检查是否准备好
                    const isReadyAfterInject = await this.checkContentScriptReady(tabId);
                    console.log(`注入后内容脚本准备状态: ${isReadyAfterInject}`);

                    if (!isReadyAfterInject && retryCount < maxRetries) {
                        console.log('注入后仍未准备好，重试...');
                        setTimeout(() => {
                            this.extractPageContent(tabId, retryCount + 1);
                        }, 1000);
                        return;
                    }
                } catch (injectError) {
                    console.error('手动注入失败:', injectError);
                    if (retryCount < maxRetries) {
                        setTimeout(() => {
                            this.extractPageContent(tabId, retryCount + 1);
                        }, 1000);
                        return;
                    } else {
                        this.showStatus('无法注入内容脚本，请刷新页面后重试', 'error');
                        return;
                    }
                }
            }

            // 发送消息提取内容
            console.log('发送extractContent消息...');
            chrome.tabs.sendMessage(tabId, { action: 'extractContent' }, (response) => {
                console.log('收到响应:', response);
                console.log('chrome.runtime.lastError:', chrome.runtime.lastError);

                if (chrome.runtime.lastError) {
                    const errorMsg = chrome.runtime.lastError.message || chrome.runtime.lastError.toString();
                    console.error('发送消息失败:', errorMsg);

                    // 如果是连接错误且还有重试次数，尝试重试
                    if ((errorMsg.includes('Could not establish connection') ||
                            errorMsg.includes('Receiving end does not exist')) &&
                        retryCount < maxRetries) {
                        console.log(`连接错误，重试 (${retryCount + 1}/${maxRetries})`);
                        setTimeout(() => {
                            this.extractPageContent(tabId, retryCount + 1);
                        }, 1000);
                    } else if (retryCount < maxRetries) {
                        console.log(`重试提取内容 (${retryCount + 1}/${maxRetries})`);
                        setTimeout(() => {
                            this.extractPageContent(tabId, retryCount + 1);
                        }, 1000);
                    } else {
                        this.showStatus(`无法获取页面内容: ${errorMsg}`, 'error');
                    }
                    return;
                }

                if (response && response.success) {
                    console.log('页面内容提取成功:', response.data);
                    this.currentPageData = response.data;
                    this.showStatus('页面内容已准备就绪', 'success');
                } else {
                    const errorMsg = response ? (response.error || '未知错误') : '无响应';
                    console.error('提取页面内容失败:', errorMsg);
                    this.showStatus('提取页面内容失败: ' + errorMsg, 'error');
                }
            });

        } catch (error) {
            console.error('extractPageContent异常:', error);
            if (retryCount < maxRetries) {
                console.log(`提取内容失败，重试 (${retryCount + 1}/${maxRetries}):`, error);
                setTimeout(() => {
                    this.extractPageContent(tabId, retryCount + 1);
                }, 1000);
            } else {
                this.showStatus('无法提取页面内容: ' + error.message, 'error');
            }
        }
    }

    /**
     * 检查内容脚本是否已准备好
     */
    async checkContentScriptReady(tabId) {
        return new Promise((resolve) => {
            console.log('检查内容脚本是否准备好...');

            // 设置超时
            const timeout = setTimeout(() => {
                console.log('检查内容脚本超时');
                resolve(false);
            }, 2000);

            chrome.tabs.sendMessage(tabId, { action: 'ping' }, (response) => {
                clearTimeout(timeout);

                if (chrome.runtime.lastError) {
                    const error = chrome.runtime.lastError.message;
                    console.log('内容脚本未准备好:', error);

                    // 特殊处理连接错误
                    if (error.includes('Could not establish connection') ||
                        error.includes('Receiving end does not exist')) {
                        console.log('检测到连接错误，内容脚本可能未加载');
                    }

                    resolve(false);
                } else {
                    console.log('内容脚本已准备好:', response);
                    resolve(true);
                }
            });
        });
    }

    /**
     * 检查配置是否完整
     */
    async checkConfiguration() {
        try {
            const config = await this.getStoredConfig();

            if (!this.validateConfig(config)) {
                this.showStatus('请先在设置页面配置API密钥', 'error');
                const extractBtn = document.getElementById('extractBtn');
                const diagnoseBtn = document.getElementById('diagnoseBtn');

                if (extractBtn) {
                    extractBtn.disabled = true;
                    extractBtn.textContent = '请先配置API密钥';
                }

                if (diagnoseBtn) {
                    diagnoseBtn.style.display = 'inline-flex';
                }
            }
        } catch (error) {
            console.error('检查配置失败:', error);
            this.showStatus('检查配置失败: ' + error.message, 'error');
        }
    }

    /**
     * 获取存储的配置
     */
    async getStoredConfig() {
        return new Promise((resolve) => {
            chrome.storage.sync.get([
                'aiApiUrl',
                'aiApiKey',
                'aiModel',
                'mowenApiKey'
            ], (result) => {
                resolve({
                    aiApiUrl: result.aiApiUrl || '',
                    aiApiKey: result.aiApiKey || '',
                    aiModel: result.aiModel || '',
                    mowenApiKey: result.mowenApiKey || ''
                });
            });
        });
    }

    /**
     * 验证配置
     */
    validateConfig(config) {
        return config &&
            config.aiApiUrl && config.aiApiUrl.trim().length > 0 &&
            config.aiApiKey && config.aiApiKey.trim().length > 0 &&
            config.aiModel && config.aiModel.trim().length > 0 &&
            config.mowenApiKey && config.mowenApiKey.trim().length > 0;
    }

    /**
     * 加载发布设置
     */
    async loadPublishSettings() {
        try {
            const settings = await this.getPublishSettings();

            const autoPublishToggle = document.getElementById('autoPublishToggle');
            const fullTextModeToggle = document.getElementById('fullTextModeToggle');
            const generateTagsToggle = document.getElementById('generateTagsToggle');

            if (autoPublishToggle) {
                autoPublishToggle.checked = settings.autoPublish;
            }

            if (fullTextModeToggle) {
                fullTextModeToggle.checked = settings.fullTextMode;
            }

            if (generateTagsToggle) {
                generateTagsToggle.checked = settings.generateTags;
            }

            // 更新按钮文本
            this.updateButtonText();

        } catch (error) {
            console.error('加载发布设置失败:', error);
        }
    }

    /**
     * 获取发布设置
     */
    async getPublishSettings() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['autoPublish', 'fullTextMode', 'generateTags'], (result) => {
                resolve({
                    autoPublish: result.autoPublish !== false, // 默认为true
                    fullTextMode: result.fullTextMode === true, // 默认为false
                    generateTags: result.generateTags === true // 默认为false
                });
            });
        });
    }

    /**
     * 保存发布设置
     */
    async savePublishSettings(autoPublish, fullTextMode, generateTags) {
        return new Promise((resolve) => {
            chrome.storage.local.set({
                autoPublish: autoPublish,
                fullTextMode: fullTextMode,
                generateTags: generateTags
            }, resolve);
        });
    }

    /**
     * 更新按钮文本
     */
    updateButtonText() {
        const autoPublishToggle = document.getElementById('autoPublishToggle');
        const fullTextModeToggle = document.getElementById('fullTextModeToggle');
        const generateTagsToggle = document.getElementById('generateTagsToggle');
        const extractBtnText = document.getElementById('extractBtnText');

        if (!autoPublishToggle || !fullTextModeToggle || !generateTagsToggle || !extractBtnText) {
            return;
        }

        const isAutoPublish = autoPublishToggle.checked;
        const isFullTextMode = fullTextModeToggle.checked;
        const isGenerateTags = generateTagsToggle.checked;

        let buttonText = '';

        if (isFullTextMode) {
            buttonText = isAutoPublish ? '全文整理并公开发布' : '全文整理并私有发布';
        } else {
            buttonText = isAutoPublish ? '智能总结并公开发布' : '智能总结并私有发布';
        }

        extractBtnText.textContent = buttonText;

        // 保存设置
        this.savePublishSettings(isAutoPublish, isFullTextMode, isGenerateTags);
    }

    // 其他方法与popup.js相同...
    // 为了简化，这里只展示关键的不同部分
    // 实际实现中需要复制popup.js中的所有其他方法

    /**
     * 处理提取和发布
     */
    async handleExtractAndPublish() {
        if (!this.currentPageData) {
            this.showStatus('页面内容未准备就绪，请稍后重试', 'error');
            return;
        }

        // 如果任务正在进行，阻止重复提交
        if (this.isTaskRunning) {
            this.showStatus('任务正在进行中，请稍候...', 'warning');
            return;
        }

        try {
            // 获取当前标签页
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                this.showStatus('无法获取当前标签页', 'error');
                return;
            }

            // 获取当前设置
            const autoPublishToggle = document.getElementById('autoPublishToggle');
            const fullTextModeToggle = document.getElementById('fullTextModeToggle');
            const generateTagsToggle = document.getElementById('generateTagsToggle');

            if (!autoPublishToggle || !fullTextModeToggle || !generateTagsToggle) {
                console.error('设置元素未找到');
                this.showStatus('界面初始化失败，请重新打开插件', 'error');
                return;
            }

            const autoPublish = autoPublishToggle.checked;
            const fullTextMode = fullTextModeToggle.checked;
            const generateTags = generateTagsToggle.checked;

            // 生成任务ID
            this.taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            this.isTaskRunning = true;

            // 显示进度指示器
            let progressText;
            if (fullTextMode) {
                progressText = autoPublish ? '正在使用AI整理全文内容...' : '正在整理全文并发布为私有笔记...';
            } else {
                progressText = autoPublish ? '正在使用AI生成内容总结...' : '正在生成总结并发布为私有笔记...';
            }
            this.showProgress(progressText);

            // 保存任务状态到storage
            const taskKey = `task_${tab.id}`;
            const taskData = {
                taskId: this.taskId,
                status: 'running',
                progressText: progressText,
                startTime: Date.now(),
                settings: {
                    autoPublish: autoPublish,
                    fullTextMode: fullTextMode,
                    generateTags: generateTags
                }
            };

            await new Promise((resolve) => {
                chrome.storage.local.set({
                    [taskKey]: taskData
                }, resolve);
            });

            // 禁用按钮
            const extractBtn = document.getElementById('extractBtn');
            if (extractBtn) {
                extractBtn.disabled = true;
            }

            // 发送到后台脚本处理
            chrome.runtime.sendMessage({
                action: 'processContent',
                taskId: this.taskId,
                tabId: tab.id,
                data: this.currentPageData,
                settings: {
                    autoPublish: autoPublish,
                    fullTextMode: fullTextMode,
                    generateTags: generateTags
                }
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('发送消息失败:', chrome.runtime.lastError);
                    this.handleTaskError('发送消息失败: ' + chrome.runtime.lastError.message, tab.id);
                }
            });

            // 开始轮询任务状态
            this.startTaskPolling(tab.id);

        } catch (error) {
            console.error('处理失败:', error);
            this.handleTaskError('处理失败: ' + error.message);
        }
    }

    /**
     * 处理任务错误
     */
    async handleTaskError(errorMessage, tabId = null) {
        this.isTaskRunning = false;
        this.hideProgress();

        const extractBtn = document.getElementById('extractBtn');
        if (extractBtn) {
            extractBtn.disabled = false;
        }

        this.showStatus(errorMessage, 'error');

        // 清理任务状态
        if (tabId) {
            const taskKey = `task_${tabId}`;
            chrome.storage.local.remove([taskKey]);
        }
    }

    /**
     * 检查正在进行的任务
     */
    async checkRunningTask() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) return;

            const taskKey = `task_${tab.id}`;
            const result = await new Promise((resolve) => {
                chrome.storage.local.get([taskKey], resolve);
            });

            const taskData = result[taskKey];
            if (!taskData) {
                console.log('没有找到正在进行的任务');
                return;
            }

            console.log('发现正在进行的任务:', taskData);

            // 检查任务是否超时（超过5分钟）
            const taskAge = Date.now() - (taskData.startTime || taskData.updateTime || 0);
            if (taskAge > 5 * 60 * 1000) {
                console.log('任务已超时，清理状态');
                await this.clearTaskState();
                return;
            }

            // 根据任务状态恢复界面
            if (taskData.status === 'running' || taskData.status === 'processing') {
                this.taskId = taskData.taskId;
                this.isTaskRunning = true;

                // 恢复进度显示
                this.showProgress(taskData.progressText || '正在处理...');

                // 禁用提取按钮
                const extractBtn = document.getElementById('extractBtn');
                if (extractBtn) {
                    extractBtn.disabled = true;
                }

                // 开始轮询任务状态
                this.startTaskPolling(tab.id, taskAge);

                this.showStatus('已恢复正在进行的任务', 'info');
            } else if (taskData.status === 'completed') {
                // 显示完成结果
                if (taskData.result) {
                    this.handleTaskCompleted(taskData);
                }
                // 清理已完成的任务
                await this.clearTaskState();
            } else if (taskData.status === 'failed') {
                // 显示失败信息
                this.handleTaskFailed(taskData);
                // 清理失败的任务
                await this.clearTaskState();
            }

        } catch (error) {
            console.error('检查正在进行的任务失败:', error);
        }
    }

    /**
     * 开始任务状态轮询
     */
    startTaskPolling(tabId, initialTaskAge = 0) {
        const taskKey = `task_${tabId}`;
        let pollCount = 0;
        const maxPollCount = 600; // 最多轮询10分钟（每秒一次）
        const startTime = Date.now();

        console.log(`开始轮询任务状态，标签页ID: ${tabId}, 初始任务年龄: ${Math.round(initialTaskAge / 1000)}秒`);

        this.currentPollInterval = setInterval(async() => {
            pollCount++;
            const elapsedTime = Date.now() - startTime;

            console.log(`轮询第${pollCount}次，已耗时: ${Math.round(elapsedTime / 1000)}秒`);

            try {
                const result = await new Promise((resolve) => {
                    chrome.storage.local.get([taskKey], resolve);
                });

                const taskData = result[taskKey];

                if (!taskData) {
                    console.log('任务数据丢失，停止轮询');
                    this.handleTaskDataMissing();
                    return;
                }

                console.log(`任务状态: ${taskData.status}, 进度: ${taskData.progressText}`);

                // 检查任务状态
                if (taskData.status === 'completed') {
                    console.log('任务已完成');
                    clearInterval(this.currentPollInterval);
                    this.handleTaskCompleted(taskData);
                } else if (taskData.status === 'failed') {
                    console.log('任务失败');
                    clearInterval(this.currentPollInterval);
                    this.handleTaskFailed(taskData);
                } else if (taskData.status === 'processing') {
                    // 更新进度显示
                    this.showProgress(taskData.progressText || '正在处理...');
                } else if (taskData.status === 'running') {
                    // 保持等待状态
                    console.log('任务仍在运行中...');
                }

                // 检查轮询超时
                if (pollCount >= maxPollCount) {
                    console.log('轮询超时，停止轮询');
                    clearInterval(this.currentPollInterval);
                    this.handlePollingTimeout(tabId);
                }

            } catch (error) {
                console.error('轮询过程中发生错误:', error);
                this.handlePollingError(error);
            }
        }, 1000); // 每秒检查一次
    }

    /**
     * 处理轮询超时
     */
    async handlePollingTimeout(tabId) {
        console.log('任务轮询超时');
        this.isTaskRunning = false;
        this.hideProgress();

        const extractBtn = document.getElementById('extractBtn');
        if (extractBtn) {
            extractBtn.disabled = false;
        }

        this.showStatus('任务处理超时，请重试或检查网络连接', 'error');

        // 显示诊断按钮
        const diagnoseBtn = document.getElementById('diagnoseBtn');
        if (diagnoseBtn) {
            diagnoseBtn.style.display = 'inline-flex';
        }

        // 清理任务状态
        await this.clearTaskState();
    }

    /**
     * 处理任务数据丢失
     */
    handleTaskDataMissing() {
        console.log('任务数据丢失');
        clearInterval(this.currentPollInterval);
        this.isTaskRunning = false;
        this.hideProgress();

        const extractBtn = document.getElementById('extractBtn');
        if (extractBtn) {
            extractBtn.disabled = false;
        }

        this.showStatus('任务状态丢失，请重新开始', 'warning');
    }

    /**
     * 处理轮询错误
     */
    handlePollingError(error) {
        console.error('轮询错误:', error);
        clearInterval(this.currentPollInterval);
        this.isTaskRunning = false;
        this.hideProgress();

        const extractBtn = document.getElementById('extractBtn');
        if (extractBtn) {
            extractBtn.disabled = false;
        }

        this.showStatus('检查任务状态时发生错误: ' + error.message, 'error');
    }

    /**
     * 处理任务完成
     */
    handleTaskCompleted(taskData) {
        console.log('处理任务完成:', taskData);
        this.isTaskRunning = false;
        this.hideProgress();

        const extractBtn = document.getElementById('extractBtn');
        if (extractBtn) {
            extractBtn.disabled = false;
        }

        if (taskData.result) {
            this.showResult(taskData.result);
            this.showStatus('任务已完成！', 'success');
        } else {
            this.showStatus('任务已完成，但没有返回结果', 'warning');
        }

        // 清理任务状态
        this.clearTaskState();
    }

    /**
     * 处理任务失败
     */
    handleTaskFailed(taskData) {
        console.log('处理任务失败:', taskData);
        this.isTaskRunning = false;
        this.hideProgress();

        const extractBtn = document.getElementById('extractBtn');
        if (extractBtn) {
            extractBtn.disabled = false;
        }

        const errorMessage = taskData.error || '任务处理失败，请重试';
        this.showStatus(errorMessage, 'error');

        // 显示诊断按钮
        const diagnoseBtn = document.getElementById('diagnoseBtn');
        if (diagnoseBtn) {
            diagnoseBtn.style.display = 'inline-flex';
        }

        // 清理任务状态
        this.clearTaskState();
    }

    /**
     * 处理取消任务
     */
    async handleCancelTask() {
        if (!this.isTaskRunning) {
            this.showStatus('没有正在进行的任务', 'warning');
            return;
        }

        const confirmed = confirm('确定要取消当前任务吗？');
        if (!confirmed) {
            return;
        }

        try {
            console.log('用户取消任务');

            // 停止轮询
            if (this.currentPollInterval) {
                clearInterval(this.currentPollInterval);
                this.currentPollInterval = null;
            }

            // 重置状态
            this.isTaskRunning = false;
            this.taskId = null;

            // 清理任务状态
            await this.clearTaskState();

            // 更新UI
            this.hideProgress();
            const extractBtn = document.getElementById('extractBtn');
            if (extractBtn) {
                extractBtn.disabled = false;
            }

            this.showStatus('任务已取消', 'info');

        } catch (error) {
            console.error('取消任务失败:', error);
            this.showStatus('取消任务失败: ' + error.message, 'error');
        }
    }

    /**
     * 清除任务状态
     */
    async clearTaskState() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                const taskKey = `task_${tab.id}`;
                await new Promise((resolve) => {
                    chrome.storage.local.remove([taskKey], resolve);
                });
                console.log('任务状态已清除');
            }
        } catch (error) {
            console.error('清除任务状态失败:', error);
        }
    }

    /**
     * 运行诊断
     */
    async runDiagnosis() {
        this.showProgress('正在运行诊断...');

        const results = {
            timestamp: new Date().toLocaleString(),
            browser: navigator.userAgent,
            extension: {
                version: chrome.runtime.getManifest().version,
                id: chrome.runtime.id
            },
            permissions: {},
            storage: {},
            network: {},
            errors: []
        };

        try {
            // 检查权限
            results.permissions.activeTab = await this.checkPermission('activeTab');
            results.permissions.storage = await this.checkPermission('storage');
            results.permissions.scripting = await this.checkPermission('scripting');

            // 检查存储
            const config = await this.getStoredConfig();
            results.storage.hasApiKey = !!(config.aiApiKey && config.aiApiKey.trim());
            results.storage.hasMowenKey = !!(config.mowenApiKey && config.mowenApiKey.trim());
            results.storage.apiUrl = config.aiApiUrl || '未设置';

            // 检查网络连接
            try {
                const response = await fetch('https://api.mowen.cn/health', {
                    method: 'GET',
                    timeout: 5000
                });
                results.network.mowenApi = response.ok ? '连接正常' : `HTTP ${response.status}`;
            } catch (error) {
                results.network.mowenApi = '连接失败: ' + error.message;
            }

            // 检查当前页面
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                const canInject = this.canInjectScript(tab.url);
                results.currentPage = {
                    url: tab.url,
                    title: tab.title,
                    canInject: canInject
                };

                if (!canInject) {
                    results.errors.push('当前页面不支持内容提取');
                }
            }

            // 检查任务状态
            if (tab) {
                const taskKey = `task_${tab.id}`;
                const taskResult = await new Promise((resolve) => {
                    chrome.storage.local.get([taskKey], resolve);
                });
                results.taskStatus = taskResult[taskKey] || '无活动任务';
            }

        } catch (error) {
            results.errors.push('诊断过程中发生错误: ' + error.message);
        }

        this.hideProgress();
        this.showDiagnosticResult(results);
    }

    /**
     * 检查权限
     */
    async checkPermission(permission) {
        try {
            return await chrome.permissions.contains({ permissions: [permission] });
        } catch (error) {
            return '检查失败: ' + error.message;
        }
    }

    /**
     * 显示诊断结果
     */
    showDiagnosticResult(results) {
            const content = `
        <div style="font-family: monospace; font-size: 12px; line-height: 1.4;">
            <h3 style="margin-bottom: 10px;">🔍 诊断报告</h3>
            <div style="margin-bottom: 10px;"><strong>时间:</strong> ${results.timestamp}</div>
            
            <div style="margin-bottom: 10px;">
                <strong>📋 权限状态:</strong><br>
                • activeTab: ${results.permissions.activeTab ? '✅' : '❌'}<br>
                • storage: ${results.permissions.storage ? '✅' : '❌'}<br>
                • scripting: ${results.permissions.scripting ? '✅' : '❌'}
            </div>
            
            <div style="margin-bottom: 10px;">
                <strong>💾 配置状态:</strong><br>
                • AI API密钥: ${results.storage.hasApiKey ? '✅ 已配置' : '❌ 未配置'}<br>
                • 墨问API密钥: ${results.storage.hasMowenKey ? '✅ 已配置' : '❌ 未配置'}<br>
                • API地址: ${results.storage.apiUrl}
            </div>
            
            <div style="margin-bottom: 10px;">
                <strong>🌐 网络状态:</strong><br>
                • 墨问API: ${results.network.mowenApi}
            </div>
            
            ${results.currentPage ? `
            <div style="margin-bottom: 10px;">
                <strong>📄 当前页面:</strong><br>
                • 可注入脚本: ${results.currentPage.canInject ? '✅' : '❌'}<br>
                • URL: ${results.currentPage.url.substring(0, 50)}...
            </div>
            ` : ''}
            
            ${results.taskStatus && typeof results.taskStatus === 'object' ? `
            <div style="margin-bottom: 10px;">
                <strong>⚙️ 任务状态:</strong><br>
                • 状态: ${results.taskStatus.status}<br>
                • 任务ID: ${results.taskStatus.taskId}
            </div>
            ` : ''}
            
            ${results.errors.length > 0 ? `
            <div style="margin-bottom: 10px;">
                <strong>❌ 错误信息:</strong><br>
                ${results.errors.map(error => `• ${error}`).join('<br>')}
            </div>
            ` : ''}
        </div>
        `;

        this.showResult({ summary: content });
    }

    // 添加强制重置功能
    addForceResetFeature() {
        // 键盘快捷键
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'R') {
                e.preventDefault();
                this.forceReset();
            }
        });

        // 三击标题重置
        let clickCount = 0;
        const titleElement = document.getElementById('pageTitle');
        if (titleElement) {
            titleElement.addEventListener('click', () => {
                clickCount++;
                setTimeout(() => {
                    if (clickCount === 3) {
                        this.forceReset();
                    }
                    clickCount = 0;
                }, 500);
            });
        }
    }

    /**
     * 强制重置
     */
    async forceReset() {
        if (confirm('确定要强制重置所有状态吗？这将清除所有正在进行的任务。')) {
            try {
                await this.clearAllTaskStates();
                this.showStatus('已强制重置所有状态', 'success');

                // 重新初始化
                setTimeout(() => {
                    location.reload();
                }, 1000);
            } catch (error) {
                console.error('强制重置失败:', error);
                this.showStatus('强制重置失败: ' + error.message, 'error');
            }
        }
    }

    /**
     * 清除所有任务状态
     */
    async clearAllTaskStates() {
        return new Promise((resolve) => {
            chrome.storage.local.clear(() => {
                console.log('已清除所有任务状态');
                resolve();
            });
        });
    }

    /**
     * 显示状态
     */
    showStatus(message, type = 'info') {
        const statusElement = document.getElementById('status');
        if (!statusElement) return;

        statusElement.textContent = message;
        statusElement.className = `status ${type}`;
        statusElement.style.display = 'block';

        // 3秒后自动隐藏成功消息
        if (type === 'success') {
            setTimeout(() => {
                statusElement.style.display = 'none';
            }, 3000);
        }
    }

    /**
     * 显示进度
     */
    showProgress(text = '正在处理...') {
        const progressElement = document.getElementById('progress');
        const progressText = document.getElementById('progress').querySelector('.progress-text');
        const cancelBtn = document.getElementById('cancelBtn');

        if (progressElement) {
            progressElement.style.display = 'block';
        }

        if (progressText) {
            progressText.textContent = text;
        }

        // 显示取消按钮
        if (cancelBtn) {
            cancelBtn.style.display = 'flex';
        }

        // 隐藏状态消息
        const statusElement = document.getElementById('status');
        if (statusElement) {
            statusElement.style.display = 'none';
        }
    }

    /**
     * 隐藏进度
     */
    hideProgress() {
        const progressElement = document.getElementById('progress');
        const cancelBtn = document.getElementById('cancelBtn');

        if (progressElement) {
            progressElement.style.display = 'none';
        }

        // 隐藏取消按钮
        if (cancelBtn) {
            cancelBtn.style.display = 'none';
        }
    }

    /**
     * 显示结果
     */
    showResult(data) {
        const resultElement = document.getElementById('result');
        const resultContent = document.getElementById('resultContent');

        if (!resultElement || !resultContent) return;

        let content = '';

        if (data.mowenResult && data.mowenResult.noteId) {
            const statusIcon = data.autoPublish ? '✅' : '📝';
            const statusText = data.autoPublish ? '笔记创建并公开发布成功' : '笔记创建并私有发布成功';

            content += `<div style="margin-bottom: 16px;">
                <strong>${statusIcon} ${statusText}</strong><br>
                <small>笔记ID: ${data.mowenResult.noteId}</small>
            </div>`;
        }

        if (data.aiResult) {
            const processingMode = data.fullTextMode ? '全文整理' : '内容总结';
            content += `<div style="margin-bottom: 16px;">
                <strong>🤖 AI${processingMode}结果:</strong><br>
                <small>标题: ${data.aiResult.title || '无标题'}</small><br>
                <small>段落数: ${data.aiResult.paragraphs ? data.aiResult.paragraphs.length : 0}</small><br>
                <small>标签: ${data.aiResult.tags ? data.aiResult.tags.join(', ') : '无'}</small>
            </div>`;
        }

        if (data.summary) {
            content += `<div style="margin-bottom: 15px;">
                ${data.summary}
            </div>`;
        }

        if (data.noteUrl) {
            content += `<div style="margin-bottom: 15px;">
                <strong>✅ 发布成功！</strong><br>
                <a href="${data.noteUrl}" target="_blank" style="color: #5e72e4; text-decoration: none;">
                    📝 查看笔记
                </a>
            </div>`;
        }

        if (data.wordCount) {
            content += `<div style="color: #6c757d; font-size: 12px;">
                📊 字数统计: ${data.wordCount} 字
            </div>`;
        }

        if (!content) {
            content += `<div style="font-size: 12px; color: #666;">
                处理时间: ${new Date().toLocaleString()}
            </div>`;
        }

        resultContent.innerHTML = content;
        resultElement.style.display = 'block';

        // 隐藏进度和状态
        this.hideProgress();
        const statusElement = document.getElementById('status');
        if (statusElement) {
            statusElement.style.display = 'none';
        }
    }

    /**
     * 隐藏结果
     */
    hideResult() {
        const resultElement = document.getElementById('result');
        if (resultElement) {
            resultElement.style.display = 'none';
        }
    }

    /**
     * 显示帮助
     */
    showHelp() {
        const helpContent = `
        <div style="line-height: 1.6;">
            <h3 style="margin-bottom: 15px; color: #2d3748;">📖 使用帮助</h3>
            
            <div style="margin-bottom: 15px;">
                <strong>🎯 侧边栏模式特点：</strong>
                <ul style="margin: 8px 0; padding-left: 20px;">
                    <li>点击页面其他位置不会关闭</li>
                    <li>自动跟踪页面切换</li>
                    <li>支持长时间任务处理</li>
                    <li>可切换回弹窗模式</li>
                </ul>
            </div>

            <div style="margin-bottom: 15px;">
                <strong>🚀 基本使用：</strong>
                <ol style="margin: 8px 0; padding-left: 20px;">
                    <li>确保已在设置页面配置API密钥</li>
                    <li>选择发布模式（公开/私有）</li>
                    <li>选择处理模式（总结/全文整理）</li>
                    <li>点击"提取并发布"按钮</li>
                </ol>
            </div>

            <div style="margin-bottom: 15px;">
                <strong>⚙️ 任务控制：</strong>
                <ul style="margin: 8px 0; padding-left: 20px;">
                    <li><kbd>取消任务</kbd> - 停止正在进行的任务</li>
                    <li><kbd>Ctrl+Shift+R</kbd> - 强制重置所有状态</li>
                    <li>三击页面标题 - 快速重置</li>
                </ul>
            </div>

            <div style="background: #e3f2fd; padding: 12px; border-radius: 8px; margin-top: 15px;">
                <strong>💡 提示：</strong> 侧边栏模式下，即使切换页面或关闭侧边栏，后台任务仍会继续执行。
            </div>
        </div>
        `;

        this.showResult({ summary: helpContent });
    }

    /**
     * 显示反馈
     */
    showFeedback() {
        const feedbackContent = `
        <div style="line-height: 1.6; text-align: center;">
            <h3 style="margin-bottom: 15px; color: #2d3748;">💬 意见反馈</h3>
            <p style="margin-bottom: 20px; color: #6c757d;">
                您的反馈对我们很重要！
            </p>
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <a href="mailto:support@mowen.cn" style="color: #5e72e4; text-decoration: none; padding: 8px; background: #f8f9fa; border-radius: 6px;">
                    📧 发送邮件反馈
                </a>
                <a href="https://github.com/mowen-cn/mowen-plugin/issues" target="_blank" style="color: #5e72e4; text-decoration: none; padding: 8px; background: #f8f9fa; border-radius: 6px;">
                    🐛 GitHub Issues
                </a>
            </div>
        </div>
        `;

        this.showResult({ summary: feedbackContent });
    }

    /**
     * 调试内容脚本
     */
    async debugContentScript() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                console.error('无法获取当前标签页');
                return;
            }

            console.log('=== 开始调试内容脚本 ===');
            console.log('当前标签页:', tab);
            console.log('页面URL:', tab.url);
            console.log('页面标题:', tab.title);

            // 检查页面是否可以注入脚本
            const canInject = this.canInjectScript(tab.url);
            console.log('是否可以注入脚本:', canInject);

            if (!canInject) {
                console.error('当前页面不支持脚本注入');
                return;
            }

            // 尝试手动注入内容脚本（作为备用方案）
            try {
                console.log('尝试手动注入内容脚本...');
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js']
                });
                console.log('手动注入成功');
            } catch (injectError) {
                console.log('手动注入失败（可能已存在）:', injectError.message);
            }

            // 等待一段时间
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 测试 ping
            console.log('测试 ping...');
            const pingResult = await this.checkContentScriptReady(tab.id);
            console.log('Ping 结果:', pingResult);

            if (!pingResult) {
                console.error('内容脚本未响应 ping');
                return;
            }

            // 测试内容提取
            console.log('测试内容提取...');
            const extractResult = await new Promise((resolve) => {
                chrome.tabs.sendMessage(tab.id, { action: 'extractContent' }, (response) => {
                    if (chrome.runtime.lastError) {
                        resolve({ error: chrome.runtime.lastError.message });
                    } else {
                        resolve(response);
                    }
                });
            });

            console.log('内容提取结果:', extractResult);

            if (extractResult.success) {
                console.log('✅ 内容脚本工作正常');
                console.log('提取的内容:', extractResult.data);
            } else {
                console.error('❌ 内容提取失败:', extractResult.error);
            }

            console.log('=== 调试完成 ===');

        } catch (error) {
            console.error('调试过程中发生错误:', error);
        }
    }
}

// 初始化侧边栏控制器
document.addEventListener('DOMContentLoaded', () => {
    new SidePanelController();
});