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
        let structuredContentData = null;

        // 检测是否为微信网页
        const isWeChatPage = url.includes('mp.weixin.qq.com') ||
            (document.querySelector('meta[name="author"]') &&
                document.querySelector('meta[name="author"]').getAttribute('content') &&
                document.querySelector('meta[name="author"]').getAttribute('content').includes('微信')) ||
            document.querySelector('.rich_media_content');

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

        // 微信网页专用选择器
        if (isWeChatPage) {
            contentSelectors.unshift(
                '.rich_media_content',
                '#js_content',
                '.rich_media_area_primary'
            );
        }

        let contentElement = null;
        for (const selector of contentSelectors) {
            contentElement = document.querySelector(selector);
            if (contentElement) {
                console.log(`✅ 找到内容容器: ${selector}`);
                break;
            }
        }

        // 如果没找到特定容器，使用body但排除导航、侧边栏等
        if (!contentElement) {
            contentElement = document.body;
            console.log('⚠️ 使用body作为内容容器');
        }

        if (contentElement) {
            // 克隆元素以避免修改原DOM
            const clonedElement = contentElement.cloneNode(true);

            // 基础无效元素移除
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

            // 微信网页特有的无效元素
            if (isWeChatPage) {
                unwantedSelectors.push(
                    // 社交功能相关
                    '.rich_media_tool',
                    '.rich_media_extra',
                    '.rich_media_area_extra',
                    '#js_like',
                    '#js_share',
                    '.share_area',
                    '.like_area',
                    '.comment_area',
                    '.reward_area',
                    '.qr_code_pc',
                    '.profile_inner',
                    '.profile_avatar',
                    '.subscribe_inner',
                    '.rich_media_meta',
                    '.rich_media_meta_list',
                    '.rich_media_meta_nickname',
                    '.rich_media_meta_text',
                    '.rich_media_tool',
                    '.rich_media_tool_meta',
                    // 推荐文章
                    '.related_reading',
                    '.recommend',
                    '.more_read',
                    // 版权信息
                    '.copyright_info',
                    '.rich_media_meta_text',
                    // 其他无关内容
                    '[data-darkmode-color]',
                    '[style*="display: none"]',
                    '[style*="visibility: hidden"]'
                );
            }

            // 移除无效元素
            unwantedSelectors.forEach(selector => {
                const elements = clonedElement.querySelectorAll(selector);
                elements.forEach(el => el.remove());
            });

            // 提取结构化内容（包含格式信息）
            const extractResult = extractTextWithStructure(clonedElement);

            // 转换为纯文本（向后兼容）
            mainContent = structuredContentToText(extractResult);

            // 保存结构化内容
            if (extractResult && extractResult.paragraphs && extractResult.paragraphs.length > 0) {
                structuredContentData = extractResult;
                console.log(`📊 格式提取成功: ${extractResult.paragraphs.length} 段落, ${extractResult.formatStats.boldCount} 加粗, ${extractResult.formatStats.highlightCount} 高亮, ${extractResult.formatStats.linkCount} 链接`);
            }

            // 微信网页后处理：智能截断
            if (isWeChatPage) {
                mainContent = cleanWeChatContent(mainContent);
            }
        }

        // 如果常规方法提取的内容太少，尝试专用方法
        if (mainContent.trim().length < 100) {
            if (isWeChatPage) {
                const wechatContent = extractWeChatContent();
                if (wechatContent.length > mainContent.length) {
                    mainContent = wechatContent;
                }
            } else {
                const mowenContent = extractMowenContent();
                if (mowenContent.length > mainContent.length) {
                    mainContent = mowenContent;
                }
            }
        }

        // 获取页面描述
        const metaDescription = document.querySelector('meta[name="description"]');
        const description = metaDescription ? metaDescription.getAttribute('content') : '';

        const result = {
            title: title.trim(),
            content: mainContent.trim(),
            url: url,
            description: description.trim(),
            timestamp: new Date().toISOString(),
            pageType: isWeChatPage ? 'wechat' : 'general'
        };

        // 如果有结构化内容，添加到结果中
        if (structuredContentData) {
            result.structuredContent = structuredContentData;
        }

        console.log(`📄 内容提取完成: ${result.pageType} 页面, ${result.content.length} 字符`);
        return result;
    }

    /**
     * 提取文本内容并保留格式信息 - 增强版
     * @param {Element} element - 要提取内容的元素
     * @returns {Object} 包含文本和格式信息的结构化数据
     */
    function extractTextWithStructure(element) {
        const paragraphs = [];
        let currentParagraph = { texts: [] };
        const images = []; // 存储图片信息
        let imageCounter = 0; // 图片计数器

        function processNode(node, inheritedStyles = {}) {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent.trim();
                if (text) {
                    // 创建文本节点，继承样式
                    const textNode = { text: text };

                    // 应用继承的样式
                    if (inheritedStyles.bold) textNode.bold = true;
                    if (inheritedStyles.highlight) textNode.highlight = true;
                    if (inheritedStyles.link) textNode.link = inheritedStyles.link;

                    currentParagraph.texts.push(textNode);
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const tagName = node.tagName.toLowerCase();

                // 跳过隐藏元素
                const style = window.getComputedStyle(node);
                if (style.display === 'none' || style.visibility === 'hidden') {
                    return;
                }

                // 检测当前节点的样式
                const currentStyles = {...inheritedStyles };

                // 检测加粗
                if (['strong', 'b'].includes(tagName) ||
                    style.fontWeight === 'bold' ||
                    style.fontWeight === '700' ||
                    parseInt(style.fontWeight) >= 600) {
                    currentStyles.bold = true;
                }

                // 检测高亮/背景色（常见的高亮方式）
                if (style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
                    style.backgroundColor !== 'transparent' && style.backgroundColor !== 'initial') {
                    // 检查是否是明显的高亮色
                    const bgColor = style.backgroundColor.toLowerCase();
                    if (bgColor.includes('yellow') || bgColor.includes('highlight') ||
                        bgColor.includes('rgb(255, 255, 0)') || bgColor.includes('rgb(255, 255, 102)') ||
                        tagName === 'mark') {
                        currentStyles.highlight = true;
                    }
                }

                // 检测链接
                if (tagName === 'a') {
                    const href = node.getAttribute('href');
                    if (href && (href.startsWith('http') || href.startsWith('https'))) {
                        currentStyles.link = href;
                    }
                }

                // 处理图片元素
                if (tagName === 'img') {
                    // 检查是否启用图片处理（通过全局变量或其他方式）
                    // 由于content script无法直接访问storage，这个检查将在后台脚本中处理
                    // 这里始终提取图片信息，由后台脚本根据设置决定是否处理
                    const imgInfo = extractImageInfo(node, imageCounter);
                    if (imgInfo) {
                        console.log(`📸 收集图片 ${imageCounter + 1}:`, imgInfo);
                        images.push(imgInfo);
                        // 在当前位置插入图片占位符
                        insertImagePlaceholder(currentParagraph, imgInfo, paragraphs);
                        imageCounter++;
                    }
                    return; // 图片处理完毕，不继续处理子节点
                }

                // 块级元素：结束当前段落，开始新段落
                if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div', 'section', 'article', 'li', 'blockquote'].includes(tagName)) {
                    // 保存当前段落（如果有内容）
                    if (currentParagraph.texts.length > 0) {
                        paragraphs.push(currentParagraph);
                        currentParagraph = { texts: [] };
                    }

                    // 标题元素自动加粗
                    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
                        currentStyles.bold = true;
                    }

                    // 递归处理子节点
                    if (node.childNodes) {
                        for (const child of node.childNodes) {
                            processNode(child, currentStyles);
                        }
                    }

                    // 结束当前段落
                    if (currentParagraph.texts.length > 0) {
                        paragraphs.push(currentParagraph);
                        currentParagraph = { texts: [] };
                    }
                    return;
                }

                // 换行元素
                if (tagName === 'br') {
                    // 在当前段落中添加空格来表示软换行
                    if (currentParagraph.texts.length > 0) {
                        currentParagraph.texts.push({ text: ' ' });
                    }
                    return;
                }

                // 内联元素和其他元素：递归处理子节点，保持在当前段落
                if (node.childNodes) {
                    for (const child of node.childNodes) {
                        processNode(child, currentStyles);
                    }
                }

                // 对于某些内联元素，在后面添加空格
                if (['span', 'em', 'i', 'code', 'small'].includes(tagName)) {
                    if (currentParagraph.texts.length > 0 &&
                        currentParagraph.texts[currentParagraph.texts.length - 1].text &&
                        !currentParagraph.texts[currentParagraph.texts.length - 1].text.endsWith(' ')) {
                        currentParagraph.texts[currentParagraph.texts.length - 1].text += ' ';
                    }
                }
            }
        }

        processNode(element);

        // 保存最后一个段落
        if (currentParagraph.texts.length > 0) {
            paragraphs.push(currentParagraph);
        }

        // 清理和优化段落
        const cleanedParagraphs = paragraphs
            .filter(paragraph => {
                // 保留图片占位符和有内容的文本段落
                if (paragraph.type === 'image-placeholder') {
                    return true;
                }
                return paragraph && paragraph.texts && Array.isArray(paragraph.texts);
            })
            .map(paragraph => {
                // 图片占位符直接返回
                if (paragraph.type === 'image-placeholder') {
                    return paragraph;
                }
                // 文本段落需要清理
                return {
                    texts: paragraph.texts
                        .filter(text => text && text.text && text.text.trim().length > 0)
                        .map(text => ({
                            ...text,
                            text: text.text.trim()
                        }))
                };
            })
            .filter(paragraph => {
                // 保留图片占位符和有内容的文本段落
                if (paragraph.type === 'image-placeholder') {
                    return true;
                }
                return paragraph.texts && paragraph.texts.length > 0;
            });

        console.log(`📝 格式化提取完成: ${cleanedParagraphs.length} 个段落`);

        // 统计格式信息
        let boldCount = 0,
            highlightCount = 0,
            linkCount = 0;
        cleanedParagraphs.forEach(p => {
            // 只对文本段落统计格式信息，跳过图片占位符
            if (p.texts && Array.isArray(p.texts)) {
                p.texts.forEach(t => {
                    if (t.bold) boldCount++;
                    if (t.highlight) highlightCount++;
                    if (t.link) linkCount++;
                });
            }
        });
        console.log(`🎨 格式统计: ${boldCount} 个加粗, ${highlightCount} 个高亮, ${linkCount} 个链接`);

        // 输出图片统计信息
        if (images.length > 0) {
            console.log(`🖼️ 图片统计: 发现 ${images.length} 个图片`);
            images.forEach((img, index) => {
                console.log(`  图片 ${index + 1}: ${img.src.substring(0, 100)}... (${img.width}x${img.height})`);
            });
        }

        // 输出最终的段落结构（包含图片占位符）
        console.log(`🔍 最终段落结构:`, cleanedParagraphs.length, '个段落');
        cleanedParagraphs.forEach((p, i) => {
            if (p.type === 'image-placeholder') {
                console.log(`  段落 ${i}: 图片占位符 (imageId: ${p.imageId})`);
            } else {
                console.log(`  段落 ${i}: 文本段落 (${p.texts?.length || 0} 个文本节点)`);
            }
        });

        return {
            paragraphs: cleanedParagraphs,
            formatStats: { boldCount, highlightCount, linkCount },
            images: images // 添加图片信息
        };
    }

    /**
     * 将结构化内容转换为纯文本（向后兼容）
     * @param {Object} structuredContent - 结构化内容
     * @returns {string} 纯文本内容
     */
    function structuredContentToText(structuredContent) {
        if (typeof structuredContent === 'string') {
            return structuredContent; // 已经是纯文本
        }

        if (structuredContent && structuredContent.paragraphs) {
            return structuredContent.paragraphs
                .filter(paragraph => paragraph.texts && Array.isArray(paragraph.texts))
                .map(paragraph =>
                    paragraph.texts.map(text => text.text).join('')
                )
                .join('\n\n');
        }

        return '';
    }

    /**
     * 提取图片信息
     * @param {HTMLImageElement} imgElement - 图片元素
     * @param {number} position - 图片在内容中的位置
     * @returns {Object|null} 图片信息对象或null
     */
    function extractImageInfo(imgElement, position) {
        const src = imgElement.src;
        if (!src || !shouldIncludeImage(imgElement)) {
            return null;
        }

        // 计算图片尺寸
        const width = imgElement.naturalWidth || imgElement.width || 0;
        const height = imgElement.naturalHeight || imgElement.height || 0;

        return {
            id: `img_${position}`, // 唯一标识符
            src: src,
            alt: imgElement.alt || '',
            width: width,
            height: height,
            position: position,
            className: imgElement.className,
            // 记录图片周围的上下文信息，用于确定对齐方式
            parentElement: {
                tagName: imgElement.parentElement && imgElement.parentElement.tagName ? imgElement.parentElement.tagName.toLowerCase() : '',
                className: imgElement.parentElement && imgElement.parentElement.className ? imgElement.parentElement.className : '',
                textAlign: window.getComputedStyle(imgElement.parentElement || imgElement).textAlign
            }
        };
    }

    /**
     * 判断是否应该包含该图片
     * @param {HTMLImageElement} imgElement - 图片元素
     * @returns {boolean} 是否应该包含
     */
    function shouldIncludeImage(imgElement) {
        const src = imgElement.src;
        const width = imgElement.naturalWidth || imgElement.width || 0;
        const height = imgElement.naturalHeight || imgElement.height || 0;
        const className = (imgElement.className || '').toLowerCase();
        const alt = (imgElement.alt || '').toLowerCase();

        // 基本过滤条件
        if (!src || src === '') return false;
        if (src.startsWith('data:')) return false; // 跳过base64图片

        // 尺寸过滤
        if (width > 0 && height > 0 && (width < 50 || height < 50)) return false;

        // 装饰性图片过滤
        const decorativeKeywords = ['icon', 'logo', 'avatar', 'emoji', 'bullet', 'arrow', 'star', 'heart'];
        if (decorativeKeywords.some(keyword =>
                (className && className.includes(keyword)) ||
                (alt && alt.includes(keyword))
            )) {
            return false;
        }

        // 广告和无关内容过滤
        const adKeywords = ['ad', 'ads', 'advertisement', 'sponsor', 'promo', 'banner'];
        if (adKeywords.some(keyword =>
                (className && className.includes(keyword)) ||
                (alt && alt.includes(keyword))
            )) {
            return false;
        }

        // 检查父元素，过滤导航和工具栏中的图片
        const parent = imgElement.parentElement;
        if (parent) {
            const parentClass = (parent.className || '').toLowerCase();
            const navKeywords = ['nav', 'menu', 'toolbar', 'header', 'footer', 'sidebar'];
            if (navKeywords.some(keyword => parentClass.includes(keyword))) {
                return false;
            }
        }

        return true;
    }

    /**
     * 在当前段落中插入图片占位符
     * @param {Object} currentParagraph - 当前段落
     * @param {Object} imgInfo - 图片信息
     * @param {Array} paragraphs - 段落数组
     */
    function insertImagePlaceholder(currentParagraph, imgInfo, paragraphs) {
        console.log(`🖼️ 插入图片占位符: ${imgInfo.id}`, imgInfo);

        // 如果当前段落有内容，先保存它
        if (currentParagraph.texts.length > 0) {
            paragraphs.push(currentParagraph);
        }

        // 创建图片占位符段落
        const imagePlaceholder = {
            type: 'image-placeholder',
            imageId: imgInfo.id,
            imageInfo: imgInfo
        };

        console.log(`📝 创建图片占位符节点:`, JSON.stringify(imagePlaceholder, null, 2));
        paragraphs.push(imagePlaceholder);

        // 重置当前段落
        currentParagraph.texts = [];
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

    /**
     * 专门针对微信网页的内容提取
     * @returns {string} 提取的内容
     */
    function extractWeChatContent() {
        console.log('🔍 使用微信专用内容提取方法...');

        // 微信网页的内容选择器，按优先级排序
        const wechatSelectors = [
            '.rich_media_content #js_content',
            '#js_content',
            '.rich_media_content',
            '.rich_media_area_primary .rich_media_wrp',
            '.rich_media_area_primary'
        ];

        for (const selector of wechatSelectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent.trim().length > 100) {
                console.log(`✅ 使用微信选择器: ${selector}`);

                // 克隆并清理
                const cloned = element.cloneNode(true);

                // 移除微信特有的无效元素
                const wechatUnwanted = [
                    '.rich_media_tool',
                    '.rich_media_extra',
                    '#js_like',
                    '#js_share',
                    '.reward_area',
                    '.profile_inner',
                    '.subscribe_inner'
                ];

                wechatUnwanted.forEach(sel => {
                    const elements = cloned.querySelectorAll(sel);
                    elements.forEach(el => el.remove());
                });

                const content = extractTextWithStructure(cloned);
                return cleanWeChatContent(content);
            }
        }

        console.log('⚠️ 微信专用提取未找到合适内容');
        return '';
    }

    /**
     * 清理微信网页内容，去除尾部无效信息
     * @param {string} content - 原始内容
     * @returns {string} 清理后的内容
     */
    function cleanWeChatContent(content) {
        if (!content || content.trim().length === 0) {
            return content;
        }

        console.log('🧹 开始清理微信内容...');

        // 定义可能的文章结束标志
        const endMarkers = [
            // 常见的文章结尾
            /.*[。！？：]\s*$/,
            // 包含"交流会"、"分享会"等结尾
            /.*[交流会|分享会|研讨会|座谈会|讨论会].*[。！？]\s*$/,
            // 包含"详情"、"更多"等后面跟标点的
            /.*[详情|更多|了解|咨询].*[。！？]\s*$/,
            // 包含网址或联系方式后的句号
            /.*[网址|链接|联系|咨询|扫码].*[。！？]\s*$/
        ];

        // 定义应该被移除的尾部垃圾内容关键词
        const trashKeywords = [
            '微信扫一扫', '扫描二维码', '长按识别', '关注公众号',
            '点击阅读原文', '阅读原文', '分享给朋友', '分享到朋友圈',
            '收藏', '点赞', '在看', '留言', '评论区', '写留言',
            '赞赏', '打赏', '喜欢作者', '赞赏作者',
            '推荐阅读', '相关阅读', '延伸阅读', '往期回顾',
            '版权声明', '免责声明', '转载请注明',
            '商务合作', '广告合作', '投稿邮箱',
            '微信号', 'ID:', '微信群', 'QQ群',
            '名称已清空', '微信扫一扫赞赏作者', '喜欢作者'
        ];

        let cleanedContent = content;
        const lines = content.split('\n');
        let cutoffIndex = -1;

        // 策略1: 寻找明确的文章结束标志
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (line.length === 0) continue;

            // 检查是否匹配结束标志
            for (const marker of endMarkers) {
                if (marker.test(line)) {
                    cutoffIndex = i;
                    console.log(`📍 找到结束标志: "${line}" (第${i+1}行)`);
                    break;
                }
            }
            if (cutoffIndex !== -1) break;
        }

        // 策略2: 如果没找到明确结束标志，寻找垃圾内容开始位置
        if (cutoffIndex === -1) {
            for (let i = Math.floor(lines.length * 0.5); i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.length === 0) continue;

                // 检查是否包含垃圾关键词
                const hasTrashKeyword = trashKeywords.some(keyword =>
                    line.includes(keyword)
                );

                if (hasTrashKeyword) {
                    cutoffIndex = i - 1; // 在垃圾内容前一行截断
                    console.log(`🗑️ 找到垃圾内容起始: "${line}" (第${i+1}行)`);
                    break;
                }
            }
        }

        // 策略3: 检查是否有大量短行（通常是社交功能）
        if (cutoffIndex === -1) {
            let shortLineCount = 0;
            let shortLineStart = -1;

            for (let i = Math.floor(lines.length * 0.7); i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.length > 0 && line.length < 10) {
                    if (shortLineStart === -1) {
                        shortLineStart = i;
                    }
                    shortLineCount++;
                } else if (line.length > 20) {
                    shortLineCount = 0;
                    shortLineStart = -1;
                }

                // 如果连续出现3个以上短行，可能是社交功能
                if (shortLineCount >= 3) {
                    cutoffIndex = shortLineStart - 1;
                    console.log(`✂️ 检测到连续短行，从第${shortLineStart+1}行截断`);
                    break;
                }
            }
        }

        // 执行截断
        if (cutoffIndex !== -1 && cutoffIndex < lines.length - 1) {
            const removedLines = lines.length - cutoffIndex - 1;
            cleanedContent = lines.slice(0, cutoffIndex + 1).join('\n').trim();
            console.log(`✅ 移除了${removedLines}行尾部内容`);
            console.log(`📏 清理前: ${content.length} 字符, 清理后: ${cleanedContent.length} 字符`);
        } else {
            console.log('ℹ️ 未发现需要清理的尾部内容');
        }

        return cleanedContent;
    }

})();