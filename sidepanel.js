// 侧边栏脚本 - 继承自PopupController
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

        // 初始化自定义提示词
        await this.initCustomPrompt();

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
        // 添加标签页切换监听
        this.setupTabChangeListener();

        // 添加页面可见性监听
        this.setupVisibilityListener();

        // 添加页面卸载清理
        this.setupUnloadListener();
    }

    /**
     * 设置标签页切换监听器
     */
    setupTabChangeListener() {
        // 存储当前标签页ID和URL
        this.currentTabId = null;
        this.currentTabUrl = null;

        // 定期检查当前活动标签页和URL是否改变
        this.tabCheckInterval = setInterval(async() => {
            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tab) return;

                // 检查标签页ID或URL是否发生变化
                const tabChanged = tab.id !== this.currentTabId;
                const urlChanged = tab.url !== this.currentTabUrl;

                if (tabChanged || urlChanged) {
                    // 如果只是URL变化（同一标签页内导航），使用轻量级更新
                    if (!tabChanged && urlChanged) {
                        await this.handleUrlChange(tab);
                    } else {
                        // 标签页切换，使用完整的处理流程
                        await this.handleTabChange(tab);
                    }

                    // 更新记录的标签页信息
                    this.currentTabId = tab.id;
                    this.currentTabUrl = tab.url;
                }
            } catch (error) {
                console.error('检查标签页切换失败:', error);
            }
        }, 500); // 提高检查频率到500ms，更快响应URL变化
    }

    /**
     * 处理URL变化（同一标签页内导航）
     */
    async handleUrlChange(tab) {
        try {
            // 如果有正在进行的任务，保持任务状态但清理页面数据缓存
            if (this.isTaskRunning) {
                // 清理页面数据缓存，但保留任务状态
                this.currentPageData = null;

                // 更新页面信息显示但不重置任务
                await this.updatePageInfoOnly(tab);

                this.showStatus('页面已导航，任务继续在后台进行', 'info');
                return;
            }

            // 没有运行中的任务，正常更新页面信息
            await this.updatePageInfoOnly(tab);

        } catch (error) {
            console.error('处理URL变化失败:', error);
            this.showStatus('页面信息更新失败: ' + error.message, 'error');
        }
    }

    /**
     * 仅更新页面信息显示（不重置任务状态）
     */
    async updatePageInfoOnly(tab) {
        try {
            // 清理旧的页面数据缓存
            this.currentPageData = null;

            // 清理可能存在的帮助信息
            this.clearPageTypeHelp();

            // 更新页面标题和URL显示
            const pageTitle = document.getElementById('pageTitle');
            const pageUrl = document.getElementById('pageUrl');

            if (pageTitle) pageTitle.textContent = tab.title || '正在加载...';
            if (pageUrl) pageUrl.textContent = tab.url || '';

            // 检查是否可以在当前页面注入脚本
            if (!this.canInjectScript(tab.url)) {
                this.showStatus('当前页面不支持内容提取', 'warning');
                const extractBtn = document.getElementById('extractBtn');
                if (extractBtn && !this.isTaskRunning) {
                    extractBtn.disabled = true;
                    extractBtn.title = '当前页面不支持内容提取';
                }
                this.showPageTypeHelp(tab.url);
                return;
            }

            // 页面支持内容提取，重新启用提取按钮（如果没有任务在运行）
            if (!this.isTaskRunning) {
                const extractBtn = document.getElementById('extractBtn');
                if (extractBtn) {
                    // 只有在配置完整的情况下才启用按钮
                    const config = await this.getStoredConfig();
                    if (this.validateConfig(config)) {
                        extractBtn.disabled = false;
                        extractBtn.title = '';
                    }
                }
            }

            // 后台异步提取页面内容，不阻塞UI更新
            this.extractPageContentInBackground(tab.id);

        } catch (error) {
            console.error('更新页面信息失败:', error);
            this.showStatus('更新页面信息失败: ' + error.message, 'error');
        }
    }

    /**
     * 后台异步提取页面内容
     */
    async extractPageContentInBackground(tabId) {
        try {
            // 延迟一点时间，让页面完全加载
            setTimeout(async() => {
                try {
                    await this.extractPageContent(tabId);
                } catch (error) {
                    // 不显示错误状态，因为这是后台操作
                }
            }, 1000); // 1秒延迟，确保页面加载完成
        } catch (error) {
            }
    }

    /**
     * 设置页面可见性监听器
     */
    setupVisibilityListener() {
        // 当侧边栏重新变为可见时，刷新页面信息
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.refreshPageInfo();
            }
        });
    }

    /**
     * 处理标签页切换
     */
    async handleTabChange(newTab) {
        // 检查当前是否有正在进行的任务
        const hasRunningTask = this.isTaskRunning;
        const currentTaskId = this.taskId;

        if (hasRunningTask) {
            // 显示任务保留提示
            this.showStatus('任务将在后台继续进行，切换回原标签页可查看进度', 'info');

            // 只停止当前轮询，但保留任务状态
            if (this.currentPollInterval) {
                clearInterval(this.currentPollInterval);
                this.currentPollInterval = null;
            }

            // 隐藏进度UI，但不重置任务状态
            this.hideProgress();

            // 重置页面数据和UI，但保留任务相关状态
            this.currentPageData = null;
            this.hideResult();

            // 更新页面信息显示
            const pageTitle = document.getElementById('pageTitle');
            const pageUrl = document.getElementById('pageUrl');
            if (pageTitle) pageTitle.textContent = '正在加载页面信息...';
            if (pageUrl) pageUrl.textContent = '';

        } else {
            // 没有运行中的任务，正常重置状态
            this.resetSidePanelState();
        }

        // 重新加载页面信息
        await this.loadPageInfo();

        // 检查新标签页是否有正在运行的任务
        await this.checkRunningTask();

        // 如果从有任务的标签页切换到无任务的标签页，显示提示
        if (hasRunningTask && !this.isTaskRunning) {
            this.showStatus('已切换到新页面，原页面任务在后台继续', 'info');
        }
    }

    /**
     * 重置侧边栏状态
     */
    resetSidePanelState() {
        // 清理帮助信息
        this.clearPageTypeHelp();

        // 停止当前轮询
        if (this.currentPollInterval) {
            clearInterval(this.currentPollInterval);
            this.currentPollInterval = null;
        }

        // 重置任务状态
        this.isTaskRunning = false;
        this.taskId = null;
        this.currentPageData = null;

        // 隐藏进度和结果
        this.hideProgress();
        this.hideResult();

        // 重置按钮状态
        const extractBtn = document.getElementById('extractBtn');
        const cancelBtn = document.getElementById('cancelBtn');
        const previewBtn = document.getElementById('previewBtn');
        const diagnoseBtn = document.getElementById('diagnoseBtn');

        if (extractBtn) {
            extractBtn.disabled = false;
            extractBtn.style.display = 'flex';
        }
        if (cancelBtn) cancelBtn.style.display = 'none';
        if (previewBtn) previewBtn.style.display = 'none';
        if (diagnoseBtn) diagnoseBtn.style.display = 'none';

        // 清空状态信息
        this.showStatus('', 'info');

        // 清空页面信息（临时显示加载中）
        const pageTitle = document.getElementById('pageTitle');
        const pageUrl = document.getElementById('pageUrl');
        if (pageTitle) pageTitle.textContent = '正在加载页面信息...';
        if (pageUrl) pageUrl.textContent = '';
    }

    /**
     * 刷新页面信息
     */
    async refreshPageInfo() {
        try {
            // 重置状态
            this.resetSidePanelState();

            // 重新加载页面信息
            await this.loadPageInfo();

            // 检查是否有正在运行的任务
            await this.checkRunningTask();

        } catch (error) {
            console.error('刷新页面信息失败:', error);
            this.showStatus('刷新页面信息失败: ' + error.message, 'error');
        }
    }

    /**
     * 清理资源
     */
    cleanup() {
        if (this.tabCheckInterval) {
            clearInterval(this.tabCheckInterval);
            this.tabCheckInterval = null;
        }

        if (this.currentPollInterval) {
            clearInterval(this.currentPollInterval);
            this.currentPollInterval = null;
        }
    }

    /**
     * 切换到弹窗模式
     */
    async toggleToPopupMode() {
        try {
            // 获取当前标签页
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                console.error('无法获取当前标签页');
                this.showStatus('无法获取当前标签页', 'error');
                return;
            }
            this.showStatus('正在切换到弹窗模式...', 'info');

            // 直接在用户手势同步上下文中操作，避免通过background script
            // 1. 设置popup
            await chrome.action.setPopup({ popup: 'popup.html' });
            // 2. 立即打开popup（在用户手势上下文中）
            try {
                if (chrome.action.openPopup) {
                    await chrome.action.openPopup();
                } else {
                    // 备用方案：创建popup窗口
                    const popupWindow = await chrome.windows.create({
                        url: chrome.runtime.getURL('popup.html'),
                        type: 'popup',
                        width: 400,
                        height: 600,
                        focused: true
                    });
                }

                this.showStatus('已切换到弹窗模式', 'success');
                // 注意：侧边栏可能不会自动关闭，这是Chrome的行为
                // 用户可能需要手动关闭侧边栏或者重新点击扩展图标

            } catch (openError) {
                console.error('打开popup失败:', openError);
                this.showStatus('popup已设置，请点击扩展图标打开', 'info');
            }

        } catch (error) {
            console.error('切换模式失败:', error);
            this.showStatus('切换模式失败: ' + error.message, 'error');
        }
    }

    // 以下方法继承自PopupController，保持相同的功能

    /**
     * 等待DOM元素准备就绪
     */
    async waitForDOM() {
        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 100;

            const checkDOM = () => {
                const autoPublishToggle = document.getElementById('autoPublishToggle');
                const fullTextModeToggle = document.getElementById('fullTextModeToggle');
                const generateTagsToggle = document.getElementById('generateTagsToggle');
                const extractBtnText = document.getElementById('extractBtnText');
                const extractBtn = document.getElementById('extractBtn');

                if (autoPublishToggle && fullTextModeToggle && generateTagsToggle && extractBtnText && extractBtn) {
                    resolve();
                } else {
                    attempts++;
                    if (attempts < maxAttempts) {
                        setTimeout(checkDOM, 10);
                    } else {
                        console.error('等待DOM超时，但继续初始化');
                        resolve();
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
        const extractBtn = document.getElementById('extractBtn');
        if (extractBtn) {
            extractBtn.addEventListener('click', () => {
                this.handleExtractAndPublish();
            });
        } else {}

        // 设置按钮
        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                chrome.runtime.openOptionsPage();
            });
        } else {}

        // 模式切换按钮
        const toggleModeBtn = document.getElementById('toggleModeBtn');
        if (toggleModeBtn) {
            toggleModeBtn.addEventListener('click', () => {
                this.toggleToPopupMode();
            });
        } else {}

        // 关闭结果按钮
        const closeResult = document.getElementById('closeResult');
        if (closeResult) {
            closeResult.addEventListener('click', () => {
                this.hideResult();
            });
        }

        // 自动发布开关
        const autoPublishToggle = document.getElementById('autoPublishToggle');
        if (autoPublishToggle) {
            autoPublishToggle.addEventListener('change', (e) => {
                this.updateButtonText();
            });
        }

        // 全文整理模式开关
        const fullTextModeToggle = document.getElementById('fullTextModeToggle');
        if (fullTextModeToggle) {
            fullTextModeToggle.addEventListener('change', (e) => {
                this.updateButtonText();
            });
        }

        // 生成标签开关
        const generateTagsToggle = document.getElementById('generateTagsToggle');
        if (generateTagsToggle) {
            generateTagsToggle.addEventListener('change', (e) => {
                this.updateButtonText();
            });
        }

        // 自定义提示词输入框
        const customPromptInput = document.getElementById('customPromptInput');
        if (customPromptInput) {
            // 字符计数功能
            customPromptInput.addEventListener('input', (e) => {
                this.updateCharCount(e.target.value);
                this.saveCustomPrompt(e.target.value);
            });

            // 初始化字符计数
            this.updateCharCount(customPromptInput.value);
        }

        // 帮助链接
        const helpLink = document.getElementById('helpLink');
        if (helpLink) {
            helpLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.showHelp();
            });
        }

        // 诊断按钮
        const diagnoseBtn = document.getElementById('diagnoseBtn');
        if (diagnoseBtn) {
            diagnoseBtn.addEventListener('click', () => {
                this.runDiagnosis();
            });
        }

        // 取消任务按钮
        const cancelBtn = document.getElementById('cancelBtn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.handleCancelTask();
            });
        }

    }

    // 其他方法直接复制自popup.js，确保功能一致
    async loadPageInfo() {
        try {
            // 首先清理可能存在的帮助信息
            this.clearPageTypeHelp();

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                this.showStatus('无法获取当前页面信息', 'error');
                return;
            }

            // 记录当前标签页ID和URL
            this.currentTabId = tab.id;
            this.currentTabUrl = tab.url;

            if (!this.canInjectScript(tab.url)) {
                this.showStatus('当前页面不支持内容提取', 'warning');
                const extractBtn = document.getElementById('extractBtn');
                if (extractBtn) {
                    extractBtn.disabled = true;
                    extractBtn.title = '当前页面不支持内容提取';
                }
                this.showPageTypeHelp(tab.url);
                return;
            }

            // 页面支持内容提取，重新启用提取按钮（如果之前被禁用了）
            const extractBtn = document.getElementById('extractBtn');
            if (extractBtn) {
                // 只有在配置完整的情况下才启用按钮
                const config = await this.getStoredConfig();
                if (this.validateConfig(config)) {
                    extractBtn.disabled = false;
                    extractBtn.title = '';
                }
            }

            document.getElementById('pageTitle').textContent = tab.title || '无标题';
            document.getElementById('pageUrl').textContent = tab.url || '';
            this.extractPageContent(tab.id);

        } catch (error) {
            console.error('加载页面信息失败:', error);
            this.showStatus('加载页面信息失败: ' + error.message, 'error');
        }
    }

    /**
     * 清理页面类型帮助信息
     */
    clearPageTypeHelp() {
        const existingHelpElements = document.querySelectorAll('.help-message');
        existingHelpElements.forEach((element, index) => {
            element.remove();
        });
    }

    showPageTypeHelp(url) {
        // 先清理可能存在的帮助信息（防止重复显示）
        this.clearPageTypeHelp();

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

    async extractPageContent(tabId, retryCount = 0) {
        const maxRetries = 3;

        try {
            const isReady = await this.checkContentScriptReady(tabId);
            if (!isReady) {
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tabId },
                        files: ['content.js']
                    });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    const isReadyAfterInject = await this.checkContentScriptReady(tabId);
                    if (!isReadyAfterInject && retryCount < maxRetries) {
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

            chrome.tabs.sendMessage(tabId, { action: 'extractContent' }, (response) => {
                if (chrome.runtime.lastError) {
                    const errorMsg = chrome.runtime.lastError.message || chrome.runtime.lastError.toString();
                    console.error('发送消息失败:', errorMsg);

                    if ((errorMsg.includes('Could not establish connection') ||
                            errorMsg.includes('Receiving end does not exist')) &&
                        retryCount < maxRetries) {
                        setTimeout(() => {
                            this.extractPageContent(tabId, retryCount + 1);
                        }, 1000);
                    } else if (retryCount < maxRetries) {
                        setTimeout(() => {
                            this.extractPageContent(tabId, retryCount + 1);
                        }, 1000);
                    } else {
                        this.showStatus(`无法获取页面内容: ${errorMsg}`, 'error');
                    }
                    return;
                }

                if (response && response.success) {
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
                setTimeout(() => {
                    this.extractPageContent(tabId, retryCount + 1);
                }, 1000);
            } else {
                this.showStatus('无法提取页面内容: ' + error.message, 'error');
            }
        }
    }

    async checkContentScriptReady(tabId) {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                resolve(false);
            }, 2000);

            chrome.tabs.sendMessage(tabId, { action: 'ping' }, (response) => {
                clearTimeout(timeout);
                if (chrome.runtime.lastError) {
                    const error = chrome.runtime.lastError.message;
                    if (error.includes('Could not establish connection') ||
                        error.includes('Receiving end does not exist')) {}
                    resolve(false);
                } else {
                    resolve(true);
                }
            });
        });
    }

    canInjectScript(url) {
        if (!url) return false;
        const restrictedProtocols = [
            'chrome://', 'chrome-extension://', 'moz-extension://',
            'edge://', 'about:', 'data:', 'file://'
        ];
        const restrictedDomains = [
            'chrome.google.com/webstore', 'addons.mozilla.org',
            'microsoftedge.microsoft.com'
        ];
        for (const protocol of restrictedProtocols) {
            if (url.startsWith(protocol)) return false;
        }
        for (const domain of restrictedDomains) {
            if (url.includes(domain)) return false;
        }
        return true;
    }

    async checkConfiguration() {
        try {
            const config = await this.getStoredConfig();
            if (!this.validateConfig(config)) {
                this.showStatus('请先在设置页面配置API密钥', 'error');
                const extractBtn = document.getElementById('extractBtn');
                const diagnoseBtn = document.getElementById('diagnoseBtn');
                if (extractBtn) extractBtn.disabled = true;
                if (diagnoseBtn) diagnoseBtn.style.display = 'flex';
                return;
            }
            this.showStatus('配置检查通过', 'success');
            const extractBtn = document.getElementById('extractBtn');
            if (extractBtn) extractBtn.disabled = false;
        } catch (error) {
            console.error('检查配置失败:', error);
            this.showStatus('检查配置失败: ' + error.message, 'error');
        }
    }

    async getStoredConfig() {
        return new Promise((resolve) => {
            chrome.storage.sync.get([
                'aiApiUrl', 'aiApiKey', 'aiModel', 'mowenApiKey'
            ], (result) => {
                resolve(result);
            });
        });
    }

    validateConfig(config) {
        return config.aiApiUrl && config.aiApiKey &&
            config.aiModel && config.mowenApiKey;
    }

    async loadPublishSettings() {
        try {
            const result = await this.getPublishSettings();
            const { autoPublish, fullTextMode, generateTags } = result;

            const autoPublishToggle = document.getElementById('autoPublishToggle');
            const fullTextModeToggle = document.getElementById('fullTextModeToggle');
            const generateTagsToggle = document.getElementById('generateTagsToggle');

            if (autoPublishToggle) autoPublishToggle.checked = autoPublish;
            if (fullTextModeToggle) fullTextModeToggle.checked = fullTextMode;
            if (generateTagsToggle) generateTagsToggle.checked = generateTags;

            this.updateButtonText();
        } catch (error) {
            console.error('加载发布设置失败:', error);
        }
    }

    async getPublishSettings() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['autoPublish', 'fullTextMode', 'generateTags'], (result) => {
                resolve(result);
            });
        });
    }

    async savePublishSettings(autoPublish, fullTextMode, generateTags) {
        return new Promise((resolve) => {
            chrome.storage.local.set({ autoPublish, fullTextMode, generateTags }, () => {
                resolve();
            });
        });
    }

    updateButtonText() {
        const btnText = document.getElementById('extractBtnText');
        const autoPublishToggle = document.getElementById('autoPublishToggle');
        const fullTextModeToggle = document.getElementById('fullTextModeToggle');
        const generateTagsToggle = document.getElementById('generateTagsToggle');

        if (btnText && autoPublishToggle && fullTextModeToggle && generateTagsToggle) {
            const autoPublish = autoPublishToggle.checked;
            const fullTextMode = fullTextModeToggle.checked;
            const generateTags = generateTagsToggle.checked;

            let buttonText = '';
            if (fullTextMode) {
                buttonText = autoPublish ? '整理全文并发布为公开笔记' : '整理全文并发布为私有笔记';
            } else {
                buttonText = autoPublish ? '生成总结并发布为公开笔记' : '生成总结并发布为私有笔记';
            }
            btnText.textContent = buttonText;
            this.savePublishSettings(autoPublish, fullTextMode, generateTags);
        }
    }

    // 继续添加其他必要的方法...
    showStatus(message, type = 'info') {
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.className = `status ${type}`;
            if (type === 'success') {
                setTimeout(() => {
                    statusEl.style.display = 'none';
                }, 3000);
            }
        }
    }

    showProgress(text = '正在处理...') {
        const progressEl = document.getElementById('progress');
        const progressText = document.getElementById('progress').querySelector('.progress-text');
        const cancelBtn = document.getElementById('cancelBtn');

        if (progressText) progressText.textContent = text;
        if (progressEl) progressEl.style.display = 'block';
        if (cancelBtn) cancelBtn.style.display = 'flex';
    }

    hideProgress() {
        const progressEl = document.getElementById('progress');
        const cancelBtn = document.getElementById('cancelBtn');
        if (progressEl) progressEl.style.display = 'none';
        if (cancelBtn) cancelBtn.style.display = 'none';
    }

    showResult(data) {
        const resultEl = document.getElementById('result');
        const resultContent = document.getElementById('resultContent');
        if (!resultEl || !resultContent) return;

        let html = '';
        if (data.mowenResult && data.mowenResult.noteId) {
            const statusIcon = data.autoPublish ? '✅' : '📝';
            const statusText = data.autoPublish ? '笔记创建并公开发布成功' : '笔记创建并私有发布成功';
            html += `<div style="margin-bottom: 16px;">
                <strong>${statusIcon} ${statusText}</strong><br>
                <small>笔记ID: ${data.mowenResult.noteId}</small>
            </div>`;
        }
        if (data.aiResult) {
            const processingMode = data.fullTextMode ? '全文整理' : '内容总结';
            html += `<div style="margin-bottom: 16px;">
                <strong>🤖 AI${processingMode}结果:</strong><br>
                <small>标题: ${data.aiResult.title || '无标题'}</small><br>
                <small>段落数: ${data.aiResult.paragraphs ? data.aiResult.paragraphs.length : 0}</small><br>
                <small>标签: ${data.aiResult.tags ? data.aiResult.tags.join(', ') : '无'}</small>
            </div>`;
        }
        html += `<div style="font-size: 12px; color: #666;">
            处理时间: ${new Date().toLocaleString()}
        </div>`;

        resultContent.innerHTML = html;
        resultEl.style.display = 'block';
    }

    hideResult() {
        const resultEl = document.getElementById('result');
        if (resultEl) resultEl.style.display = 'none';
    }

    showHelp() {
        const helpContent = {
            '核心功能': [
                '智能内容提取：自动识别网页主要内容',
                'AI整理优化：使用AI对内容进行格式化和结构优化',
                '一键发布：直接发布到墨问笔记平台'
            ],
            '处理模式': [
                '总结模式：提取文章要点，适合长文快速阅读',
                '全文整理模式：保留完整内容，优化格式和结构'
            ],
            '发布设置': [
                '公开笔记：发布后其他用户可见',
                '私有笔记：仅自己可见的私密内容',
                '生成标签：AI自动为内容生成1-3个相关标签，便于分类管理'
            ],
            '自定义提示词': [
                '输入额外的指导信息来定制AI处理结果',
                '例如："请重点关注技术细节"、"使用专业术语"等',
                '字数限制：500字符以内',
                '只有输入内容时才会影响AI处理'
            ],
            '任务管理': [
                '任务在后台运行，可自由切换标签页',
                '使用"取消任务"按钮停止进行中的任务',
                '强制重置：三击页面标题清除异常状态'
            ],
            '支持的页面': [
                '新闻文章、博客文章、技术文档',
                '学术论文、产品介绍页面',
                '不支持Chrome内部页面和应用商店页面'
            ]
        };

        this.showHelpModal(helpContent);
    }

    /**
     * 显示自定义帮助弹框
     * @param {Object} content - 帮助内容对象
     */
    showHelpModal(content) {
            const modal = document.getElementById('helpModal');
            const modalBody = document.getElementById('helpModalBody');

            if (!modal || !modalBody) {
                console.error('帮助弹框元素未找到');
                return;
            }

            // 生成HTML内容
            let html = '';
            Object.entries(content).forEach(([sectionTitle, items]) => {
                        html += `
                <div class="help-section">
                    <div class="help-section-title">${sectionTitle}</div>
                    <ul class="help-list">
                        ${items.map(item => `<li>${item}</li>`).join('')}
                    </ul>
                </div>
            `;
        });

        modalBody.innerHTML = html;

        // 显示弹框
        modal.classList.add('show');

        // 绑定关闭事件（如果还没有绑定）
        this.bindHelpModalEvents();
    }

    /**
     * 绑定帮助弹框事件
     */
    bindHelpModalEvents() {
        const modal = document.getElementById('helpModal');
        const closeBtn = document.getElementById('helpModalClose');

        if (!modal || !closeBtn) return;

        // 避免重复绑定
        if (modal.dataset.eventsBinds) return;

        // 点击关闭按钮
        closeBtn.addEventListener('click', () => {
            this.hideHelpModal();
        });

        // 点击遮罩层关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.hideHelpModal();
            }
        });

        // ESC键关闭
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('show')) {
                this.hideHelpModal();
            }
        });

        // 标记已绑定事件
        modal.dataset.eventsBinds = 'true';
    }

    /**
     * 隐藏帮助弹框
     */
    hideHelpModal() {
        const modal = document.getElementById('helpModal');
        if (modal) {
            modal.classList.remove('show');
        }
    }

    showFeedback() {
        const feedbackContent = `如有问题或建议，请通过以下方式联系：

1. GitHub Issues：报告bug和功能请求
2. 邮箱反馈：发送详细的问题描述
3. 墨问社区：与其他用户交流使用经验

感谢您使用墨问笔记助手！`;

        alert(feedbackContent);
    }

    async runDiagnosis() {
        this.showProgress('正在诊断问题...');

        try {
            const config = await this.getStoredConfig();
            let diagnosticResults = [];

            // 检查配置完整性
            diagnosticResults.push('🔍 配置检查:');
            if (!config.aiApiUrl) {
                diagnosticResults.push('❌ AI API地址未配置');
            } else {
                try {
                    new URL(config.aiApiUrl);
                    diagnosticResults.push('✅ AI API地址格式正确');
                } catch {
                    diagnosticResults.push('❌ AI API地址格式错误');
                }
            }

            if (!config.aiApiKey) {
                diagnosticResults.push('❌ AI API密钥未配置');
            } else if (config.aiApiKey.length < 10) {
                diagnosticResults.push('❌ AI API密钥格式可能不正确');
            } else {
                diagnosticResults.push('✅ AI API密钥已配置');
            }

            if (!config.aiModel) {
                diagnosticResults.push('❌ AI模型未配置');
            } else {
                diagnosticResults.push('✅ AI模型已配置: ' + config.aiModel);
            }

            if (!config.mowenApiKey) {
                diagnosticResults.push('❌ 墨问API密钥未配置');
            } else if (config.mowenApiKey.length < 10) {
                diagnosticResults.push('❌ 墨问API密钥格式可能不正确');
            } else {
                diagnosticResults.push('✅ 墨问API密钥已配置');
            }

            // 检查当前页面
            diagnosticResults.push('');
            diagnosticResults.push('📄 当前页面检查:');

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                const canInject = this.canInjectScript(tab.url);
                diagnosticResults.push(`• URL: ${tab.url.substring(0, 60)}...`);
                diagnosticResults.push(`• 可注入脚本: ${canInject ? '✅' : '❌'}`);
            }

            if (this.currentPageData) {
                diagnosticResults.push('✅ 页面内容已提取');
                diagnosticResults.push(`📝 内容长度: ${this.currentPageData.content ? this.currentPageData.content.length : 0} 字符`);
            } else {
                diagnosticResults.push('❌ 页面内容未提取');
            }

            this.hideProgress();
            this.showDiagnosticResult(diagnosticResults.join('\n'));

        } catch (error) {
            this.hideProgress();
            this.showStatus('诊断失败: ' + error.message, 'error');
        }
    }

    showDiagnosticResult(results) {
        const resultEl = document.getElementById('result');
        const resultContent = document.getElementById('resultContent');

        if (resultContent) {
            resultContent.innerHTML = `
                <div style="font-family: monospace; white-space: pre-line; font-size: 12px; line-height: 1.6;">
                    ${results}
                </div>
                <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #eee;">
                    <strong>💡 解决建议:</strong><br>
                    • 如果配置项显示❌，请前往设置页面完善配置<br>
                    • 如果API连接失败，请检查密钥是否正确<br>
                    • 如果页面内容未提取，请刷新页面后重试<br>
                    • 确保墨问账户为Pro会员状态
                </div>
            `;
        }

        if (resultEl) {
            resultEl.style.display = 'block';
        }
    }

    async handleExtractAndPublish() {
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

            // 检查是否可以在当前页面注入脚本
            if (!this.canInjectScript(tab.url)) {
                this.showStatus('当前页面不支持内容提取', 'error');
                return;
            }

            // 显示正在提取页面内容的提示
            this.showStatus('正在重新获取页面内容...', 'info');

            // 强制重新提取当前页面内容，确保获取最新数据
            await this.forceRefreshPageContent(tab.id);

            // 验证页面内容是否成功获取
            if (!this.currentPageData) {
                this.showStatus('无法获取页面内容，请刷新页面后重试', 'error');
                return;
            }

            // 验证页面内容是否匹配当前标签页
            if (this.currentPageData.url && this.currentPageData.url !== tab.url) {
                await this.forceRefreshPageContent(tab.id);

                if (!this.currentPageData || this.currentPageData.url !== tab.url) {
                    this.showStatus('页面内容获取异常，请重试', 'error');
                    return;
                }
            }

            // 获取当前设置
            const autoPublishToggle = document.getElementById('autoPublishToggle');
            const fullTextModeToggle = document.getElementById('fullTextModeToggle');
            const generateTagsToggle = document.getElementById('generateTagsToggle');
            const customPromptInput = document.getElementById('customPromptInput');

            if (!autoPublishToggle || !fullTextModeToggle || !generateTagsToggle || !customPromptInput) {
                console.error('设置元素未找到');
                this.showStatus('界面初始化失败，请重新打开插件', 'error');
                return;
            }

            const autoPublish = autoPublishToggle.checked;
            const fullTextMode = fullTextModeToggle.checked;
            const generateTags = generateTagsToggle.checked;
            const customPrompt = customPromptInput.value.trim();

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

            // 显示任务执行中的提示信息
            this.showTaskStartNotice();

            // 禁用按钮
            const extractBtn = document.getElementById('extractBtn');
            if (extractBtn) {
                extractBtn.disabled = true;
            }

            // 添加页面内容时间戳，用于调试
            const contentWithTimestamp = {
                ...this.currentPageData,
                extractTime: Date.now(),
                tabId: tab.id
            };

            // 发送到后台脚本处理
            chrome.runtime.sendMessage({
                action: 'processContent',
                taskId: this.taskId,
                tabId: tab.id,
                data: contentWithTimestamp,
                settings: {
                    autoPublish: autoPublish,
                    fullTextMode: fullTextMode,
                    generateTags: generateTags,
                    customPrompt: customPrompt
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
     * 强制刷新页面内容
     * @param {number} tabId - 标签页ID
     * @returns {Promise<void>}
     */
    async forceRefreshPageContent(tabId) {
        try {
            // 清除现有缓存的页面数据
            this.currentPageData = null;

            // 重新提取页面内容，使用更短的超时时间
            await this.extractPageContentSync(tabId);

        } catch (error) {
            console.error('强制刷新页面内容失败:', error);
            throw error;
        }
    }

    /**
     * 同步方式提取页面内容
     * @param {number} tabId - 标签页ID
     * @returns {Promise<void>}
     */
    async extractPageContentSync(tabId) {
        return new Promise(async (resolve, reject) => {
            try {
                // 设置超时
                const timeout = setTimeout(() => {
                    reject(new Error('页面内容提取超时'));
                }, 5000);

                // 检查content script是否准备就绪
                const isReady = await this.checkContentScriptReady(tabId);
                if (!isReady) {
                    try {
                        await chrome.scripting.executeScript({
                            target: { tabId: tabId },
                            files: ['content.js']
                        });
                        // 给脚本一点时间初始化
                        await new Promise(resolve => setTimeout(resolve, 500));
                    } catch (injectError) {
                        clearTimeout(timeout);
                        reject(new Error('无法注入内容脚本: ' + injectError.message));
                        return;
                    }
                }

                // 发送消息获取内容
                chrome.tabs.sendMessage(tabId, { action: 'extractContent' }, (response) => {
                    clearTimeout(timeout);

                    if (chrome.runtime.lastError) {
                        reject(new Error('获取页面内容失败: ' + chrome.runtime.lastError.message));
                        return;
                    }

                    if (response && response.success) {
                        this.currentPageData = response.data;
                        resolve();
                    } else {
                        const errorMsg = response ? (response.error || '未知错误') : '无响应';
                        reject(new Error('提取页面内容失败: ' + errorMsg));
                    }
                });

            } catch (error) {
                reject(error);
            }
        });
    }

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

    startTaskPolling(tabId, initialTaskAge = 0) {
        const POLLING_TIMEOUT = 10 * 60 * 1000; // 10分钟轮询超时
        const startTime = Date.now();
        let pollCount = 0;

        const pollInterval = setInterval(async() => {
            try {
                pollCount++;
                const elapsedTime = Date.now() - startTime + initialTaskAge;

                if (elapsedTime > POLLING_TIMEOUT) {
                    }秒)，强制停止`);
                    clearInterval(pollInterval);
                    await this.handlePollingTimeout();
                    return;
                }

                const taskKey = `task_${tabId}`;
                const result = await new Promise((resolve) => {
                    chrome.storage.local.get([taskKey], resolve);
                });

                const taskData = result[taskKey];

                if (!taskData) {
                    clearInterval(pollInterval);
                    this.handleTaskDataMissing();
                    return;
                }

                if (taskData.status === 'completed') {
                    clearInterval(pollInterval);
                    this.handleTaskCompleted(taskData);
                    chrome.storage.local.remove([taskKey]);
                } else if (taskData.status === 'failed') {
                    clearInterval(pollInterval);
                    this.handleTaskFailed(taskData);
                    chrome.storage.local.remove([taskKey]);
                } else if (taskData.status === 'processing') {
                    this.showProgress(taskData.progressText || '正在处理...');
                }

            } catch (error) {
                console.error('轮询任务状态失败:', error);
                clearInterval(pollInterval);
                this.handlePollingError(error);
            }
        }, 1000);

        this.currentPollInterval = pollInterval;
    }

    async handlePollingTimeout() {
        this.isTaskRunning = false;
        this.hideProgress();
        const extractBtn = document.getElementById('extractBtn');
        if (extractBtn) extractBtn.disabled = false;
        this.showStatus('任务处理超时，已自动重置', 'error');
    }

    handleTaskDataMissing() {
        this.isTaskRunning = false;
        this.hideProgress();
        const extractBtn = document.getElementById('extractBtn');
        if (extractBtn) extractBtn.disabled = false;
        this.showStatus('任务状态丢失，已重置', 'warning');
    }

    handlePollingError(error) {
        this.isTaskRunning = false;
        this.hideProgress();
        const extractBtn = document.getElementById('extractBtn');
        if (extractBtn) extractBtn.disabled = false;
        this.showStatus('任务状态检查出错: ' + error.message, 'error');
    }

    handleTaskCompleted(taskData) {
        this.isTaskRunning = false;
        this.hideProgress();
        const extractBtn = document.getElementById('extractBtn');
        if (extractBtn) extractBtn.disabled = false;

        if (taskData.result) {
            const processingMode = taskData.result.fullTextMode ? '全文整理' : '内容总结';
            const publishType = taskData.result.autoPublish ? '公开笔记' : '私有笔记';
            const detailedMessage = `${processingMode}完成并已发布为${publishType}`;
            this.showStatus(detailedMessage, 'success');
            this.showResult(taskData.result);
        } else {
            this.showStatus('任务已完成', 'success');
        }
    }

    handleTaskFailed(taskData) {
        this.isTaskRunning = false;
        this.hideProgress();
        const extractBtn = document.getElementById('extractBtn');
        if (extractBtn) extractBtn.disabled = false;

        const errorMessage = taskData.error || '未知错误';
        this.showStatus(`任务失败: ${errorMessage}`, 'error');

        const diagnoseBtn = document.getElementById('diagnoseBtn');
        if (diagnoseBtn) diagnoseBtn.style.display = 'flex';
    }

    async handleCancelTask() {
        if (!this.isTaskRunning) {
            this.showStatus('当前没有正在运行的任务', 'warning');
            return;
        }

        const confirmed = confirm('确定要取消当前任务吗？');
        if (!confirmed) return;

        if (this.currentPollInterval) {
            clearInterval(this.currentPollInterval);
            this.currentPollInterval = null;
        }

        this.isTaskRunning = false;
        this.taskId = null;
        this.hideProgress();

        const extractBtn = document.getElementById('extractBtn');
        if (extractBtn) extractBtn.disabled = false;

        // 清理存储的任务状态
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            const taskKey = `task_${tab.id}`;
            chrome.storage.local.remove([taskKey]);
        }

        this.showStatus('任务已取消', 'info');
    }

    async checkRunningTask() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) return;

            const taskKey = `task_${tab.id}`;
            const result = await new Promise((resolve) => {
                chrome.storage.local.get([taskKey], resolve);
            });

            const taskData = result[taskKey];
            if (!taskData) return;

            // 检查任务是否超时
            const taskAge = Date.now() - (taskData.startTime || taskData.updateTime || 0);
            const TASK_TIMEOUT = 5 * 60 * 1000;

            if (taskAge > TASK_TIMEOUT) {
                chrome.storage.local.remove([taskKey]);
                this.showStatus('检测到超时任务已自动清理', 'warning');
                return;
            }

            // 检查任务是否正在进行中
            if (taskData.status === 'running' || taskData.status === 'processing') {
                this.isTaskRunning = true;
                this.taskId = taskData.taskId;
                this.showProgress(taskData.progressText || '正在处理...');

                const extractBtn = document.getElementById('extractBtn');
                if (extractBtn) extractBtn.disabled = true;

                this.showStatus('检测到正在进行的任务，正在恢复状态...', 'info');
                this.startTaskPolling(tab.id, taskAge);
            }

        } catch (error) {
            console.error('检查任务状态失败:', error);
        }
    }

    addForceResetFeature() {
        // 在页面标题上三击重置
        const pageTitle = document.getElementById('pageTitle');
        if (pageTitle) {
            let clickCount = 0;
            pageTitle.addEventListener('click', () => {
                clickCount++;
                setTimeout(() => {
                    if (clickCount === 3) {
                        this.forceReset();
                    }
                    clickCount = 0;
                }, 500);
            });
        }

        // 添加调试信息（开发用）
        }

    async forceReset() {
        const confirmed = confirm('强制重置将清除所有任务状态，确定继续吗？');
        if (!confirmed) return;

        if (this.currentPollInterval) {
            clearInterval(this.currentPollInterval);
            this.currentPollInterval = null;
        }

        this.isTaskRunning = false;
        this.taskId = null;
        this.hideProgress();
        this.hideResult();

        const extractBtn = document.getElementById('extractBtn');
        const cancelBtn = document.getElementById('cancelBtn');
        const diagnoseBtn = document.getElementById('diagnoseBtn');

        if (extractBtn) extractBtn.disabled = false;
        if (cancelBtn) cancelBtn.style.display = 'none';
        if (diagnoseBtn) diagnoseBtn.style.display = 'none';

        // 清除所有任务相关的storage数据
        const allData = await new Promise((resolve) => {
            chrome.storage.local.get(null, resolve);
        });

        const taskKeys = Object.keys(allData).filter(key => key.startsWith('task_'));
        if (taskKeys.length > 0) {
            await new Promise((resolve) => {
                chrome.storage.local.remove(taskKeys, resolve);
            });
            }

        this.showStatus('状态已强制重置，可以重新开始操作', 'success');
    }

    // 添加页面卸载清理
    setupUnloadListener() {
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
    }

    showTaskStartNotice() {
        const notice = document.createElement('div');
        notice.className = 'task-start-notice';
        notice.innerHTML = `
            <div style="padding: 12px; background: #e3f2fd; border: 1px solid #90caf9; border-radius: 4px; margin: 8px 0; font-size: 12px; line-height: 1.5;">
                <strong>🚀 任务已开始</strong><br>
                • 任务将在后台继续进行<br>
                • 可以自由切换标签页浏览其他内容<br>
                • 切换回此页面可查看进度和结果<br>
                • 不建议在任务进行中关闭浏览器
            </div>
        `;

        const statusElement = document.getElementById('status');
        if (statusElement && statusElement.parentNode) {
            statusElement.parentNode.insertBefore(notice, statusElement.nextSibling);
        }

        // 6秒后自动隐藏提示
        setTimeout(() => {
            if (notice && notice.parentNode) {
                notice.parentNode.removeChild(notice);
            }
        }, 6000);
    }

    /**
     * 更新字符计数显示
     * @param {string} text - 当前文本内容
     */
    updateCharCount(text) {
        const charCount = document.getElementById('charCount');
        const counter = document.querySelector('.char-counter');

        if (charCount) {
            const currentLength = text.length;
            charCount.textContent = currentLength;

            // 如果接近限制，显示警告颜色
            if (counter) {
                if (currentLength > 450) {
                    counter.classList.add('warning');
                } else {
                    counter.classList.remove('warning');
                }
            }
        }
    }

    /**
     * 保存自定义提示词到本地存储
     * @param {string} customPrompt - 自定义提示词
     */
    async saveCustomPrompt(customPrompt) {
        try {
            await new Promise((resolve) => {
                chrome.storage.local.set({ customPrompt: customPrompt }, resolve);
            });
        } catch (error) {
            console.error('保存自定义提示词失败:', error);
        }
    }

    /**
     * 加载自定义提示词
     * @returns {Promise<string>} 自定义提示词
     */
    async loadCustomPrompt() {
        try {
            const result = await new Promise((resolve) => {
                chrome.storage.local.get(['customPrompt'], resolve);
            });
            return result.customPrompt || '';
        } catch (error) {
            console.error('加载自定义提示词失败:', error);
            return '';
        }
    }

    /**
     * 初始化自定义提示词
     */
    async initCustomPrompt() {
        const customPromptInput = document.getElementById('customPromptInput');
        if (customPromptInput) {
            const savedPrompt = await this.loadCustomPrompt();
            customPromptInput.value = savedPrompt;
            this.updateCharCount(savedPrompt);
        }
    }
}

// 初始化侧边栏控制器
document.addEventListener('DOMContentLoaded', () => {
    new SidePanelController();
});