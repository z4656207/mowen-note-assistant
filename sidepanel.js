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
        try {
            // 版本迁移：清理老版本的autoPublish设置，确保新版本默认为私有发布
            await this.migrateSettings();

            await this.waitForDOM();
            this.bindEvents();
            await this.initProcessingMode();
            await this.loadPageInfo();
            await this.loadPublishSettings();
            await this.initCustomPrompt();
            this.addForceResetFeature();
            this.initSidePanelFeatures();
            await this.checkRunningTask();
        } catch (error) {
            console.error('初始化失败:', error);
        }
    }

    /**
     * 版本迁移：处理设置变更
     */
    async migrateSettings() {
        try {
            const currentVersion = chrome.runtime.getManifest().version;
            const result = await new Promise((resolve) => {
                chrome.storage.local.get(['settingsVersion', 'autoPublish'], resolve);
            });

            // 如果是首次安装或者从老版本迁移，重置autoPublish设置
            if (!result.settingsVersion || result.settingsVersion !== currentVersion) {
                console.log('检测到版本变更，重置autoPublish设置为默认值（私有发布）');

                await new Promise((resolve) => {
                    chrome.storage.local.set({
                        settingsVersion: currentVersion,
                        autoPublish: false // 明确设置为false，确保默认私有发布
                    }, resolve);
                });

                console.log('版本迁移完成：autoPublish已重置为false');
            }
        } catch (error) {
            console.error('版本迁移失败:', error);
        }
    }

    /**
     * 初始化处理模式
     */
    async initProcessingMode() {
        try {
            const currentMode = await this.getCurrentProcessingMode();

            // 设置单选框状态
            const modeRadios = document.querySelectorAll('input[name="processingMode"]');
            modeRadios.forEach(radio => {
                radio.checked = radio.value === currentMode;
            });

            // 更新设置显示状态
            this.updateModeSettings(currentMode);

            console.log('处理模式初始化完成:', currentMode);
        } catch (error) {
            console.error('初始化处理模式失败:', error);
        }
    }

    /**
     * 处理模式切换
     * @param {string} mode - 新的处理模式 ('ai' 或 'clip')
     */
    async handleModeChange(mode) {
        try {
            // 保存模式设置
            await new Promise((resolve) => {
                chrome.storage.local.set({ processingMode: mode }, resolve);
            });

            // 更新UI状态
            this.updateModeSettings(mode);

            // 重新检查配置
            await this.checkConfiguration();

            // 更新按钮文本
            await this.updateButtonText();

            console.log('处理模式已切换到:', mode);
        } catch (error) {
            console.error('切换处理模式失败:', error);
            this.showStatus('切换处理模式失败: ' + error.message, 'error');
        }
    }

    /**
     * 根据模式更新设置项的显示状态
     * @param {string} mode - 处理模式
     */
    updateModeSettings(mode) {
        const aiModeSettings = document.getElementById('aiModeSettings');
        const customPromptSettings = document.querySelector('.custom-prompt-settings');

        if (mode === 'clip') {
            // 一键剪藏模式：隐藏AI相关设置
            if (aiModeSettings) {
                aiModeSettings.style.display = 'none';
            }
            if (customPromptSettings) {
                customPromptSettings.style.display = 'none';
            }
        } else {
            // AI模式：显示所有设置
            if (aiModeSettings) {
                aiModeSettings.style.display = 'block';
            }
            if (customPromptSettings) {
                customPromptSettings.style.display = 'block';
            }
        }
    }

    /**
     * 获取当前处理模式
     * @returns {Promise<string>} 当前处理模式 ('ai' 或 'clip')
     */
    async getCurrentProcessingMode() {
        try {
            const result = await new Promise((resolve) => {
                chrome.storage.local.get(['processingMode'], resolve);
            });
            return result.processingMode || 'ai'; // 默认为AI模式
        } catch (error) {
            console.error('获取处理模式失败:', error);
            return 'ai';
        }
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

            // 页面支持内容提取，重新启用提取按钮（如果之前被禁用了）
            const extractBtn = document.getElementById('extractBtn');
            if (extractBtn) {
                // 只有在配置完整的情况下才启用按钮
                const config = await this.getStoredConfig();
                const currentMode = await this.getCurrentProcessingMode();
                if (this.validateConfig(config, currentMode)) {
                    extractBtn.disabled = false;
                    extractBtn.title = '';
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
        } catch (error) {}
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
        // 处理模式选择
        const processingModeRadios = document.querySelectorAll('input[name="processingMode"]');
        processingModeRadios.forEach(radio => {
            radio.addEventListener('change', async(e) => {
                if (e.target.checked) {
                    await this.handleModeChange(e.target.value);
                }
            });
        });

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
            autoPublishToggle.addEventListener('change', async(e) => {
                const fullTextModeEl = document.getElementById('fullTextModeToggle');
                const generateTagsEl = document.getElementById('generateTagsToggle');
                const fullTextMode = fullTextModeEl ? fullTextModeEl.checked : false;
                const generateTags = generateTagsEl ? generateTagsEl.checked : false;
                await this.savePublishSettings(autoPublishToggle.checked, fullTextMode, generateTags);
                this.updateButtonText();
            });
        }

        // 全文整理模式开关
        const fullTextModeToggle = document.getElementById('fullTextModeToggle');
        if (fullTextModeToggle) {
            fullTextModeToggle.addEventListener('change', async(e) => {
                const autoPublishEl = document.getElementById('autoPublishToggle');
                const generateTagsEl = document.getElementById('generateTagsToggle');
                const autoPublish = autoPublishEl ? autoPublishEl.checked : false;
                const generateTags = generateTagsEl ? generateTagsEl.checked : false;
                await this.savePublishSettings(autoPublish, fullTextModeToggle.checked, generateTags);
                this.updateButtonText();
            });
        }

        // 生成标签开关
        const generateTagsToggle = document.getElementById('generateTagsToggle');
        if (generateTagsToggle) {
            generateTagsToggle.addEventListener('change', async(e) => {
                const autoPublishEl = document.getElementById('autoPublishToggle');
                const fullTextModeEl = document.getElementById('fullTextModeToggle');
                const autoPublish = autoPublishEl ? autoPublishEl.checked : false;
                const fullTextMode = fullTextModeEl ? fullTextModeEl.checked : false;
                await this.savePublishSettings(autoPublish, fullTextMode, generateTagsToggle.checked);
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
                const currentMode = await this.getCurrentProcessingMode();
                if (this.validateConfig(config, currentMode)) {
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

        return new Promise(async(resolve, reject) => {
            try {
                const isReady = await this.checkContentScriptReady(tabId);
                if (!isReady) {
                    try {
                        await chrome.scripting.executeScript({
                            target: { tabId: tabId },
                            files: ['content.js']
                        });
                        await new Promise(resolveDelay => setTimeout(resolveDelay, 1000));
                        const isReadyAfterInject = await this.checkContentScriptReady(tabId);
                        if (!isReadyAfterInject && retryCount < maxRetries) {
                            setTimeout(async() => {
                                try {
                                    const result = await this.extractPageContent(tabId, retryCount + 1);
                                    resolve(result);
                                } catch (error) {
                                    reject(error);
                                }
                            }, 1000);
                            return;
                        }
                    } catch (injectError) {
                        console.error('手动注入失败:', injectError);
                        if (retryCount < maxRetries) {
                            setTimeout(async() => {
                                try {
                                    const result = await this.extractPageContent(tabId, retryCount + 1);
                                    resolve(result);
                                } catch (error) {
                                    reject(error);
                                }
                            }, 1000);
                            return;
                        } else {
                            this.showStatus('无法注入内容脚本，请刷新页面后重试', 'error');
                            reject(new Error('无法注入内容脚本'));
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
                            setTimeout(async() => {
                                try {
                                    const result = await this.extractPageContent(tabId, retryCount + 1);
                                    resolve(result);
                                } catch (error) {
                                    reject(error);
                                }
                            }, 1000);
                        } else if (retryCount < maxRetries) {
                            setTimeout(async() => {
                                try {
                                    const result = await this.extractPageContent(tabId, retryCount + 1);
                                    resolve(result);
                                } catch (error) {
                                    reject(error);
                                }
                            }, 1000);
                        } else {
                            this.showStatus(`无法获取页面内容: ${errorMsg}`, 'error');
                            reject(new Error(`无法获取页面内容: ${errorMsg}`));
                        }
                        return;
                    }

                    if (response && response.success) {
                        this.currentPageData = response.data;
                        this.showStatus('页面内容已准备就绪', 'success');
                        resolve(response.data);
                    } else {
                        const errorMsg = response ? (response.error || '未知错误') : '无响应';
                        console.error('提取页面内容失败:', errorMsg);
                        this.showStatus('提取页面内容失败: ' + errorMsg, 'error');
                        reject(new Error('提取页面内容失败: ' + errorMsg));
                    }
                });

            } catch (error) {
                console.error('extractPageContent异常:', error);
                if (retryCount < maxRetries) {
                    setTimeout(async() => {
                        try {
                            const result = await this.extractPageContent(tabId, retryCount + 1);
                            resolve(result);
                        } catch (retryError) {
                            reject(retryError);
                        }
                    }, 1000);
                } else {
                    this.showStatus('无法提取页面内容: ' + error.message, 'error');
                    reject(new Error('无法提取页面内容: ' + error.message));
                }
            }
        });
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

    /**
     * 检查配置是否完整
     */
    async checkConfiguration() {
        try {
            const config = await this.getStoredConfig();
            const currentMode = await this.getCurrentProcessingMode();
            const isValid = this.validateConfig(config, currentMode);

            // 获取提取按钮
            const extractBtn = document.getElementById('extractBtn');
            if (extractBtn) {
                extractBtn.disabled = !isValid;
            }

            await this.updateButtonText();
        } catch (error) {
            console.error('检查配置失败:', error);
        }
    }

    /**
     * 获取存储的配置
     * @returns {Promise<Object>} 配置对象
     */
    async getStoredConfig() {
        return new Promise((resolve) => {
            chrome.storage.sync.get([
                'aiApiUrl', 'aiApiKey', 'aiModel', 'mowenApiKey'
            ], resolve);
        });
    }

    /**
     * 验证配置是否完整
     * @param {Object} config - 配置对象
     * @param {string} mode - 处理模式 ('ai' 或 'clip')
     * @returns {boolean} 是否有效
     */
    validateConfig(config, mode = 'ai') {
        // 墨问API密钥在所有模式下都是必需的
        if (!config.mowenApiKey) {
            return false;
        }

        // 一键剪藏模式只需要墨问API密钥
        if (mode === 'clip') {
            return true;
        }

        // AI模式需要额外的AI配置
        return !!(config.aiApiUrl && config.aiApiKey && config.aiModel);
    }

    async loadPublishSettings() {
        try {
            const result = await this.getPublishSettings();
            const { autoPublish, fullTextMode, generateTags } = result;

            const autoPublishToggle = document.getElementById('autoPublishToggle');
            const fullTextModeToggle = document.getElementById('fullTextModeToggle');
            const generateTagsToggle = document.getElementById('generateTagsToggle');

            // 设置开关状态，默认为false（私有发布）
            if (autoPublishToggle) autoPublishToggle.checked = autoPublish === true;
            if (fullTextModeToggle) fullTextModeToggle.checked = fullTextMode === true;
            if (generateTagsToggle) generateTagsToggle.checked = generateTags === true;

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

    /**
     * 更新按钮文本
     */
    async updateButtonText() {
        const extractBtn = document.getElementById('extractBtn');
        const extractBtnText = document.getElementById('extractBtnText');

        if (!extractBtn || !extractBtnText) return;

        try {
            const config = await this.getStoredConfig();
            const currentMode = await this.getCurrentProcessingMode();
            const isValid = this.validateConfig(config, currentMode);

            if (!isValid) {
                if (currentMode === 'clip') {
                    extractBtnText.textContent = '请配置墨问API密钥';
                } else {
                    extractBtnText.textContent = '请配置AI和墨问API密钥';
                }
                extractBtn.disabled = true;
                return;
            }

            // 根据模式设置按钮文本
            if (currentMode === 'clip') {
                extractBtnText.textContent = '一键剪藏到墨问';
            } else {
                // AI模式下根据其他设置决定文本
                const publishSettings = await this.getPublishSettings();
                const modeText = publishSettings.fullTextMode ? '全文整理' : '智能总结';
                extractBtnText.textContent = `${modeText}并发布到墨问`;
            }

            extractBtn.disabled = false;
        } catch (error) {
            console.error('更新按钮文本失败:', error);
            extractBtnText.textContent = '提取并发布到墨问';
            extractBtn.disabled = true;
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

    showProgress(text = '正在处理...', progressData = null) {
        const progressEl = document.getElementById('progress');
        const progressText = document.getElementById('progress').querySelector('.progress-text');
        const progressFill = document.getElementById('progress').querySelector('.progress-fill');
        const cancelBtn = document.getElementById('cancelBtn');

        // 清除之前的文本动画
        if (this.textAnimationTimer) {
            clearInterval(this.textAnimationTimer);
            this.textAnimationTimer = null;
        }

        // 如果有进度数据，显示具体进度
        if (progressData && progressData.progressInfo) {
            const { step, total } = progressData.progressInfo;
            const percent = progressData.progressPercent || Math.round((step / total) * 100);

            // 更新进度条 - 使用具体进度
            if (progressFill) {
                progressFill.style.transition = 'width 0.5s ease-out';
                progressFill.style.width = percent + '%';
                progressFill.style.background = '#007bff';
                progressFill.style.backgroundImage = 'none';
                progressFill.style.backgroundSize = 'auto';
                progressFill.style.animation = 'none';
            }

            // 更新文本显示步骤信息
            if (progressText) {
                const stepIndicator = this.getStepIndicator(step, total);
                progressText.innerHTML = `${stepIndicator} ${text} <span style="color: #007bff; font-weight: bold;">(${step}/${total} - ${percent}%)</span>`;
                progressText.style.animation = 'none'; // 移除闪烁动画
            }
        } else {
            // 无具体进度时显示无限动画
            if (progressFill) {
                progressFill.style.transition = 'none';
                progressFill.style.width = '100%';
                progressFill.style.background = 'linear-gradient(90deg, #007bff 0%, #0056b3 50%, #007bff 100%)';
                progressFill.style.backgroundSize = '200% 100%';
                progressFill.style.animation = 'progress-wave 2s ease-in-out infinite';
                progressFill.style.backgroundImage = 'none';
            }

            // 显示简洁的加载文本
            if (progressText) {
                progressText.innerHTML = text;
                progressText.style.animation = 'none';

                // 添加简单的点点动画
                this.animateProgressText(progressText, text);
            }
        }

        if (progressEl) progressEl.style.display = 'block';
        if (cancelBtn) cancelBtn.style.display = 'flex';

        // 确保CSS动画样式存在
        this.ensureProgressAnimationStyles();
    }

    /**
     * 获取步骤指示器
     */
    getStepIndicator(currentStep, totalSteps) {
        const stepIcons = ['🔍', '📦', '🤖', '📝', '🎉'];
        return stepIcons[currentStep - 1] || '⚙️';
    }

    /**
     * 动画化进度文本
     */
    animateProgressText(element, baseText) {
        const dots = ['', '.', '..', '...'];
        let dotIndex = 0;

        // 清除之前的动画
        if (this.textAnimationTimer) {
            clearInterval(this.textAnimationTimer);
        }

        this.textAnimationTimer = setInterval(() => {
            element.textContent = baseText + dots[dotIndex];
            dotIndex = (dotIndex + 1) % dots.length;
        }, 500);
    }

    /**
     * 确保进度动画CSS样式存在
     */
    ensureProgressAnimationStyles() {
        // 检查是否已经添加了样式
        if (document.getElementById('progress-animation-styles')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'progress-animation-styles';
        style.textContent = `
            @keyframes progress-wave {
                0% { background-position: 200% 50%; }
                100% { background-position: -200% 50%; }
            }
            
            @keyframes progress-stripes {
                0% { background-position: 0 0, 0 0; }
                100% { background-position: 30px 0, 30px 0; }
            }
            
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.7; }
            }
            
            .progress-fill {
                transition: all 0.3s ease;
            }
            
            .progress-text {
                font-weight: 500;
                display: flex;
                align-items: center;
                gap: 8px;
            }
        `;
        document.head.appendChild(style);
    }

    hideProgress() {
        const progressEl = document.getElementById('progress');
        const cancelBtn = document.getElementById('cancelBtn');
        const progressText = document.getElementById('progress').querySelector('.progress-text');

        // 清理文本动画计时器
        if (this.textAnimationTimer) {
            clearInterval(this.textAnimationTimer);
            this.textAnimationTimer = null;
        }

        // 重置进度文本样式
        if (progressText) {
            progressText.style.animation = '';
        }

        if (progressEl) progressEl.style.display = 'none';
        if (cancelBtn) cancelBtn.style.display = 'none';
    }

    showResult(data) {
            const resultEl = document.getElementById('result');
            const resultContent = document.getElementById('resultContent');

            let html = '';

            // 状态信息
            if (data.mowenResult && data.mowenResult.noteId) {
                const statusIcon = data.autoPublish ? '✅' : '📝';
                const statusText = data.autoPublish ? '笔记创建并公开发布成功' : '笔记创建并私有发布成功';

                html += `<div class="result-section success-section">
                <div class="result-title">${statusIcon} ${statusText}</div>
                <div class="result-details">
                    <div class="detail-item">
                        <span class="detail-label">笔记ID:</span>
                        <span class="detail-value selectable">${data.mowenResult.noteId}</span>
                    </div>
                </div>
            </div>`;
            }

            // AI处理结果详情
            if (data.aiResult) {
                const processingMode = data.fullTextMode ? '全文整理' : '内容总结';
                html += `<div class="result-section ai-section">
                <div class="result-title">🤖 AI${processingMode}结果</div>
                <div class="result-details">
                    <div class="detail-item">
                        <span class="detail-label">标题:</span>
                        <span class="detail-value selectable">${this.escapeHtml(data.aiResult.title || '无标题')}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">段落数:</span>
                        <span class="detail-value">${data.aiResult.paragraphs ? data.aiResult.paragraphs.length : 0}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">标签:</span>
                        <span class="detail-value">${data.aiResult.tags && data.aiResult.tags.length > 0 ? 
                            data.aiResult.tags.map(tag => `<span class="tag">${this.escapeHtml(tag)}</span>`).join(' ') : 
                            '<span class="no-value">无标签</span>'}</span>
                    </div>
                </div>
            </div>`;

            // 显示AI质量评估（如果有）
            if (data.aiResult.qualityAssessment) {
                const qa = data.aiResult.qualityAssessment;
                html += `<div class="result-section quality-section">
                    <div class="result-title">🎯 AI处理质量评估</div>
                    <div class="result-details">
                        <div class="detail-item">
                            <span class="detail-label">质量等级:</span>
                            <span class="detail-value">${qa.emoji} ${qa.grade} (${qa.score}分)</span>
                        </div>`;
                
                if (qa.issues && qa.issues.length > 0) {
                    html += `<div class="detail-item">
                        <span class="detail-label">发现问题:</span>
                        <span class="detail-value warning">${qa.issues.join('; ')}</span>
                    </div>`;
                }
                
                if (qa.warnings && qa.warnings.length > 0) {
                    html += `<div class="detail-item">
                        <span class="detail-label">注意事项:</span>
                        <span class="detail-value notice">${qa.warnings.join('; ')}</span>
                    </div>`;
                }

                html += `</div></div>`;
            }
        }

        // 性能分析（可折叠）
        if (data.performanceMetrics) {
            const metrics = data.performanceMetrics;
            const totalTime = (metrics.totalTime / 1000).toFixed(2);

            html += `<div class="result-section performance-section">
                <div class="result-title collapsible" onclick="this.parentElement.classList.toggle('expanded')">
                    ⚡ 性能分析 <span class="collapse-indicator">▼</span>
                </div>
                <div class="collapsible-content">
                    <div class="result-details">
                        <div class="detail-item">
                            <span class="detail-label">总耗时:</span>
                            <span class="detail-value">${totalTime}秒</span>
                        </div>`;

            if (metrics.steps) {
                const stepNames = {
                    configValidation: '配置验证',
                    dataPreparation: '数据准备',
                    aiProcessing: 'AI处理',
                    clipProcessing: '剪藏处理',
                    mowenPublishing: '墨问发布'
                };

                Object.entries(metrics.steps).forEach(([step, time]) => {
                    if (time && stepNames[step]) {
                        const stepTime = (time / 1000).toFixed(2);
                        const stepPercent = ((time / metrics.totalTime) * 100).toFixed(1);
                        html += `<div class="detail-item">
                            <span class="detail-label">${stepNames[step]}:</span>
                            <span class="detail-value">${stepTime}秒 (${stepPercent}%)</span>
                        </div>`;
                    }
                });
            }

            // 性能评估
            html += `<div class="detail-item">
                <span class="detail-label">性能评估:</span>
                <span class="detail-value">${this.getPerformanceRating(metrics.totalTime)}</span>
            </div>`;

            html += `</div></div></div>`;
        }

        // 处理时间
        html += `<div class="result-section time-section">
            <div class="result-details">
                <div class="detail-item">
                    <span class="detail-label">处理时间:</span>
                    <span class="detail-value">${new Date().toLocaleString()}</span>
                </div>
            </div>
        </div>`;

        resultContent.innerHTML = html;
        resultEl.style.display = 'block';

        // 确保结果区域滚动到顶部
        resultContent.scrollTop = 0;

        // 添加复制功能
        this.addCopyFunctionality();
    }

    /**
     * 转义HTML特殊字符
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 获取性能评级
     */
    getPerformanceRating(totalTime) {
        if (totalTime < 5000) {
            return '🚀 优秀 (<5s)';
        } else if (totalTime < 10000) {
            return '👍 良好 (<10s)';
        } else if (totalTime < 20000) {
            return '⚠️ 一般 (<20s)';
        } else {
            return '🐌 较慢 (>20s)';
        }
    }

    /**
     * 添加复制功能
     */
    addCopyFunctionality() {
        const selectableElements = document.querySelectorAll('.selectable');
        selectableElements.forEach(element => {
            element.addEventListener('click', () => {
                // 选中文本
                const range = document.createRange();
                range.selectNode(element);
                window.getSelection().removeAllRanges();
                window.getSelection().addRange(range);

                // 复制到剪贴板
                try {
                    document.execCommand('copy');
                    this.showTemporaryTooltip(element, '已复制');
                } catch (err) {
                    console.error('复制失败:', err);
                }

                // 清除选择
                window.getSelection().removeAllRanges();
            });

            // 添加复制图标提示
            element.title = '点击复制';
            element.style.cursor = 'pointer';
        });
    }

    /**
     * 显示临时提示
     */
    showTemporaryTooltip(element, message) {
        const tooltip = document.createElement('div');
        tooltip.className = 'copy-tooltip';
        tooltip.textContent = message;
        
        // 定位到元素附近
        const rect = element.getBoundingClientRect();
        tooltip.style.position = 'fixed';
        tooltip.style.left = rect.left + 'px';
        tooltip.style.top = (rect.top - 30) + 'px';
        tooltip.style.background = '#333';
        tooltip.style.color = 'white';
        tooltip.style.padding = '4px 8px';
        tooltip.style.borderRadius = '4px';
        tooltip.style.fontSize = '12px';
        tooltip.style.zIndex = '10000';
        tooltip.style.pointerEvents = 'none';
        
        document.body.appendChild(tooltip);
        
        // 1秒后移除
        setTimeout(() => {
            if (tooltip.parentNode) {
                tooltip.parentNode.removeChild(tooltip);
            }
        }, 1000);
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
                '一键剪藏：直接保存网页内容，转换为墨问富文本格式',
                '一键发布：直接发布到墨问笔记平台'
            ],
            '处理模式': [
                'AI智能整理 - 总结模式（推荐）：提取文章要点，适合长文快速阅读',
                'AI智能整理 - 全文整理模式：保留完整内容，优化格式和结构',
                '一键剪藏模式：直接保存原网页内容，无需AI配置，保持原有格式'
            ],
            '配置需求': [
                '一键剪藏模式：仅需墨问API密钥即可使用',
                'AI智能整理模式：需要配置AI API和墨问API密钥',
                '墨问Pro会员：获取墨问API密钥需要Pro会员资格'
            ],
            '发布设置': [
                '公开笔记：发布后其他用户可见',
                '私有笔记：仅自己可见的私密内容',
                '生成标签（仅AI模式）：AI自动为内容生成1-3个相关标签，便于分类管理'
            ],
            '自定义提示词（仅AI模式）': [
                '输入额外的指导信息来定制AI处理结果',
                '例如："请重点关注技术细节"、"使用专业术语"等',
                '字数限制：500字符以内',
                '只有输入内容时才会影响AI处理'
            ],
            '使用建议': [
                '快速剪藏资料：选择一键剪藏模式',
                '新闻文章、博客：选择AI总结模式',
                '技术文档、教程：选择AI全文整理模式',
                '成本控制：一键剪藏不消耗AI Token，完全免费'
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

    /**
     * 处理提取和发布操作
     */
    async handleExtractAndPublish() {
        try {
            // 获取当前标签页
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tabs[0]) {
                this.showStatus('无法获取当前页面信息', 'error');
                return;
            }

            const tabId = tabs[0].id;
            
            // 检查配置
            const config = await this.getStoredConfig();
            const currentMode = await this.getCurrentProcessingMode();
            if (!this.validateConfig(config, currentMode)) {
                let errorMsg = '请先配置';
                if (currentMode === 'clip') {
                    errorMsg += '墨问API密钥';
                } else {
                    errorMsg += 'AI和墨问API密钥';
                }
                this.showStatus(errorMsg, 'error');
                return;
            }

            this.showTaskStartNotice();

            // 检查是否有任务正在运行
            const runningTask = await this.checkRunningTask();
            if (runningTask) {
                this.showStatus('有任务正在进行中，请等待完成后再试', 'warning');
                return;
            }

            // 先尝试提取内容
            let pageData;
            try {
                pageData = await this.extractPageContent(tabId);
            } catch (error) {
                console.error('提取页面内容失败:', error);
                this.handleTaskError('提取页面内容失败: ' + error.message, tabId);
                return;
            }

            // 生成任务ID
            const taskId = 'task_' + Date.now() + '_' + Math.random().toString(36).substring(2);

            // 获取发布设置
            const publishSettings = await this.getPublishSettings();
            
            // 获取自定义提示词
            const customPromptInput = document.getElementById('customPromptInput');
            const customPrompt = customPromptInput ? customPromptInput.value.trim() : '';

            // 准备设置对象，包含处理模式
            const settings = {
                ...publishSettings,
                customPrompt: customPrompt,
                processingMode: currentMode  // 添加处理模式
            };

            console.log('开始处理任务:', {
                taskId,
                tabId,
                processingMode: currentMode,
                settings
            });

            // 发送处理请求到后台脚本
            chrome.runtime.sendMessage({
                action: 'processContent',
                taskId: taskId,
                tabId: tabId,
                data: pageData,
                settings: settings
            });

            // 开始轮询任务状态
            this.startTaskPolling(tabId);

            // 更新UI状态
            const extractBtn = document.getElementById('extractBtn');
            const cancelBtn = document.getElementById('cancelBtn');
            
            if (extractBtn) extractBtn.style.display = 'none';
            if (cancelBtn) cancelBtn.style.display = 'block';

            // 显示进度
            const progressText = currentMode === 'clip' ? '正在进行一键剪藏...' : '正在AI智能整理...';
            this.showProgress(progressText);

        } catch (error) {
            console.error('处理提取和发布操作失败:', error);
            this.handleTaskError('处理失败: ' + error.message);
        }
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
                    console.log(`任务轮询超时 (${Math.round(elapsedTime / 1000)}秒)，强制停止`);
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
                    this.showProgress(taskData.progressText || '正在处理...', taskData);
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
        
        // 完全重置UI状态，确保所有按钮和元素正常显示
        this.resetUIState();
        
        if (taskData.result) {
            const processingMode = taskData.result.fullTextMode ? '全文整理' : '内容总结';
            const publishType = taskData.result.autoPublish ? '公开笔记' : '私有笔记';
            const detailedMessage = `${processingMode}完成并已发布为${publishType}`;
            this.showStatus(detailedMessage, 'success');
            this.showResult(taskData.result);
        } else {
            this.showStatus('任务已完成', 'success');
        }

        // 确保按钮文本正确更新
        setTimeout(() => {
            this.updateButtonText();
        }, 100);
    }

    handleTaskFailed(taskData) {
        this.isTaskRunning = false;
        this.hideProgress();
        
        // 完全重置UI状态
        this.resetUIState();
        
        const errorMessage = taskData.error || '未知错误';
        this.showStatus(`任务失败: ${errorMessage}`, 'error');

        const diagnoseBtn = document.getElementById('diagnoseBtn');
        if (diagnoseBtn) diagnoseBtn.style.display = 'flex';

        // 确保按钮文本正确更新
        setTimeout(() => {
            this.updateButtonText();
        }, 100);
    }

    /**
     * 完全重置UI状态 - 新增方法
     */
    resetUIState() {
        // 重新启用主要按钮
        const extractBtn = document.getElementById('extractBtn');
        const cancelBtn = document.getElementById('cancelBtn');
        const previewBtn = document.getElementById('previewBtn');
        const diagnoseBtn = document.getElementById('diagnoseBtn');
        const settingsBtn = document.getElementById('settingsBtn');
        const toggleModeBtn = document.getElementById('toggleModeBtn');

        if (extractBtn) {
            extractBtn.disabled = false;
            extractBtn.style.display = '';
            extractBtn.style.visibility = 'visible';
            extractBtn.style.opacity = '1';
        }

        if (cancelBtn) {
            cancelBtn.style.display = 'none';
        }

        if (previewBtn) {
            previewBtn.style.display = 'none';
        }

        if (diagnoseBtn) {
            diagnoseBtn.style.display = 'none';
        }

        if (settingsBtn) {
            settingsBtn.disabled = false;
            settingsBtn.style.display = '';
        }

        if (toggleModeBtn) {
            toggleModeBtn.disabled = false;
            toggleModeBtn.style.display = '';
        }

        // 重新启用设置控件
        const autoPublishToggle = document.getElementById('autoPublishToggle');
        const fullTextModeToggle = document.getElementById('fullTextModeToggle');
        const generateTagsToggle = document.getElementById('generateTagsToggle');
        const aiModeRadio = document.getElementById('aiModeRadio');
        const clipModeRadio = document.getElementById('clipModeRadio');
        const customPromptInput = document.getElementById('customPromptInput');

        [autoPublishToggle, fullTextModeToggle, generateTagsToggle, aiModeRadio, clipModeRadio, customPromptInput].forEach(element => {
            if (element) {
                element.disabled = false;
            }
        });

        // 确保主要容器可见
        const actionsContainer = document.querySelector('.actions');
        if (actionsContainer) {
            actionsContainer.style.display = '';
        }

        // 重置任务相关状态
        this.isTaskRunning = false;
        this.taskId = null;

        // 清理轮询间隔
        if (this.currentPollInterval) {
            clearInterval(this.currentPollInterval);
            this.currentPollInterval = null;
        }
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