// 内容脚本 - 提取网页内容
(function() {
    'use strict';

    console.log('内容脚本已加载:', window.location.href);

    /**
     * 提取网页的主要内容
     * @returns {Object} 包含标题、内容、URL等信息的对象
     */
    function extractPageContent() {
        console.log('开始提取页面内容...');

        // 获取页面标题
        const title = document.title || '';
        console.log('页面标题:', title);

        // 获取页面URL
        const url = window.location.href;
        console.log('页面URL:', url);

        // 尝试提取主要内容区域
        let mainContent = '';

        // 优先查找常见的内容容器
        const contentSelectors = [
            'article',
            'main',
            '[role="main"]',
            '.content',
            '.post-content',
            '.entry-content',
            '.article-content',
            '#content',
            '.main-content',
            // 添加更多可能的选择器
            '.note-content',
            '.article-body',
            '.post-body',
            '.content-body'
        ];

        let contentElement = null;
        for (const selector of contentSelectors) {
            contentElement = document.querySelector(selector);
            if (contentElement) {
                console.log('找到内容容器:', selector);
                console.log('容器元素:', contentElement);
                console.log('容器innerHTML长度:', contentElement.innerHTML.length);
                console.log('容器textContent长度:', contentElement.textContent.length);
                console.log('容器前100个字符:', contentElement.textContent.substring(0, 100));
                break;
            }
        }

        // 如果没找到特定容器，使用body但排除导航、侧边栏等
        if (!contentElement) {
            console.log('未找到特定内容容器，使用body');
            contentElement = document.body;
        }

        if (contentElement) {
            // 克隆元素以避免修改原DOM
            const clonedElement = contentElement.cloneNode(true);
            console.log('克隆元素完成，开始清理不需要的元素...');

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
                console.log(`移除 ${elements.length} 个 ${selector} 元素`);
                elements.forEach(el => el.remove());
            });

            console.log('清理后的元素textContent长度:', clonedElement.textContent.length);
            console.log('清理后的前100个字符:', clonedElement.textContent.substring(0, 100));

            // 提取文本内容，保留基本结构
            mainContent = extractTextWithStructure(clonedElement);
            console.log('提取的内容长度:', mainContent.length);
            console.log('提取的内容前200个字符:', mainContent.substring(0, 200));
        }

        // 如果常规方法提取的内容太少，尝试墨问专用方法
        if (mainContent.trim().length < 100) {
            console.log('常规提取内容太少，尝试墨问专用方法...');
            const mowenContent = extractMowenContent();
            if (mowenContent.length > mainContent.length) {
                console.log('墨问专用方法提取到更多内容，使用墨问方法结果');
                mainContent = mowenContent;
            }
        }

        // 如果还是没有足够内容，尝试等待动态加载
        if (mainContent.trim().length < 50) {
            console.log('内容仍然太少，可能是动态加载，等待一段时间后重试...');
            // 这里可以添加等待逻辑，但为了避免阻塞，我们先记录问题
            console.log('建议：页面可能使用了动态加载，需要等待内容加载完成');
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

        console.log('内容提取完成:', {
            titleLength: result.title.length,
            contentLength: result.content.length,
            descriptionLength: result.description.length
        });

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

        console.log('开始提取文本结构...');

        function processNode(node) {
            nodeCount++;

            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent.trim();
                if (text) {
                    result += text + ' ';
                    if (nodeCount <= 10) {
                        console.log(`文本节点 ${nodeCount}:`, text.substring(0, 50));
                    }
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const tagName = node.tagName.toLowerCase();

                // 跳过隐藏元素
                const style = window.getComputedStyle(node);
                if (style.display === 'none' || style.visibility === 'hidden') {
                    console.log(`跳过隐藏元素: ${tagName}`);
                    return;
                }

                // 处理标题
                if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
                    const text = node.textContent.trim();
                    if (text) {
                        result += '\n\n' + text + '\n\n';
                        console.log(`标题 ${tagName}:`, text);
                    }
                    return;
                }

                // 处理段落
                if (['p', 'div'].includes(tagName)) {
                    const text = node.textContent.trim();
                    if (text) {
                        result += text + '\n\n';
                        if (nodeCount <= 10) {
                            console.log(`段落 ${tagName}:`, text.substring(0, 50));
                        }
                    }
                    return;
                }

                // 处理列表
                if (tagName === 'li') {
                    const text = node.textContent.trim();
                    if (text) {
                        result += '• ' + text + '\n';
                        console.log(`列表项:`, text.substring(0, 50));
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

        console.log(`处理了 ${nodeCount} 个节点`);
        console.log('原始结果长度:', result.length);

        // 清理多余的空行
        const cleaned = result.replace(/\n{3,}/g, '\n\n').trim();
        console.log('清理后结果长度:', cleaned.length);

        return cleaned;
    }

    /**
     * 专门针对墨问网站的内容提取
     * @returns {string} 提取的内容
     */
    function extractMowenContent() {
        console.log('尝试墨问网站专用提取方法...');

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
                console.log(`墨问专用选择器找到内容: ${selector}`);
                console.log('元素:', element);
                console.log('内容长度:', element.textContent.length);
                console.log('内容预览:', element.textContent.substring(0, 200));

                if (element.textContent.trim().length > 50) {
                    return extractTextWithStructure(element);
                }
            }
        }

        // 尝试查找所有可能包含文本的元素
        console.log('尝试查找所有文本元素...');
        const allTextElements = document.querySelectorAll('p, div, span, h1, h2, h3, h4, h5, h6');
        let allText = '';

        allTextElements.forEach((el, index) => {
            const text = el.textContent.trim();
            if (text.length > 20 && !isNavigationElement(el)) {
                allText += text + '\n\n';
                if (index < 10) {
                    console.log(`文本元素 ${index}:`, text.substring(0, 100));
                }
            }
        });

        console.log('所有文本元素提取结果长度:', allText.length);
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
        console.log('等待动态内容加载...');

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

                console.log(`等待中... 当前内容长度: ${content.length}, 已等待: ${currentTime - startTime}ms`);

                // 如果内容足够或者超时，返回结果
                if (content.length > 100 || currentTime - startTime > maxWaitTime) {
                    console.log('动态内容等待完成，最终内容长度:', content.length);
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

            // 开始检查
            setTimeout(checkContent, 100);
        });
    }

    // 监听来自popup的消息
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        console.log('收到消息:', request);

        if (request.action === 'ping') {
            console.log('响应ping消息');
            sendResponse({ success: true, message: 'Content script is ready' });
            return true;
        }

        if (request.action === 'extractContent') {
            console.log('开始处理extractContent请求');

            // 使用异步处理
            (async() => {
                try {
                    let content = extractPageContent();

                    // 如果内容太少，等待动态加载
                    if (content.content.trim().length < 50) {
                        console.log('内容太少，等待动态加载...');
                        const dynamicContent = await waitForDynamicContent();
                        if (dynamicContent.length > content.content.length) {
                            content.content = dynamicContent;
                            console.log('使用动态加载的内容，长度:', dynamicContent.length);
                        }
                    }

                    console.log('内容提取成功，发送响应');
                    sendResponse({ success: true, data: content });
                } catch (error) {
                    console.error('提取内容失败:', error);
                    sendResponse({ success: false, error: error.message });
                }
            })();

            return true; // 保持消息通道开放以支持异步响应
        }

        return true; // 保持消息通道开放
    });

    console.log('内容脚本初始化完成');

})();