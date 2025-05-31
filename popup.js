// 弹出窗口脚本
class PopupController {
    constructor() {
        this.currentPageData = null;
        this.taskId = null; // 当前任务ID
        this.isTaskRunning = false; // 任务运行状态
        this.currentPollInterval = null; // 当前轮询间隔ID
        this.init();
    }

    /**
     * 初始化弹出窗口
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
            this.addCopyFunctionality();
            this.addForceResetFeature();
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
            this.toggleToSidePanelMode();
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
        document.getElementById('helpLink').addEventListener('click', (e) => {
            e.preventDefault();
            this.showHelp();
        });

        // 反馈链接
        // const feedbackLink = document.getElementById('feedbackLink');
        // if (feedbackLink) {
        //     feedbackLink.addEventListener('click', (e) => {
        //         e.preventDefault();
        //         this.showFeedback();
        //     });
        // }

        // 诊断按钮
        document.getElementById('diagnoseBtn').addEventListener('click', () => {
            this.runDiagnosis();
        });

        // 取消任务按钮
        document.getElementById('cancelBtn').addEventListener('click', () => {
            this.handleCancelTask();
        });

        // 处理模式切换
        document.getElementById('aiModeRadio').addEventListener('change', () => {
            this.handleModeChange('ai');
        });

        document.getElementById('clipModeRadio').addEventListener('change', () => {
            this.handleModeChange('clip');
        });
    }

    /**
     * 初始化处理模式
     */
    async initProcessingMode() {
        try {
            const result = await new Promise((resolve) => {
                chrome.storage.local.get(['processingMode'], resolve);
            });

            const mode = result.processingMode || 'ai';

            // 设置单选按钮状态
            document.getElementById('aiModeRadio').checked = (mode === 'ai');
            document.getElementById('clipModeRadio').checked = (mode === 'clip');

            // 更新设置区域显示状态
            this.updateModeSettings(mode);

            // 更新按钮文本
            this.updateButtonText();

        } catch (error) {
            console.error('初始化处理模式失败:', error);
            // 默认使用AI模式
            this.handleModeChange('ai');
        }
    }

    /**
     * 处理模式切换
     */
    async handleModeChange(mode) {
        try {
            // 保存选择的模式
            await new Promise((resolve) => {
                chrome.storage.local.set({ 'processingMode': mode }, resolve);
            });

            // 更新设置区域显示状态
            this.updateModeSettings(mode);

            // 更新按钮文本
            this.updateButtonText();

            // 重新检查配置
            await this.checkConfiguration();

        } catch (error) {
            console.error('处理模式切换失败:', error);
        }
    }

    /**
     * 更新模式设置区域的显示状态
     */
    updateModeSettings(mode) {
        const aiSettings = document.getElementById('aiModeSettings');
        const clipSettings = document.getElementById('clipModeSettings');
        const customPromptSettings = document.querySelector('.custom-prompt-settings');

        if (mode === 'ai') {
            // AI模式：显示AI专用设置，隐藏剪藏设置
            if (aiSettings) {
                aiSettings.style.display = 'block';
            }
            if (clipSettings) {
                clipSettings.style.display = 'none';
            }
            if (customPromptSettings) {
                customPromptSettings.style.display = 'block';
            }
        } else {
            // 一键剪藏模式：隐藏AI专用设置，显示剪藏设置
            if (aiSettings) {
                aiSettings.style.display = 'none';
            }
            if (clipSettings) {
                clipSettings.style.display = 'block';
            }
            if (customPromptSettings) {
                customPromptSettings.style.display = 'none';
            }
        }
    }

    /**
     * 获取当前处理模式
     */
    async getCurrentProcessingMode() {
        try {
            const result = await new Promise((resolve) => {
                chrome.storage.local.get(['processingMode'], resolve);
            });
            return result.processingMode || 'ai';
        } catch (error) {
            console.error('获取处理模式失败:', error);
            return 'ai';
        }
    }

