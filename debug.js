// 墨问笔记助手调试工具
// 在浏览器控制台中运行此脚本来测试内容提取功能

(function() {
    'use strict';

    console.log('🔧 墨问笔记助手调试工具已加载');

    // 调试工具对象
    window.MowenDebugger = {

        /**
         * 测试内容脚本是否已加载
         */
        async testContentScript() {
            console.log('📋 测试内容脚本状态...');

            try {
                // 获取当前标签页
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                console.log('当前标签页:', tab);

                // 发送ping消息
                chrome.tabs.sendMessage(tab.id, { action: 'ping' }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('❌ 内容脚本未响应:', chrome.runtime.lastError.message);
                        console.log('💡 建议：尝试刷新页面或手动注入内容脚本');
                    } else {
                        console.log('✅ 内容脚本已准备好:', response);
                    }
                });

            } catch (error) {
                console.error('❌ 测试失败:', error);
            }
        },

        /**
         * 手动注入内容脚本
         */
        async injectContentScript() {
            console.log('💉 手动注入内容脚本...');

            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js']
                });

                console.log('✅ 内容脚本注入成功');

                // 等待一秒后测试
                setTimeout(() => {
                    this.testContentScript();
                }, 1000);

            } catch (error) {
                console.error('❌ 注入失败:', error);
            }
        },

        /**
         * 测试内容提取
         */
        async testContentExtraction() {
            console.log('📄 测试内容提取...');

            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

                chrome.tabs.sendMessage(tab.id, { action: 'extractContent' }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('❌ 内容提取失败:', chrome.runtime.lastError.message);
                    } else if (response && response.success) {
                        console.log('✅ 内容提取成功:');
                        console.log('📝 标题:', response.data.title);
                        console.log('📏 内容长度:', response.data.content.length);
                        console.log('🔗 URL:', response.data.url);
                        console.log('📄 内容预览:', response.data.content.substring(0, 200) + '...');
                        console.log('📊 完整数据:', response.data);
                    } else {
                        console.error('❌ 提取失败:', response);
                    }
                });

            } catch (error) {
                console.error('❌ 测试失败:', error);
            }
        },

        /**
         * 检查页面类型
         */
        checkPageType() {
            console.log('🔍 检查页面类型...');

            const url = window.location.href;
            console.log('🔗 当前URL:', url);

            // 检查是否为受限页面
            const restrictedProtocols = [
                'chrome://',
                'chrome-extension://',
                'moz-extension://',
                'edge://',
                'about:',
                'data:',
                'file://'
            ];

            const isRestricted = restrictedProtocols.some(protocol => url.startsWith(protocol));

            if (isRestricted) {
                console.warn('⚠️ 当前页面为受限页面，无法注入内容脚本');
                console.log('💡 建议：请在普通网页（http://或https://）上测试');
            } else {
                console.log('✅ 当前页面支持内容脚本注入');
            }

            // 检查页面内容
            const contentSelectors = [
                'article',
                'main',
                '[role="main"]',
                '.content',
                '.post-content',
                '.entry-content'
            ];

            console.log('🔍 检查页面内容结构...');
            contentSelectors.forEach(selector => {
                const element = document.querySelector(selector);
                if (element) {
                    console.log(`✅ 找到内容容器: ${selector}`, element);
                    console.log(`📏 内容长度: ${element.textContent.length}`);
                }
            });
        },

        /**
         * 显示帮助信息
         */
        showHelp() {
            console.log(`
🔧 墨问笔记助手调试工具使用说明

可用命令：
• MowenDebugger.testContentScript()     - 测试内容脚本状态
• MowenDebugger.injectContentScript()   - 手动注入内容脚本
• MowenDebugger.testContentExtraction() - 测试内容提取功能
• MowenDebugger.checkPageType()         - 检查页面类型和结构
• MowenDebugger.showHelp()              - 显示此帮助信息

使用步骤：
1. 首先运行 checkPageType() 检查页面是否支持
2. 运行 testContentScript() 检查内容脚本状态
3. 如果内容脚本未加载，运行 injectContentScript() 手动注入
4. 运行 testContentExtraction() 测试内容提取功能

注意事项：
• 确保在支持的网页上运行（http://或https://）
• 某些网站可能有安全限制
• 如果遇到问题，请查看控制台错误信息
            `);
        },

        /**
         * 完整诊断流程
         */
        async runFullDiagnosis() {
            console.log('🔍 开始完整诊断...');
            console.log('='.repeat(50));

            // 1. 检查页面类型
            this.checkPageType();
            console.log('-'.repeat(30));

            // 2. 测试内容脚本
            await new Promise(resolve => {
                setTimeout(() => {
                    this.testContentScript();
                    resolve();
                }, 1000);
            });
            console.log('-'.repeat(30));

            // 3. 如果需要，注入内容脚本
            await new Promise(resolve => {
                setTimeout(async() => {
                    try {
                        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                        chrome.tabs.sendMessage(tab.id, { action: 'ping' }, (response) => {
                            if (chrome.runtime.lastError) {
                                console.log('💉 内容脚本未响应，尝试注入...');
                                this.injectContentScript();
                            }
                            resolve();
                        });
                    } catch (error) {
                        resolve();
                    }
                }, 2000);
            });

            // 4. 测试内容提取
            setTimeout(() => {
                console.log('-'.repeat(30));
                this.testContentExtraction();
                console.log('='.repeat(50));
                console.log('🏁 诊断完成');
            }, 4000);
        }
    };

    // 显示欢迎信息
    console.log(`
🎉 墨问笔记助手调试工具已准备就绪！

快速开始：
• 运行 MowenDebugger.showHelp() 查看帮助
• 运行 MowenDebugger.runFullDiagnosis() 进行完整诊断

当前页面: ${window.location.href}
    `);

})();