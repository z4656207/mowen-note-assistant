// Chrome扩展内容脚本
// 负责从网页中提取内容

(() => {
    'use strict';

    // 监听来自扩展的消息
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'ping') {
            sendResponse({ status: 'ready' });
            return true;
        }

        if (request.action === 'extractContent') {
            try {
                const content = extractPageContent();
                sendResponse({ success: true, data: content });
            } catch (error) {
                console.error('提取内容失败:', error);
                sendResponse({ success: false, error: error.message });
            }
            return true;
        }
    });

    /**
     * 提取页面主要内容
     * @returns {Object} 包含标题、内容、URL等信息的对象
     */
    function extractPageContent() {
        const title = document.title;
        const url = window.location.href;
        let mainContent = '';

        // 常见的内容选择器，按优先级排序
        const contentSelectors = [
            'article',
            'main',
            '.content',
            '.post-content',
            '.article-content',
            '.entry-content',
            '.post-body',
            '.content-body',
            '.note-content',
            '.article-body',
            '#content',
            '#main-content',
            '.main-content'
        ];

        let contentElement = null;
        for (const selector of contentSelectors) {
            contentElement = document.querySelector(selector);
            if (contentElement) {
                break;
            }
        }

        // 如果没找到特定容器，使用body但排除导航、侧边栏等
        if (!contentElement) {
            contentElement = document.body;
        }

        if (contentElement) {
            // 克隆元素以避免修改原DOM
            const clonedElement = contentElement.cloneNode(true);

            // 移除不需要的元素
            const unwantedSelectors = [
                'script',
                'style',
                'nav',
                'header',
                'footer',
                '.sidebar',
                '.navigation',
                '.menu',
                '.ads',
                '.advertisement',
                '.social-share',
                '.comments'
            ];

            unwantedSelectors.forEach(selector => {
                const elements = clonedElement.querySelectorAll(selector);
                elements.forEach(el => el.remove());
            });

            // 提取文本内容，保留基本结构
            mainContent = extractTextWithStructure(clonedElement);
            }

        // 如果常规方法提取的内容太少，尝试墨问专用方法
        if (mainContent.trim().length < 100) {
            const mowenContent = extractMowenContent();
            if (mowenContent.length > mainContent.length) {
                mainContent = mowenContent;
            }
        }

        // 如果还是没有足够内容，尝试等待动态加载
        if (mainContent.trim().length < 50) {
            }

        // 获取页面描述
        const metaDescription = document.querySelector('meta[name="description"]');
        const description = metaDescription ? metaDescription.getAttribute('content') : '';

        const result = {
            title: title.trim(),
            content: mainContent.trim(),
            url: url,
            description: description.trim(),
            timestamp: new Date().toISOString()
        };

        return result;
    }

    /**
     * 提取文本内容并保留基本结构
     * @param {Element} element - 要提取内容的元素
     * @returns {string} 格式化的文本内容
     */
    function extractTextWithStructure(element) {
        let result = '';
        let nodeCount = 0;

        function processNode(node) {
            nodeCount++;

            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent.trim();
                if (text) {
                    result += text + ' ';
                    if (nodeCount <= 10) {
                        result += '\n';
                    }
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const tagName = node.tagName.toLowerCase();

                // 跳过隐藏元素
                const style = window.getComputedStyle(node);
                if (style.display === 'none' || style.visibility === 'hidden') {
                    return;
                }

                // 处理标题
                if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
                    const text = node.textContent.trim();
                    if (text) {
                        result += '\n\n' + text + '\n\n';
                    }
                    return;
                }

                // 处理段落
                if (['p', 'div'].includes(tagName)) {
                    const text = node.textContent.trim();
                    if (text) {
                        result += text + '\n\n';
                        if (nodeCount <= 10) {
                            result += '\n';
                        }
                    }
                    return;
                }

                // 处理列表
                if (tagName === 'li') {
                    const text = node.textContent.trim();
                    if (text) {
                        result += '• ' + text + '\n';
                    }
                    return;
                }

                // 处理换行
                if (['br'].includes(tagName)) {
                    result += '\n';
                    return;
                }

                // 处理特殊的内容元素
                if (['span', 'strong', 'em', 'b', 'i'].includes(tagName)) {
                    // 对于这些内联元素，直接处理子节点
                    for (const child of node.childNodes) {
                        processNode(child);
                    }
                    return;
                }

                // 递归处理子节点
                for (const child of node.childNodes) {
                    processNode(child);
                }
            }
        }

        processNode(element);

        // 清理多余的空行
        const cleaned = result.replace(/\n{3,}/g, '\n\n').trim();
        return cleaned;
    }

    /**
     * 专门针对墨问网站的内容提取
     * @returns {string} 提取的内容
     */
    function extractMowenContent() {
        // 墨问网站可能的内容选择器
        const mowenSelectors = [
            '.note-content',
            '.article-content',
            '.content-wrapper',
            '.note-body',
            '.editor-content',
            '[data-note-content]',
            '.ql-editor', // Quill编辑器
            '.ProseMirror', // ProseMirror编辑器
            '.tiptap', // Tiptap编辑器
            '.rich-text',
            '.markdown-body'
        ];

        for (const selector of mowenSelectors) {
            const element = document.querySelector(selector);
            if (element) {
                if (element.textContent.trim().length > 50) {
                    return extractTextWithStructure(element);
                }
            }
        }

        // 尝试查找所有可能包含文本的元素
        const allTextElements = document.querySelectorAll('p, div, span, h1, h2, h3, h4, h5, h6');
        let allText = '';

        allTextElements.forEach((el, index) => {
            const text = el.textContent.trim();
            if (text.length > 20 && !isNavigationElement(el)) {
                allText += text + '\n\n';
                if (index < 10) {
                    allText += '\n';
                }
            }
        });

        return allText.trim();
    }

    /**
     * 判断是否为导航或无关元素
     * @param {Element} element
     * @returns {boolean}
     */
    function isNavigationElement(element) {
        const className = element.className || '';
        const id = element.id || '';
        const tagName = element.tagName.toLowerCase();

        // 检查是否为导航相关的类名或ID
        const navKeywords = ['nav', 'menu', 'header', 'footer', 'sidebar', 'toolbar', 'breadcrumb'];
        const isNavElement = navKeywords.some(keyword =>
            className.toLowerCase().includes(keyword) ||
            id.toLowerCase().includes(keyword)
        );

        // 检查是否为隐藏元素
        const style = window.getComputedStyle(element);
        const isHidden = style.display === 'none' || style.visibility === 'hidden';

        return isNavElement || isHidden;
    }

    /**
     * 等待动态内容加载
     * @param {number} maxWaitTime 最大等待时间（毫秒）
     * @returns {Promise<string>} 提取的内容
     */
    async function waitForDynamicContent(maxWaitTime = 3000) {
        const startTime = Date.now();
        let lastContentLength = 0;

        return new Promise((resolve) => {
            const checkContent = () => {
                const currentTime = Date.now();

                // 尝试重新提取内容
                let content = '';

                // 先尝试墨问专用方法
                content = extractMowenContent();

                // 如果还是不够，尝试常规方法
                if (content.length < 100) {
                    const contentElement = document.querySelector('.content') || document.body;
                    if (contentElement) {
                        content = extractTextWithStructure(contentElement.cloneNode(true));
                    }
                }

                // 如果内容足够或者超时，返回结果
                if (content.length > 100 || currentTime - startTime > maxWaitTime) {
                    resolve(content);
                    return;
                }

                // 如果内容长度没有变化，继续等待
                if (content.length === lastContentLength) {
                    setTimeout(checkContent, 500);
                } else {
                    lastContentLength = content.length;
                    setTimeout(checkContent, 200);
                }
            };

            checkContent();
        });
    }

    })();