    /**
     * 加载当前页面信息
     */
    async loadPageInfo() {
        try {
            // 首先清理可能存在的帮助信息
            this.clearPageTypeHelp();

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

            // 更新页面信息显示
            document.getElementById('pageTitle').textContent = tab.title || '无标题';
            document.getElementById('pageUrl').textContent = tab.url || '';

            // 向内容脚本发送消息获取页面内容
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

    // 添加页面类型帮助信息
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
     * 提取页面内容
     */
    async extractPageContent(tabId, retryCount = 0) {
        const maxRetries = 3;

        return new Promise(async(resolve, reject) => {
            try {
                // 首先检查内容脚本是否已准备好
                const isReady = await this.checkContentScriptReady(tabId);
                // 如果内容脚本未准备好，尝试手动注入
                if (!isReady) {
                    try {
                        await chrome.scripting.executeScript({
                            target: { tabId: tabId },
                            files: ['content.js']
                        });
                        // 等待脚本初始化
                        await new Promise(resolveDelay => setTimeout(resolveDelay, 1000));

                        // 再次检查是否准备好
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

                // 发送消息提取内容
                chrome.tabs.sendMessage(tabId, { action: 'extractContent' }, (response) => {
                    if (chrome.runtime.lastError) {
                        const errorMsg = chrome.runtime.lastError.message || chrome.runtime.lastError.toString();
                        console.error('发送消息失败:', errorMsg);

                        // 如果是连接错误且还有重试次数，尝试重试
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

    /**
     * 检查内容脚本是否已准备好
     */
    async checkContentScriptReady(tabId) {
        return new Promise((resolve) => {
            // 设置超时
            const timeout = setTimeout(() => {
                resolve(false);
            }, 2000);

            chrome.tabs.sendMessage(tabId, { action: 'ping' }, (response) => {
                clearTimeout(timeout);

                if (chrome.runtime.lastError) {
                    const error = chrome.runtime.lastError.message;
                    // 特殊处理连接错误
                    if (error.includes('Could not establish connection') ||
                        error.includes('Receiving end does not exist')) {}

                    resolve(false);
                } else {
                    resolve(true);
                }
            });
        });
    }

    // 添加 URL 检查方法
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
     * 检查配置是否完整
     */
    async checkConfiguration() {
        try {
            const config = await this.getStoredConfig();
            const currentMode = await this.getCurrentProcessingMode();

            if (!this.validateConfig(config, currentMode)) {
                const missingItems = this.getMissingConfigItems(config, currentMode);
                this.showStatus(`请先在设置页面配置：${missingItems.join('、')}`, 'error');
                const extractBtn = document.getElementById('extractBtn');
                const diagnoseBtn = document.getElementById('diagnoseBtn');
                if (extractBtn) {
                    extractBtn.disabled = true;
                }
                if (diagnoseBtn) {
                    diagnoseBtn.style.display = 'flex';
                }
                return;
            }

            this.showStatus('配置检查通过', 'success');
            const extractBtn = document.getElementById('extractBtn');
            if (extractBtn) {
                extractBtn.disabled = false;
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
                resolve(result);
            });
        });
    }

    /**
     * 验证配置是否完整
     */
    validateConfig(config, mode = 'ai') {
        // 墨问API密钥在所有模式下都是必需的
        if (!config.mowenApiKey) {
            return false;
        }

        // AI模式需要额外的AI配置
        if (mode === 'ai') {
            return config.aiApiUrl && config.aiApiKey && config.aiModel && config.mowenApiKey;
        }

        // 一键剪藏模式只需要墨问API密钥
        if (mode === 'clip') {
            return config.mowenApiKey;
        }

        return false;
    }

    /**
     * 获取缺失的配置项列表
     */
    getMissingConfigItems(config, mode = 'ai') {
        const missing = [];

        if (!config.mowenApiKey) {
            missing.push('墨问API密钥');
        }

        if (mode === 'ai') {
            if (!config.aiApiUrl) {
                missing.push('AI API地址');
            }
            if (!config.aiApiKey) {
                missing.push('AI API密钥');
            }
            if (!config.aiModel) {
                missing.push('AI模型名称');
            }
        }

        return missing;
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
            const customPromptInput = document.getElementById('customPromptInput');

            if (autoPublishToggle) {
                // 设置开关状态，默认为false（私有发布）
                autoPublishToggle.checked = settings.autoPublish === true;
            } else {}

            if (fullTextModeToggle) {
                // 设置全文整理模式开关状态，默认为false（即总结模式）
                fullTextModeToggle.checked = settings.fullTextMode === true;
            } else {}

            if (generateTagsToggle) {
                // 设置生成标签开关状态，默认为false（即不生成标签）
                generateTagsToggle.checked = settings.generateTags === true;
            } else {}

            if (customPromptInput) {
                // 加载自定义提示词
                customPromptInput.value = await this.loadCustomPrompt();
                this.updateCharCount(customPromptInput.value);
            } else {}

            // 更新按钮文本
            this.updateButtonText();

        } catch (error) {
            console.error('加载发布设置失败:', error);
            // 使用默认设置
            this.updateButtonText();
        }
    }

    /**
     * 获取发布设置
     */
    async getPublishSettings() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['autoPublish', 'fullTextMode', 'generateTags'], (result) => {
                resolve(result);
            });
        });
    }

    /**
     * 保存发布设置
     */
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
        const btnText = document.getElementById('extractBtnText');
        const autoPublishToggle = document.getElementById('autoPublishToggle');
        const fullTextModeToggle = document.getElementById('fullTextModeToggle');
        const generateTagsToggle = document.getElementById('generateTagsToggle');

        if (btnText && autoPublishToggle) {
            const autoPublish = autoPublishToggle.checked;
            const currentMode = await this.getCurrentProcessingMode();

            let buttonText = '';

            if (currentMode === 'clip') {
                // 一键剪藏模式
                buttonText = autoPublish ? '一键剪藏并发布为公开笔记' : '一键剪藏并发布为私有笔记';
            } else {
                // AI模式
                if (fullTextModeToggle && generateTagsToggle) {
                    const fullTextMode = fullTextModeToggle.checked;
                    const generateTags = generateTagsToggle.checked;

                    if (fullTextMode) {
                        buttonText = autoPublish ? '整理全文并发布为公开笔记' : '整理全文并发布为私有笔记';
                    } else {
                        buttonText = autoPublish ? '生成总结并发布为公开笔记' : '生成总结并发布为私有笔记';
                    }

                    // 保存AI模式的设置
                    this.savePublishSettings(autoPublish, fullTextMode, generateTags);
                } else {
                    buttonText = autoPublish ? 'AI整理并发布为公开笔记' : 'AI整理并发布为私有笔记';
                }
            }

            btnText.textContent = buttonText;

            // 保存通用设置（自动发布状态）
            if (currentMode === 'clip') {
                this.savePublishSettings(autoPublish, false, false);
            }
        }
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

    /**
     * 处理提取并发布操作
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

            // 获取当前处理模式
            const currentMode = await this.getCurrentProcessingMode();

            // 获取通用设置
            const autoPublishToggle = document.getElementById('autoPublishToggle');
            if (!autoPublishToggle) {
                console.error('设置元素未找到');
                this.showStatus('界面初始化失败，请重新打开插件', 'error');
                return;
            }

            const autoPublish = autoPublishToggle.checked;
            let settings = {
                autoPublish: autoPublish,
                processingMode: currentMode
            };

            // 根据模式获取相应设置
            if (currentMode === 'ai') {
                const fullTextModeToggle = document.getElementById('fullTextModeToggle');
                const generateTagsToggle = document.getElementById('generateTagsToggle');
                const customPromptInput = document.getElementById('customPromptInput');

                if (!fullTextModeToggle || !generateTagsToggle || !customPromptInput) {
                    console.error('AI模式设置元素未找到');
                    this.showStatus('界面初始化失败，请重新打开插件', 'error');
                    return;
                }

                settings.fullTextMode = fullTextModeToggle.checked;
                settings.generateTags = generateTagsToggle.checked;
                settings.customPrompt = customPromptInput.value.trim();
            } else {
                // 一键剪藏模式的默认设置
                settings.fullTextMode = false;
                settings.generateTags = false;
                settings.customPrompt = '';
            }

            // 生成任务ID
            this.taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            this.isTaskRunning = true;

            // 显示进度指示器
            let progressText;
            if (currentMode === 'clip') {
                progressText = autoPublish ? '正在剪藏网页内容...' : '正在剪藏并发布为私有笔记...';
            } else {
                if (settings.fullTextMode) {
                    progressText = autoPublish ? '正在使用AI整理全文内容...' : '正在整理全文并发布为私有笔记...';
                } else {
                    progressText = autoPublish ? '正在使用AI生成内容总结...' : '正在生成总结并发布为私有笔记...';
                }
            }
            this.showProgress(progressText);

            // 保存任务状态到storage
            const taskKey = `task_${tab.id}`;
            const taskData = {
                taskId: this.taskId,
                status: 'running',
                progressText: progressText,
                startTime: Date.now(),
                settings: settings
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
                settings: settings
            }, (response) => {
                // 注意：这个回调可能不会执行，因为popup可能已经关闭
                // 实际的结果处理会通过storage和轮询机制来完成
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
     * 显示状态消息
     */
    showStatus(message, type = 'info') {
        const statusEl = document.getElementById('status');
        statusEl.textContent = message;
        statusEl.className = `status ${type}`;

        // 自动隐藏成功消息
        if (type === 'success') {
            setTimeout(() => {
                statusEl.style.display = 'none';
            }, 3000);
        }
    }

    /**
     * 显示进度指示器
     */
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
            const stepIndicator = this.getStepIndicator(step, total);
            if (progressText) {
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

        progressEl.style.display = 'block';

        // 显示取消按钮
        if (cancelBtn) {
            cancelBtn.style.display = 'flex';
        }

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

    /**
     * 隐藏进度指示器
     */
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

        progressEl.style.display = 'none';

        // 隐藏取消按钮
        if (cancelBtn) {
            cancelBtn.style.display = 'none';
        }
    }

    /**
     * 显示处理结果
     */
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
     * 隐藏结果显示
     */
    hideResult() {
        document.getElementById('result').style.display = 'none';
    }

    /**
     * 切换到侧边栏模式
     */
    async toggleToSidePanelMode() {
        try {
            // 获取当前标签页
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                this.showStatus('无法获取当前标签页', 'error');
                return;
            }

            // 直接在用户手势同步上下文中操作，避免通过background script
            // 1. 先清除popup设置
            await chrome.action.setPopup({ popup: '' });

            // 2. 立即在同步上下文中打开侧边栏
            if (chrome.sidePanel) {
                await chrome.sidePanel.open({ tabId: tab.id });
                // 3. 关闭当前popup窗口
                window.close();
            } else {
                throw new Error('当前Chrome版本不支持侧边栏API');
            }

        } catch (error) {
            console.error('切换模式失败:', error);
            this.showStatus('切换模式失败: ' + error.message, 'error');

            // 如果切换失败，尝试恢复popup设置
            try {
                await chrome.action.setPopup({ popup: 'popup.html' });
            } catch (restoreError) {
                console.error('恢复popup设置失败:', restoreError);
            }
        }
    }

    /**
     * 显示帮助信息
     */
    showHelp() {
        const helpContent = {
            '核心功能': [
                '智能内容提取：自动识别网页主要内容',
                'AI整理优化：使用AI对内容进行格式化和结构优化',
                '一键剪藏：直接保存网页内容，转换为墨问富文本格式',
                '一键发布：直接发布到墨问笔记平台'
            ],
            '处理模式': [
                'AI智能整理（推荐） - 总结模式：提取文章要点，适合长文快速阅读',
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

    /**
     * 运行诊断
     */
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

            // 添加当前页面检查
            diagnosticResults.push('');
            diagnosticResults.push('📄 当前页面检查:');

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                const canInject = this.canInjectScript(tab.url);
                diagnosticResults.push(`• URL: ${tab.url.substring(0, 60)}...`);
                diagnosticResults.push(`• 可注入脚本: ${canInject ? '✅' : '❌'}`);

                if (!canInject) {
                    diagnosticResults.push('• ⚠️ 当前页面不支持内容提取');
                }
            }

            // 检查页面内容
            if (this.currentPageData) {
                diagnosticResults.push('✅ 页面内容已提取');
                diagnosticResults.push(`📝 内容长度: ${this.currentPageData.content ? this.currentPageData.content.length : 0} 字符`);
            } else {
                diagnosticResults.push('❌ 页面内容未提取');
            }

            // 检查网络连接（如果配置完整）
            if (this.validateConfig(config)) {
                diagnosticResults.push('');
                diagnosticResults.push('🌐 网络连接检查:');

                // 测试AI API
                try {
                    const aiResponse = await fetch(config.aiApiUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${config.aiApiKey}`
                        },
                        body: JSON.stringify({
                            model: config.aiModel,
                            messages: [{ role: 'user', content: '测试' }],
                            max_tokens: 1
                        })
                    });

                    if (aiResponse.ok) {
                        diagnosticResults.push('✅ AI API连接正常');
                    } else {
                        diagnosticResults.push(`❌ AI API连接失败: ${aiResponse.status}`);
                    }
                } catch (error) {
                    diagnosticResults.push(`❌ AI API连接错误: ${error.message}`);
                }

                // 测试墨问API
                try {
                    const mowenResponse = await fetch('https://open.mowen.cn/api/open/api/v1/note/create', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${config.mowenApiKey}`
                        },
                        body: JSON.stringify({
                            body: { type: "doc", content: [] }
                        })
                    });

                    if (mowenResponse.status === 401) {
                        diagnosticResults.push('❌ 墨问API密钥无效');
                    } else if (mowenResponse.status === 403) {
                        diagnosticResults.push('❌ 墨问API权限不足（可能不是Pro会员）');
                    } else if (mowenResponse.status === 400) {
                        diagnosticResults.push('✅ 墨问API连接正常（密钥有效）');
                    } else {
                        diagnosticResults.push(`✅ 墨问API连接正常`);
                    }
                } catch (error) {
                    diagnosticResults.push(`❌ 墨问API连接错误: ${error.message}`);
                }
            }

            // 显示诊断结果
            this.hideProgress();
            this.showDiagnosticResult(diagnosticResults.join('\n'));

        } catch (error) {
            this.hideProgress();
            this.showStatus('诊断失败: ' + error.message, 'error');
        }
    }

    /**
     * 显示诊断结果
     */
    showDiagnosticResult(results) {
        const resultEl = document.getElementById('result');
        const resultContent = document.getElementById('resultContent');

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

        resultEl.style.display = 'block';
    }

    /**
     * 显示反馈信息
     */
    showFeedback() {
        const feedbackContent = `
如有问题或建议，请通过以下方式联系：

1. GitHub Issues
2. 邮箱反馈
3. 墨问社区

感谢您的使用和反馈！
    `;

        alert(feedbackContent);
    }

    /**
     * 检查是否有正在进行的任务
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

            // 如果没有任务数据，直接返回
            if (!taskData) {
                return;
            }

            // 检查任务是否超时（超过5分钟自动清理）
            const taskAge = Date.now() - (taskData.startTime || taskData.updateTime || 0);
            const TASK_TIMEOUT = 5 * 60 * 1000; // 5分钟

            if (taskAge > TASK_TIMEOUT) {
                await this.clearTaskState();
                this.showStatus('检测到超时任务已自动清理，可以重新开始', 'warning');
                return;
            }

            // 检查任务是否正在进行中
            if (taskData.status === 'running' || taskData.status === 'processing') {
                this.isTaskRunning = true;
                this.taskId = taskData.taskId;

                // 恢复任务状态显示
                this.showProgress(taskData.progressText || '正在处理...', taskData);

                // 禁用按钮
                const extractBtn = document.getElementById('extractBtn');
                if (extractBtn) {
                    extractBtn.disabled = true;
                }

                this.showStatus('检测到正在进行的任务，正在恢复状态...', 'info');

                // 设置定时器检查任务完成状态，并添加超时保护
                this.startTaskPolling(tab.id, taskAge);

            } else if (taskData.status === 'completed' || taskData.status === 'failed') {
                // 如果任务已经完成或失败，但数据还在，清理掉
                await this.clearTaskState();

            } else {
                await this.clearTaskState();
            }

        } catch (error) {
            console.error('检查任务状态失败:', error);
            // 如果检查失败，尝试清理可能损坏的数据
            await this.clearTaskState();
        }
    }

    /**
     * 开始轮询任务状态
     */
    startTaskPolling(tabId, initialTaskAge = 0) {
        const POLLING_TIMEOUT = 10 * 60 * 1000; // 10分钟轮询超时
        const startTime = Date.now();
        let pollCount = 0;

        const pollInterval = setInterval(async() => {
            try {
                pollCount++;
                const elapsedTime = Date.now() - startTime + initialTaskAge;

                // 检查轮询是否超时
                if (elapsedTime > POLLING_TIMEOUT) {
                    clearInterval(pollInterval);
                    await this.handlePollingTimeout(tabId);
                    return;
                }

                const taskKey = `task_${tabId}`;
                const result = await new Promise((resolve) => {
                    chrome.storage.local.get([taskKey], resolve);
                });

                const taskData = result[taskKey];

                // 如果任务数据不存在，停止轮询
                if (!taskData) {
                    clearInterval(pollInterval);
                    this.handleTaskDataMissing();
                    return;
                }

                // 检查任务是否已完成（无论成功还是失败）
                if (taskData.status === 'completed') {
                    clearInterval(pollInterval);
                    this.handleTaskCompleted(taskData);
                    chrome.storage.local.remove([taskKey]);
                } else if (taskData.status === 'failed') {
                    clearInterval(pollInterval);
                    this.handleTaskFailed(taskData);
                    chrome.storage.local.remove([taskKey]);
                } else if (taskData.status === 'processing') {
                    // 任务正在处理中，更新进度显示
                    this.showProgress(taskData.progressText || '正在处理...', taskData);
                } else if (taskData.status === 'running') {
                    // 任务正在运行中，保持当前显示
                    // 这个状态主要是popup刚启动时的状态
                } else {
                    // 未知状态，记录警告但继续轮询
                    }

            } catch (error) {
                console.error('轮询任务状态失败:', error);
                clearInterval(pollInterval);
                this.handlePollingError(error);
            }
        }, 1000); // 每秒检查一次

        // 保存轮询间隔ID，以便可以在其他地方清理
        this.currentPollInterval = pollInterval;
    }

    /**
     * 处理轮询超时
     */
    async handlePollingTimeout(tabId) {
        this.isTaskRunning = false;
        this.hideProgress();

        const extractBtn = document.getElementById('extractBtn');
        if (extractBtn) {
            extractBtn.disabled = false;
        }

        // 清理任务状态
        await this.clearTaskState();

        this.showStatus('任务处理超时，已自动重置。如果问题持续，请尝试强制重置 (Ctrl+Shift+R)', 'error');

        // 显示诊断按钮
        const diagnoseBtn = document.getElementById('diagnoseBtn');
        if (diagnoseBtn) {
            diagnoseBtn.style.display = 'flex';
        }
    }

    /**
     * 处理任务数据丢失
     */
    handleTaskDataMissing() {
        this.isTaskRunning = false;
        this.hideProgress();

        const extractBtn = document.getElementById('extractBtn');
        if (extractBtn) {
            extractBtn.disabled = false;
        }

        this.showStatus('任务状态丢失，已重置。可以重新开始操作', 'warning');
    }

    /**
     * 处理轮询错误
     */
    handlePollingError(error) {
        this.isTaskRunning = false;
        this.hideProgress();

        const extractBtn = document.getElementById('extractBtn');
        if (extractBtn) {
            extractBtn.disabled = false;
        }

        this.showStatus('任务状态检查出错，已重置: ' + error.message, 'error');
    }

    /**
     * 处理任务完成
     */
    handleTaskCompleted(taskData) {
        this.isTaskRunning = false;
        this.hideProgress();

        // 完全重置UI状态，确保所有按钮和元素正常显示
        this.resetUIState();

        if (taskData.result) {
            // 构建更详细的成功消息
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

    /**
     * 处理任务失败
     */
    handleTaskFailed(taskData) {
        this.isTaskRunning = false;
        this.hideProgress();

        // 完全重置UI状态
        this.resetUIState();

        // 显示详细的错误信息
        const errorMessage = taskData.error || '未知错误';
        this.showStatus(`任务失败: ${errorMessage}`, 'error');

        // 显示诊断按钮，帮助用户排查问题
        const diagnoseBtn = document.getElementById('diagnoseBtn');
        if (diagnoseBtn) {
            diagnoseBtn.style.display = 'flex';
        }

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

    /**
     * 处理取消任务
     */
    async handleCancelTask() {
        try {
            // 如果没有正在运行的任务，直接返回
            if (!this.isTaskRunning) {
                this.showStatus('当前没有正在运行的任务', 'warning');
                return;
            }

            // 显示确认对话框
            const confirmed = confirm('确定要取消当前任务吗？\n\n注意：已经在后台进行的AI处理可能仍会继续，但不会发布到墨问笔记。');
            if (!confirmed) {
                return;
            }

            // 清理轮询间隔
            if (this.currentPollInterval) {
                clearInterval(this.currentPollInterval);
                this.currentPollInterval = null;
            }

            // 重置任务状态
            this.isTaskRunning = false;
            this.taskId = null;

            // 隐藏进度指示器和取消按钮
            this.hideProgress();

            // 重新启用主要按钮
            const extractBtn = document.getElementById('extractBtn');
            if (extractBtn) {
                extractBtn.disabled = false;
            }

            // 清理存储的任务状态
            await this.clearTaskState();

            // 显示取消成功消息
            this.showStatus('任务已取消', 'info');

        } catch (error) {
            console.error('取消任务失败:', error);
            this.showStatus('取消任务失败: ' + error.message, 'error');
        }
    }

    /**
     * 清理任务状态
     */
    async clearTaskState() {
        try {
            // 获取当前标签页
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                const taskKey = `task_${tab.id}`;

                // 从storage中移除任务状态
                await new Promise((resolve) => {
                    chrome.storage.local.remove([taskKey], resolve);
                });
            }
        } catch (error) {
            console.error('清理任务状态失败:', error);
        }
    }

    /**
     * 添加强制重置功能（开发调试用）
     */
    addForceResetFeature() {
        // 添加键盘快捷键：Ctrl+Shift+R 强制重置
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'R') {
                e.preventDefault();
                this.forceReset();
            }
        });

        // 在页面标题上双击也可以强制重置（隐藏功能）
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
    }

