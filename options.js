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
        // 表单提交
        document.getElementById('configForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveSettings();
        });

        // 测试连接按钮
        document.getElementById('testBtn').addEventListener('click', () => {
            this.testConnection();
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
                this.clearStatus();
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
            document.getElementById('autoPublish').checked = settings.autoPublish !== false;
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
                'autoPublish',
                'includeSource'
            ], (result) => {
                resolve(result);
            });
        });
    }

    /**
     * 保存设置
     */
    async saveSettings() {
        try {
            // 获取表单数据
            const formData = new FormData(document.getElementById('configForm'));
            const settings = {};

            // 处理文本输入
            for (const [key, value] of formData.entries()) {
                if (value.trim()) {
                    settings[key] = value.trim();
                }
            }

            // 处理复选框
            settings.autoPublish = document.getElementById('autoPublish').checked;
            settings.includeSource = document.getElementById('includeSource').checked;

            // 验证必填字段
            const requiredFields = ['aiApiUrl', 'aiApiKey', 'aiModel', 'mowenApiKey'];
            const missingFields = requiredFields.filter(field => !settings[field]);

            if (missingFields.length > 0) {
                this.showStatus(`请填写必填字段: ${missingFields.join(', ')}`, 'error');
                return;
            }

            // 验证URL格式
            try {
                new URL(settings.aiApiUrl);
            } catch (error) {
                this.showStatus('AI API地址格式不正确', 'error');
                return;
            }

            // 保存到存储
            await this.saveToStorage(settings);

            this.showStatus('设置已保存', 'success');

        } catch (error) {
            console.error('保存设置失败:', error);
            this.showStatus('保存设置失败: ' + error.message, 'error');
        }
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
     * 测试连接
     */
    async testConnection() {
        try {
            // 获取当前表单数据
            const aiApiUrl = document.getElementById('aiApiUrl').value.trim();
            const aiApiKey = document.getElementById('aiApiKey').value.trim();
            const aiModel = document.getElementById('aiModel').value.trim();
            const mowenApiKey = document.getElementById('mowenApiKey').value.trim();

            if (!aiApiUrl || !aiApiKey || !aiModel || !mowenApiKey) {
                this.showStatus('请先填写所有必填字段', 'warning');
                return;
            }

            // 显示测试状态
            const testBtn = document.getElementById('testBtn');
            const originalText = testBtn.innerHTML;
            testBtn.innerHTML = '<div class="loading"></div> 测试中...';
            testBtn.disabled = true;

            // 测试AI API
            this.showStatus('正在测试AI API连接...', 'info');
            await this.testAIAPI(aiApiUrl, aiApiKey, aiModel);

            // 测试墨问API
            this.showStatus('正在测试墨问API连接...', 'info');
            await this.testMowenAPI(mowenApiKey);

            this.showStatus('所有API连接测试成功！', 'success');

        } catch (error) {
            console.error('测试连接失败:', error);
            this.showStatus('连接测试失败: ' + error.message, 'error');
        } finally {
            // 恢复按钮状态
            const testBtn = document.getElementById('testBtn');
            testBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 12l2 2 4-4"></path>
          <path d="M21 12c-1 0-3-1-3-3s2-3 3-3 3 1 3 3-2 3-3 3"></path>
          <path d="M3 12c1 0 3-1 3-3s-2-3-3-3-3 1-3 3 2 3 3 3"></path>
        </svg>
        测试连接
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

        // 如果返回401，说明API密钥无效
        if (response.status === 401) {
            throw new Error('墨问API密钥无效或已过期');
        }

        // 如果返回403，可能是权限问题或配额问题
        if (response.status === 403) {
            const errorText = await response.text();
            if (errorText.includes('Quota')) {
                throw new Error('墨问API配额不足');
            } else {
                throw new Error('墨问API权限不足，请检查是否为Pro会员');
            }
        }

        // 其他错误状态
        if (!response.ok && response.status !== 400) {
            throw new Error(`墨问API测试失败: ${response.status} ${response.statusText}`);
        }

        // 400错误可能是因为测试数据格式问题，但说明API密钥是有效的
        // 200或400都表示连接成功
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
            document.getElementById('autoPublish').checked = true;
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
}

// 当DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    new OptionsController();
});