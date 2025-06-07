// 设置页面脚本
class OptionsController {
    constructor() {
        this.init();
    }

    /**
     * 初始化设置页面
     */
    async init() {
        this.bindEvents();
        await this.loadSettings();
    }

    /**
     * 绑定事件监听器
     */
    bindEvents() {
        // 墨问配置表单提交
        document.getElementById('mowenConfigForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveMowenSettings();
        });

        // AI配置表单提交
        document.getElementById('aiConfigForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveAiSettings();
        });

        // 高级设置表单提交
        document.getElementById('advancedConfigForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveAdvancedSettings();
        });

        // 测试墨问连接按钮
        document.getElementById('testMowenBtn').addEventListener('click', () => {
            this.testMowenConnection();
        });

        // 测试AI连接按钮
        document.getElementById('testAiBtn').addEventListener('click', () => {
            this.testAiConnection();
        });

        // 重置设置按钮
        document.getElementById('resetBtn').addEventListener('click', () => {
            this.resetSettings();
        });

        // 关于链接
        document.getElementById('aboutLink').addEventListener('click', (e) => {
            e.preventDefault();
            this.showAbout();
        });

        // 输入框变化时清除状态
        const inputs = document.querySelectorAll('.form-input');
        inputs.forEach(input => {
            input.addEventListener('input', () => {
                // 根据输入框所在的配置区域清除对应的状态
                if (input.id === 'mowenApiKey') {
                    this.clearMowenStatus();
                } else if (input.id === 'aiApiUrl' || input.id === 'aiApiKey' || input.id === 'aiModel') {
                    this.clearAiStatus();
                } else {
                    this.clearStatus();
                }
            });
        });

        // 密码显示/隐藏切换
        this.bindPasswordToggleEvents();
    }

    /**
     * 绑定密码显示/隐藏切换事件
     */
    bindPasswordToggleEvents() {
        const toggleButtons = document.querySelectorAll('.password-toggle');

        toggleButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                this.togglePasswordVisibility(button);
            });
        });
    }

    /**
     * 切换密码显示/隐藏状态
     * @param {HTMLElement} toggleButton - 切换按钮元素
     */
    togglePasswordVisibility(toggleButton) {
        const targetId = toggleButton.getAttribute('data-target');
        const passwordInput = document.getElementById(targetId);
        const eyeOpenIcon = toggleButton.querySelector('.eye-open');
        const eyeClosedIcon = toggleButton.querySelector('.eye-closed');

        if (!passwordInput || !eyeOpenIcon || !eyeClosedIcon) {
            console.error('密码切换功能：找不到相关元素');
            return;
        }

        // 切换输入框类型
        if (passwordInput.type === 'password') {
            // 显示密码
            passwordInput.type = 'text';
            eyeOpenIcon.style.display = 'none';
            eyeClosedIcon.style.display = 'block';
            toggleButton.title = '隐藏密钥';
        } else {
            // 隐藏密码
            passwordInput.type = 'password';
            eyeOpenIcon.style.display = 'block';
            eyeClosedIcon.style.display = 'none';
            toggleButton.title = '显示密钥';
        }

        // 保持输入框焦点（如果之前有焦点）
        if (document.activeElement === passwordInput) {
            passwordInput.focus();
        }
    }

    /**
     * 加载已保存的设置
     */
    async loadSettings() {
        try {
            const settings = await this.getStoredSettings();

            // 填充表单
            if (settings.aiApiUrl) {
                document.getElementById('aiApiUrl').value = settings.aiApiUrl;
            }
            if (settings.aiApiKey) {
                document.getElementById('aiApiKey').value = settings.aiApiKey;
            }
            if (settings.aiModel) {
                document.getElementById('aiModel').value = settings.aiModel;
            }
            if (settings.mowenApiKey) {
                document.getElementById('mowenApiKey').value = settings.mowenApiKey;
            }

            // 设置复选框
            document.getElementById('includeSource').checked = settings.includeSource !== false;

            this.showStatus('设置已加载', 'success');

        } catch (error) {
            console.error('加载设置失败:', error);
            this.showStatus('加载设置失败: ' + error.message, 'error');
        }
    }

    /**
     * 获取存储的设置
     */
    async getStoredSettings() {
        return new Promise((resolve) => {
            chrome.storage.sync.get([
                'aiApiUrl',
                'aiApiKey',
                'aiModel',
                'mowenApiKey',
                'includeSource'
            ], (result) => {
                resolve(result);
            });
        });
    }

    /**
     * 保存墨问配置
     */
    async saveMowenSettings() {
        try {
            // 获取墨问配置数据
            const mowenApiKey = document.getElementById('mowenApiKey').value.trim();

            // 验证必填字段 - 只校验墨问API key
            if (!mowenApiKey) {
                this.showMowenStatus('请填写墨问API密钥', 'error');
                return;
            }

            // 保存到存储
            await this.saveToStorage({ mowenApiKey });

            this.showMowenStatus('墨问配置已保存', 'success');

        } catch (error) {
            console.error('保存墨问配置失败:', error);
            this.showMowenStatus('保存墨问配置失败: ' + error.message, 'error');
        }
    }

    /**
     * 保存AI配置
     */
    async saveAiSettings() {
        try {
            // 获取AI配置数据
            const aiApiUrl = document.getElementById('aiApiUrl').value.trim();
            const aiApiKey = document.getElementById('aiApiKey').value.trim();
            const aiModel = document.getElementById('aiModel').value.trim();

            const settings = {};

            // 只保存非空字段
            if (aiApiUrl) {
                // 验证URL格式
                try {
                    new URL(aiApiUrl);
                    settings.aiApiUrl = aiApiUrl;
                } catch (error) {
                    this.showAiStatus('AI API地址格式不正确', 'error');
                    return;
                }
            }

            if (aiApiKey) {
                settings.aiApiKey = aiApiKey;
            }

            if (aiModel) {
                settings.aiModel = aiModel;
            }

            // 保存到存储
            if (Object.keys(settings).length > 0) {
                await this.saveToStorage(settings);
                this.showAiStatus('AI配置已保存', 'success');
            } else {
                this.showAiStatus('请填写至少一个AI配置项', 'warning');
            }

        } catch (error) {
            console.error('保存AI配置失败:', error);
            this.showAiStatus('保存AI配置失败: ' + error.message, 'error');
        }
    }

    /**
     * 保存高级设置
     */
    async saveAdvancedSettings() {
        try {
            // 获取高级设置
            const settings = {
                includeSource: document.getElementById('includeSource').checked
            };

            // 保存到存储
            await this.saveToStorage(settings);

            this.showStatus('高级设置已保存', 'success');

        } catch (error) {
            console.error('保存高级设置失败:', error);
            this.showStatus('保存高级设置失败: ' + error.message, 'error');
        }
    }

    /**
     * 测试墨问连接
     */
    async testMowenConnection() {
        try {
            // 获取当前墨问配置
            const mowenApiKey = document.getElementById('mowenApiKey').value.trim();

            if (!mowenApiKey) {
                this.showMowenStatus('请先填写墨问API密钥', 'warning');
                return;
            }

            // 显示测试状态
            const testBtn = document.getElementById('testMowenBtn');
            const originalText = testBtn.innerHTML;
            testBtn.innerHTML = '<div class="loading"></div> 测试中...';
            testBtn.disabled = true;

            // 测试墨问API
            this.showMowenStatus('正在测试墨问API连接...', 'info');
            await this.testMowenAPI(mowenApiKey);

            this.showMowenStatus('墨问API连接测试成功！', 'success');

        } catch (error) {
            console.error('测试墨问连接失败:', error);
            this.showMowenStatus('墨问连接测试失败: ' + error.message, 'error');
        } finally {
            // 恢复按钮状态
            const testBtn = document.getElementById('testMowenBtn');
            testBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 12l2 2 4-4"></path>
          <path d="M21 12c-1 0-3-1-3-3s2-3 3-3 3 1 3 3-2 3-3 3"></path>
          <path d="M3 12c1 0 3-1 3-3s-2-3-3-3-3 1-3 3 2 3 3 3"></path>
        </svg>
        测试墨问连接
      `;
            testBtn.disabled = false;
        }
    }

    /**
     * 测试AI连接
     */
    async testAiConnection() {
        try {
            // 获取当前AI配置
            const aiApiUrl = document.getElementById('aiApiUrl').value.trim();
            const aiApiKey = document.getElementById('aiApiKey').value.trim();
            const aiModel = document.getElementById('aiModel').value.trim();

            if (!aiApiUrl || !aiApiKey || !aiModel) {
                this.showAiStatus('请先填写所有AI配置字段', 'warning');
                return;
            }

            // 显示测试状态
            const testBtn = document.getElementById('testAiBtn');
            const originalText = testBtn.innerHTML;
            testBtn.innerHTML = '<div class="loading"></div> 测试中...';
            testBtn.disabled = true;

            // 测试AI API
            this.showAiStatus('正在测试AI API连接...', 'info');
            await this.testAIAPI(aiApiUrl, aiApiKey, aiModel);

            this.showAiStatus('AI API连接测试成功！', 'success');

        } catch (error) {
            console.error('测试AI连接失败:', error);
            this.showAiStatus('AI连接测试失败: ' + error.message, 'error');
        } finally {
            // 恢复按钮状态
            const testBtn = document.getElementById('testAiBtn');
            testBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 12l2 2 4-4"></path>
          <path d="M21 12c-1 0-3-1-3-3s2-3 3-3 3 1 3 3-2 3-3 3"></path>
          <path d="M3 12c1 0 3-1 3-3s-2-3-3-3-3 1-3 3 2 3 3 3"></path>
        </svg>
        测试AI连接
      `;
            testBtn.disabled = false;
        }
    }

    /**
     * 测试AI API
     */
    async testAIAPI(apiUrl, apiKey, model) {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [{
                    role: 'user',
                    content: '测试连接'
                }],
                max_tokens: 10
            })
        });

        if (!response.ok) {
            let errorMessage = `AI API测试失败: ${response.status} ${response.statusText}`;

            if (response.status === 401) {
                errorMessage = 'AI API密钥无效或已过期';
            } else if (response.status === 403) {
                errorMessage = 'AI API访问被拒绝，请检查密钥权限或余额';
            } else if (response.status === 429) {
                errorMessage = 'AI API请求过于频繁，请稍后重试';
            } else if (response.status === 404) {
                errorMessage = 'AI API地址不正确';
            } else if (response.status >= 500) {
                errorMessage = 'AI服务暂时不可用';
            }

            throw new Error(errorMessage);
        }

        const result = await response.json();
        if (!result.choices || !result.choices[0]) {
            throw new Error('AI API返回格式不正确');
        }
    }

    /**
     * 测试墨问API
     */
    async testMowenAPI(apiKey) {
        // 这里我们可以调用一个简单的API来测试连接
        // 由于墨问API可能没有专门的测试接口，我们可以尝试调用创建接口但不实际创建
        const response = await fetch('https://open.mowen.cn/api/open/api/v1/note/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                body: {
                    type: "doc",
                    content: [{
                        type: "paragraph",
                        content: [{
                            type: "text",
                            text: "测试连接"
                        }]
                    }]
                },
                settings: {
                    autoPublish: false
                }
            })
        });

        if (!response.ok) { // Handles 4xx and 5xx errors
            if (response.status === 400) {
                try {
                    const errorData = await response.json();
                    if (errorData && (errorData.reason === "LOGIN" || (errorData.message && errorData.message.toLowerCase().includes("invalid api key")))) {
                        throw new Error('墨问API密钥无效或已过期 (400 Bad Request)');
                    }
                    // If it's a 400 but NOT the specific API key error, we consider it a "successful" test ping.
                    // So, we do nothing here, and it won't be caught by the generic error below.
                    // The function will then successfully complete.
                } catch (e) {
                    // This catch is for JSON parsing errors or if the specific error was thrown above
                    if (e.message.includes('墨问API密钥无效或已过期')) throw e;
                    // If JSON parsing failed for a 400 that wasn't the specific API key error,
                    // we can still treat it as a "successful" ping for the test's purpose.
                    // Or, throw a more generic 400 error:
                    // throw new Error(`墨问API测试数据问题 (400): ${await response.text()}`);
                    // For now, let's stick to the original logic: a 400 not matching the API key issue is "ok for test".
                }
            } else if (response.status === 401) {
                throw new Error('墨问API密钥无效或已过期');
            } else if (response.status === 403) {
                const errorText = await response.text(); // Ensure to await text() if used
                if (errorText.includes('Quota')) {
                    throw new Error('墨问API配额不足');
                } else {
                    throw new Error('墨问API权限不足，请检查是否为Pro会员');
                }
            } else {
                // For any other error that is not 2xx and not the "good" 400
                throw new Error(`墨问API测试失败: ${response.status} ${response.statusText}`);
            }
        }
        // If response.ok is true (2xx), or if it was a 400 not caught above, we reach here, indicating success.
    }

    /**
     * 重置设置
     */
    async resetSettings() {
        if (!confirm('确定要重置所有设置吗？此操作不可撤销。')) {
            return;
        }

        try {
            // 清除存储
            await this.clearStorage();

            // 重置表单
            document.getElementById('configForm').reset();

            // 重置复选框为默认值
            document.getElementById('includeSource').checked = true;

            this.showStatus('设置已重置', 'success');

        } catch (error) {
            console.error('重置设置失败:', error);
            this.showStatus('重置设置失败: ' + error.message, 'error');
        }
    }

    /**
     * 清除存储
     */
    async clearStorage() {
        return new Promise((resolve, reject) => {
            chrome.storage.sync.clear(() => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * 显示状态消息
     */
    showStatus(message, type = 'info') {
        const statusEl = document.getElementById('status');
        statusEl.textContent = message;
        statusEl.className = `status ${type}`;
        statusEl.style.display = 'block';

        // 添加淡入动画
        statusEl.classList.add('fade-in');

        // 自动隐藏成功消息
        if (type === 'success') {
            setTimeout(() => {
                statusEl.style.display = 'none';
            }, 3000);
        }
    }

    /**
     * 显示墨问配置状态消息
     */
    showMowenStatus(message, type = 'info') {
        const statusEl = document.getElementById('mowenStatus');
        statusEl.textContent = message;
        statusEl.className = `status ${type}`;
        statusEl.style.display = 'block';

        // 添加淡入动画
        statusEl.classList.add('fade-in');

        // 自动隐藏成功消息
        if (type === 'success') {
            setTimeout(() => {
                statusEl.style.display = 'none';
            }, 3000);
        }
    }

    /**
     * 显示AI配置状态消息
     */
    showAiStatus(message, type = 'info') {
        const statusEl = document.getElementById('aiStatus');
        statusEl.textContent = message;
        statusEl.className = `status ${type}`;
        statusEl.style.display = 'block';

        // 添加淡入动画
        statusEl.classList.add('fade-in');

        // 自动隐藏成功消息
        if (type === 'success') {
            setTimeout(() => {
                statusEl.style.display = 'none';
            }, 3000);
        }
    }

    /**
     * 清除状态显示
     */
    clearStatus() {
        const statusEl = document.getElementById('status');
        statusEl.style.display = 'none';
    }

    /**
     * 显示关于信息
     */
    showAbout() {
        const aboutContent = `
墨问笔记助手 v1.0.0

这是一个Chrome浏览器插件，可以帮助您：
• 智能提取网页内容
• 使用AI整理和格式化内容
• 自动发布到墨问笔记

技术特性：
• 支持OpenAI兼容的AI模型
• 安全的本地数据存储
• 现代化的用户界面
• 完整的错误处理

开发者：墨问团队
版本：1.0.0
更新时间：2024年

感谢您的使用！
    `;

        alert(aboutContent);
    }

    /**
     * 保存设置到存储
     */
    async saveToStorage(settings) {
        return new Promise((resolve, reject) => {
            chrome.storage.sync.set(settings, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * 清除墨问状态
     */
    clearMowenStatus() {
        const statusEl = document.getElementById('mowenStatus');
        statusEl.style.display = 'none';
    }

    /**
     * 清除AI状态
     */
    clearAiStatus() {
        const statusEl = document.getElementById('aiStatus');
        statusEl.style.display = 'none';
    }
}

// 当DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    new OptionsController();
});