    /**
     * 强制重置所有状态
     */
    async forceReset() {
        try {
            const confirmed = confirm('强制重置将清除所有任务状态和缓存数据，确定继续吗？\n\n快捷键：Ctrl+Shift+R\n隐藏功能：三击页面标题');
            if (!confirmed) return;

            // 清理轮询间隔
            if (this.currentPollInterval) {
                clearInterval(this.currentPollInterval);
                this.currentPollInterval = null;
            }

            // 重置内部状态
            this.isTaskRunning = false;
            this.taskId = null;

            // 重置UI状态
            this.hideProgress();
            this.hideResult();

            // 重新启用所有按钮
            const extractBtn = document.getElementById('extractBtn');
            const cancelBtn = document.getElementById('cancelBtn');
            const diagnoseBtn = document.getElementById('diagnoseBtn');

            if (extractBtn) extractBtn.disabled = false;
            if (cancelBtn) cancelBtn.style.display = 'none';
            if (diagnoseBtn) diagnoseBtn.style.display = 'none';

            // 清除所有任务相关的storage数据
            await this.clearAllTaskStates();

            // 显示重置成功消息
            this.showStatus('状态已强制重置，可以重新开始操作', 'success');

        } catch (error) {
            console.error('强制重置失败:', error);
            this.showStatus('强制重置失败: ' + error.message, 'error');
        }
    }

    /**
     * 清除所有任务状态
     */
    async clearAllTaskStates() {
        try {
            // 获取所有storage数据
            const allData = await new Promise((resolve) => {
                chrome.storage.local.get(null, resolve);
            });

            // 找出所有以task_开头的键
            const taskKeys = Object.keys(allData).filter(key => key.startsWith('task_'));

            if (taskKeys.length > 0) {
                // 删除所有任务相关数据
                await new Promise((resolve) => {
                    chrome.storage.local.remove(taskKeys, resolve);
                });
            } else {
                }
        } catch (error) {
            console.error('清除任务状态失败:', error);
        }
    }

    /**
     * 转义HTML特殊字符
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 当DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    // 添加一个小延迟确保所有元素都已渲染
    setTimeout(() => {
        new PopupController();
    }, 50);
});