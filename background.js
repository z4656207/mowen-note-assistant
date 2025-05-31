// 后台脚本 - 处理API调用
class MowenNoteHelper {
    constructor() {
        this.setupMessageListener();
        this.setupActionListener();
        this.setupSidePanelSupport();
    }

    /**
     * 设置扩展图标点击监听器
     */
    setupActionListener() {
        // 监听扩展图标点击 - 始终打开侧边栏
        chrome.action.onClicked.addListener((tab) => {
            if (chrome.sidePanel) {
                chrome.sidePanel.open({ tabId: tab.id })
                    .then(() => {})
                    .catch((error) => {
                        console.error('打开侧边栏失败:', error);
                        // 如果侧边栏失败，作为后备方案显示popup
                        chrome.action.setPopup({ popup: 'popup.html' });
                    });
            } else {
                // 不支持侧边栏的环境，设置popup作为后备
                chrome.action.setPopup({ popup: 'popup.html' });
            }
        });
    }

    /**
     * 设置侧边栏支持
     */
    setupSidePanelSupport() {
        // 监听标签页激活事件，为侧边栏提供上下文
        if (chrome.tabs && chrome.tabs.onActivated) {
            chrome.tabs.onActivated.addListener(async(activeInfo) => {
                try {
                    // 检查是否启用了侧边栏模式
                    const result = await chrome.storage.local.get(['sidePanelMode']);
                    if (result.sidePanelMode === true && chrome.sidePanel) {
                        // 可以在这里添加侧边栏相关的逻辑
                    }
                } catch (error) {
                    console.error('处理标签页切换失败:', error);
                }
            });
        }

        // 监听标签页更新事件
        if (chrome.tabs && chrome.tabs.onUpdated) {
            chrome.tabs.onUpdated.addListener(async(tabId, changeInfo, tab) => {
                if (changeInfo.status === 'complete') {
                    try {
                        // 检查是否启用了侧边栏模式
                        const result = await chrome.storage.local.get(['sidePanelMode']);
                        if (result.sidePanelMode === true && chrome.sidePanel) {
                            // 页面加载完成，可以通知侧边栏更新
                        }
                    } catch (error) {
                        console.error('处理页面更新失败:', error);
                    }
                }
            });
        }
    }

    /**
     * 设置消息监听器
     */
    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'processContent') {
                // 异步处理，不阻塞消息响应
                this.handleProcessContentAsync(request)
                    .catch(error => {
                        console.error('异步处理内容失败:', error);
                    });

                // 立即响应，告知任务已开始
                sendResponse({ success: true, message: '任务已开始处理' });
                return false; // 不保持消息通道开放
            } else if (request.action === 'switchToPopup') {
                // 处理切换到popup的请求
                this.handleSwitchToPopup(request, sender, sendResponse);
                return true; // 保持消息通道开放
            } else if (request.action === 'switchToSidePanel') {
                // 处理切换到侧边栏的请求
                this.handleSwitchToSidePanel(request, sender, sendResponse);
                return true; // 保持消息通道开放
            } else if (request.action === 'ping') {
                // 处理ping请求，用于测试扩展通信
                sendResponse({
                    success: true,
                    message: 'pong',
                    timestamp: Date.now(),
                    version: chrome.runtime.getManifest().version
                });
                return false;
            }
        });
    }

    /**
     * 处理切换到popup
     */
    async handleSwitchToPopup(request, sender, sendResponse) {
        try {
            const { tabId } = request;

            // 设置popup
            await chrome.action.setPopup({ popup: 'popup.html' });

            // 尝试关闭侧边栏 - Chrome没有直接的关闭API，但设置popup后会自动处理
            if (chrome.sidePanel) {
                try {
                    // 通过设置popup来覆盖侧边栏行为
                } catch (error) {}
            }

            // 立即通过程序化方式打开popup
            try {
                // Chrome 99+ 支持 openPopup API
                if (chrome.action.openPopup) {
                    await chrome.action.openPopup();
                } else {
                    // 备用方案：通过windows API创建popup样式的窗口
                    const popupWindow = await chrome.windows.create({
                        url: chrome.runtime.getURL('popup.html'),
                        type: 'popup',
                        width: 400,
                        height: 600,
                        focused: true
                    });
                }
            } catch (openError) {
                console.error('打开popup失败:', openError);
                // 如果都失败了，至少popup已经设置好了，用户可以手动点击图标
            }

            sendResponse({ success: true, message: '已切换到popup模式' });
        } catch (error) {
            console.error('切换到popup失败:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    /**
     * 处理切换到侧边栏
     */
    async handleSwitchToSidePanel(request, sender, sendResponse) {
        try {
            const { tabId } = request;

            // 先清除popup设置，恢复点击时打开侧边栏的行为
            await chrome.action.setPopup({ popup: '' });

            // 在同步上下文中立即打开侧边栏，避免用户手势丢失
            if (chrome.sidePanel && tabId) {
                // 这里不能用await，必须在同步上下文中执行
                chrome.sidePanel.open({ tabId: tabId })
                    .then(() => {
                        sendResponse({ success: true, message: '已切换到侧边栏模式' });
                    })
                    .catch((error) => {
                        console.error('切换到侧边栏失败:', error);
                        sendResponse({ success: false, error: error.message });
                    });

                // 立即返回true保持消息通道开放，等待异步操作完成
                return true;
            } else {
                sendResponse({ success: false, error: '侧边栏API不可用或缺少标签页ID' });
            }

        } catch (error) {
            console.error('切换到侧边栏失败:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    /**
     * 异步处理内容
     */
    async handleProcessContentAsync(request) {
        const { taskId, tabId, data, settings } = request;

        // 添加数据安全检查
        if (!data) {
            console.error('❌ 数据参数缺失');
            await this.updateTaskStatus(tabId, taskId, 'failed', '数据获取失败', null, '页面数据缺失，请重试');
            return;
        }

        const performanceMetrics = {
            startTime: Date.now(),
            steps: {}
        };

        console.log('🚀 === 墨问笔记处理任务开始 ===');
        console.log('📋 任务ID:', taskId);
        console.log('📑 页面标题:', data.title || '未知标题');
        console.log('🔗 页面URL:', data.url || '未知URL');
        console.log('📊 内容长度:', data.content ? data.content.length : 0, '字符');
        console.log('⚙️ 设置:', settings || {});
        console.log('⏰ 开始时间:', new Date().toLocaleTimeString());
        console.log('');
        console.log('💡 如何查看完整日志:');
        console.log('   1. 打开 chrome://extensions/');
        console.log('   2. 找到墨问笔记助手，点击"详细信息"');
        console.log('   3. 在"检查视图"部分点击"service worker"');
        console.log('   4. 在弹出的开发者工具中查看Console标签');
        console.log('='.repeat(50));

        try {
            // 检查处理模式
            const processingMode = settings.processingMode || 'ai';
            console.log('🎯 处理模式:', processingMode === 'clip' ? '一键剪藏' : 'AI智能整理');

            // 步骤1: 验证配置
            console.log('\n🔍 === 步骤 1/5: 验证配置 ===');
            await this.updateTaskStatus(tabId, taskId, 'processing', '正在验证配置...', null, null, { step: 1, total: 5 });
            const configStart = Date.now();

            const config = await this.getStoredConfig();
            console.log('📝 获取配置完成');
            const configError = this.validateConfigDetailed(config, processingMode);
            if (configError) {
                console.error('❌ 配置验证失败:', configError);
                throw new Error(configError);
            }
            console.log('✅ 配置验证通过');

            performanceMetrics.steps.configValidation = Date.now() - configStart;
            console.log('⏱️ 配置验证耗时:', performanceMetrics.steps.configValidation + 'ms');

            // 在AI处理前检查任务是否被取消
            if (await this.isTaskCancelled(tabId, taskId)) {
                console.log('⚠️ 任务已被取消');
                return;
            }

            // 步骤2: 准备数据
            console.log('\n📦 === 步骤 2/5: 准备页面数据 ===');
            await this.updateTaskStatus(tabId, taskId, 'processing', '正在准备页面数据...', null, null, { step: 2, total: 5 });
            const dataStart = Date.now();

            console.log('🔄 开始预处理页面数据...');
            // 添加数据预处理时间测量
            const processedData = await this.preprocessPageData(data, processingMode);
            performanceMetrics.steps.dataPreparation = Date.now() - dataStart;
            console.log('✅ 数据预处理完成');
            console.log('⏱️ 数据准备耗时:', performanceMetrics.steps.dataPreparation + 'ms');

            // 再次检查任务是否被取消
            if (await this.isTaskCancelled(tabId, taskId)) {
                console.log('⚠️ 任务已被取消');
                return;
            }

            let contentResult;

            if (processingMode === 'clip') {
                // 步骤3: 一键剪藏处理
                console.log('\n📎 === 步骤 3/5: 一键剪藏处理 ===');
                await this.updateTaskStatus(tabId, taskId, 'processing', '正在转换网页内容格式...', null, null, { step: 3, total: 5 });
                const clipStart = Date.now();

                console.log('🔄 开始网页内容格式转换...');
                console.log('📏 内容长度:', processedData.content ? processedData.content.length : 0, '字符');

                contentResult = await this.processClipContent(processedData, settings);
                performanceMetrics.steps.clipProcessing = Date.now() - clipStart;
                console.log('✅ 一键剪藏处理完成');
                console.log('⏱️ 剪藏处理耗时:', performanceMetrics.steps.clipProcessing + 'ms');
                console.log('📄 生成段落数:', contentResult.paragraphs ? contentResult.paragraphs.length : 0);
            } else {
                // 步骤3: AI处理
                console.log('\n🤖 === 步骤 3/5: AI接口处理 ===');
                await this.updateTaskStatus(tabId, taskId, 'processing', '正在调用AI接口整理内容...', null, null, { step: 3, total: 5 });
                const aiStart = Date.now();

                console.log('🔗 准备调用AI API...');
                console.log('🎯 AI模型:', config.aiModel);
                console.log('🌐 API地址:', config.aiApiUrl);
                console.log('📏 处理模式:', settings.fullTextMode ? '全文整理' : '总结模式');

                contentResult = await this.callAIAPI(processedData, config, settings);
                performanceMetrics.steps.aiProcessing = Date.now() - aiStart;
                console.log('✅ AI处理完成');
                console.log('⏱️ AI处理耗时:', performanceMetrics.steps.aiProcessing + 'ms');
                console.log('📄 AI返回段落数:', contentResult.paragraphs ? contentResult.paragraphs.length : 0);
            }

            // 在发布前再次检查任务是否被取消
            if (await this.isTaskCancelled(tabId, taskId)) {
                console.log('⚠️ 任务已被取消');
                return;
            }

            // 步骤4: 发布到墨问
            console.log('\n📝 === 步骤 4/5: 发布到墨问 ===');
            await this.updateTaskStatus(tabId, taskId, 'processing', '正在发布到墨问笔记...', null, null, { step: 4, total: 5 });
            const mowenStart = Date.now();

            console.log('🚀 开始发布到墨问...');
            console.log('🏷️ 是否自动发布:', settings.autoPublish !== false);
            console.log('🔖 是否生成标签:', settings.generateTags === true);

            const mowenResult = await this.publishToMowen(contentResult, config, settings);
            performanceMetrics.steps.mowenPublishing = Date.now() - mowenStart;
            console.log('✅ 墨问发布完成');
            console.log('⏱️ 墨问发布耗时:', performanceMetrics.steps.mowenPublishing + 'ms');
            console.log('📋 笔记ID:', mowenResult.noteId || 'N/A');

            // 步骤5: 完成处理
            console.log('\n🎉 === 步骤 5/5: 完成处理 ===');
            await this.updateTaskStatus(tabId, taskId, 'processing', '正在完成最后步骤...', null, null, { step: 5, total: 5 });

            performanceMetrics.totalTime = Date.now() - performanceMetrics.startTime;

            // 输出性能分析报告
            console.log('\n📊 === 性能分析报告 ===');
            console.log('⏰ 总执行时间:', performanceMetrics.totalTime + 'ms (' + (performanceMetrics.totalTime / 1000).toFixed(1) + 's)');
            console.log('📈 各步骤详细耗时:');
            console.log('  🔍 配置验证:', performanceMetrics.steps.configValidation + 'ms');
            console.log('  📦 数据准备:', performanceMetrics.steps.dataPreparation + 'ms');
            if (processingMode === 'clip') {
                console.log('  📎 剪藏处理:', performanceMetrics.steps.clipProcessing + 'ms');
            } else {
                console.log('  🤖 AI处理:', performanceMetrics.steps.aiProcessing + 'ms');
            }
            console.log('  📝 墨问发布:', performanceMetrics.steps.mowenPublishing + 'ms');

            // 计算各步骤占比
            const total = performanceMetrics.totalTime;
            console.log('📊 各步骤占比:');
            if (performanceMetrics.steps.configValidation) {
                console.log('  🔍 配置验证占比:', Math.round((performanceMetrics.steps.configValidation / total) * 100) + '%');
            }
            if (performanceMetrics.steps.dataPreparation) {
                console.log('  📦 数据准备占比:', Math.round((performanceMetrics.steps.dataPreparation / total) * 100) + '%');
            }
            if (performanceMetrics.steps.aiProcessing) {
                console.log('  🤖 AI处理占比:', Math.round((performanceMetrics.steps.aiProcessing / total) * 100) + '%');
            }
            if (performanceMetrics.steps.clipProcessing) {
                console.log('  📎 剪藏处理占比:', Math.round((performanceMetrics.steps.clipProcessing / total) * 100) + '%');
            }
            if (performanceMetrics.steps.mowenPublishing) {
                console.log('  📝 墨问发布占比:', Math.round((performanceMetrics.steps.mowenPublishing / total) * 100) + '%');
            }

            // 性能评估
            console.log('\n⚡ === 性能评估 ===');
            if (performanceMetrics.steps.aiProcessing > 15000) {
                console.warn('⚠️ AI处理时间较长 (>15s)，建议检查网络或减少内容长度');
            }
            if (performanceMetrics.steps.mowenPublishing > 10000) {
                console.warn('⚠️ 墨问发布时间较长 (>10s)，建议检查网络连接');
            }
            if (performanceMetrics.totalTime < 5000) {
                console.log('🚀 处理速度很快！');
            } else if (performanceMetrics.totalTime < 15000) {
                console.log('👍 处理速度正常');
            } else {
                console.warn('🐌 处理速度较慢，建议优化');
            }

            // 添加优化效果报告
            console.log('\n🔧 === 优化效果报告 ===');
            if (processedData.optimization) {
                console.log('📉 内容压缩优化:', processedData.optimization.reductionRatio + '% 内容减少');
                console.log('📏 处理前长度:', processedData.optimization.originalLength, '字符');
                console.log('📏 处理后长度:', processedData.optimization.processedLength, '字符');
            }

            // 添加AI响应质量报告
            if (processingMode === 'ai' && contentResult.qualityAssessment) {
                console.log('🎯 AI响应质量:', contentResult.qualityAssessment.emoji, contentResult.qualityAssessment.grade);
                if (contentResult.qualityAssessment.score < 80) {
                    console.warn('⚠️ JSON质量较低，建议检查prompt或重试');
                }
            }

            const autoPublish = settings.autoPublish !== false;
            const message = autoPublish ? '内容已成功发布到墨问笔记' : '内容未公开';

            const result = {
                aiResult: contentResult,
                mowenResult,
                message,
                autoPublish,
                fullTextMode: settings.fullTextMode || false,
                performanceMetrics
            };

            console.log('\n✅ === 任务处理完成 ===');
            console.log('🎯 结束时间:', new Date().toLocaleTimeString());

            // 更新任务状态为完成
            await this.updateTaskStatus(tabId, taskId, 'completed', '任务已完成', result);
        } catch (error) {
            console.error('\n❌ === 任务处理失败 ===');
            console.error('💥 错误信息:', error.message);
            console.error('📍 错误堆栈:', error.stack);

            // 记录错误发生时的性能数据
            performanceMetrics.totalTime = Date.now() - performanceMetrics.startTime;
            performanceMetrics.error = true;

            console.log('⏱️ 失败前耗时:', performanceMetrics.totalTime + 'ms');
            console.log('📊 已完成步骤的耗时:', performanceMetrics.steps);

            // 检查是否是因为任务被取消导致的错误
            if (await this.isTaskCancelled(tabId, taskId)) {
                console.log('⚠️ 任务已被取消，不更新错误状态');
                return;
            }

            // 根据错误类型提供更友好的错误信息
            let userFriendlyError = error.message;
            let errorCategory = 'unknown';

            if (error.message.includes('JSON格式不正确') || error.message.includes('解析失败')) {
                errorCategory = 'json_parse';
                userFriendlyError = 'AI返回的内容格式有误，请重试。如果问题持续出现，建议：\n1. 尝试减少页面内容长度\n2. 检查AI模型设置\n3. 稍后重试';
            } else if (error.message.includes('API调用失败') || error.message.includes('网络')) {
                errorCategory = 'network';
                userFriendlyError = '网络连接或API服务异常，请检查网络连接后重试';
            } else if (error.message.includes('配置') || error.message.includes('密钥')) {
                errorCategory = 'config';
                userFriendlyError = error.message; // 配置错误信息已经很友好了
            } else if (error.message.includes('超时')) {
                errorCategory = 'timeout';
                userFriendlyError = '处理超时，建议减少内容长度或稍后重试';
            }

            // 构建详细的错误信息，包含性能数据
            const errorDetails = {
                message: error.message,
                category: errorCategory,
                userFriendlyMessage: userFriendlyError,
                performanceMetrics,
                timestamp: new Date().toISOString()
            };

            console.log('🔍 错误分类:', errorCategory);
            console.log('👤 用户友好错误信息:', userFriendlyError);

            // 更新任务状态为失败
            await this.updateTaskStatus(tabId, taskId, 'failed', '任务处理失败', null, userFriendlyError, null, errorDetails);
        }
    }

    /**
     * 处理一键剪藏内容
     * @param {Object} pageData - 页面数据
     * @param {Object} settings - 用户设置
     * @returns {Promise<Object>} 处理后的内容结果
     */
    async processClipContent(pageData, settings = {}) {
        console.log('📎 开始一键剪藏内容处理...');
        const startTime = Date.now();

        try {
            // 构建基本的笔记结构
            const result = {
                title: this.cleanTitle(pageData.title),
                paragraphs: [],
                tags: [], // 一键剪藏模式不生成标签
                sourceUrl: pageData.url
            };

            // 处理内容，转换为墨问富文本格式
            const content = pageData.content || '';

            if (content.trim().length === 0) {
                // 如果没有内容，创建一个基本段落
                result.paragraphs.push({
                    texts: [{
                        text: '页面内容为空或无法提取到有效内容。'
                    }]
                });
            } else {
                // 将内容分段并转换格式
                const paragraphs = this.convertContentToParagraphs(content, pageData);
                result.paragraphs = paragraphs;
            }

            const endTime = Date.now();
            console.log(`✅ 一键剪藏内容处理完成，耗时: ${endTime - startTime}ms`);
            console.log(`📄 生成段落数: ${result.paragraphs.length}`);

            return result;

        } catch (error) {
            console.error('❌ 一键剪藏内容处理失败:', error);
            throw new Error(`一键剪藏处理失败: ${error.message}`);
        }
    }

    /**
     * 清理标题
     * @param {string} title - 原始标题
     * @returns {string} 清理后的标题
     */
    cleanTitle(title) {
        if (!title || typeof title !== 'string') {
            return '未命名页面';
        }

        // 移除常见的网站后缀和无用信息
        let cleanedTitle = title
            .replace(/\s*[-–—|]\s*.*$/, '') // 移除标题中的网站名称部分
            .replace(/\s*\(\d+\)\s*$/, '') // 移除末尾的数字标记
            .replace(/\s*\[\d+\]\s*$/, '') // 移除末尾的方括号数字
            .trim();

        // 如果清理后标题太短，使用原标题
        if (cleanedTitle.length < 3) {
            cleanedTitle = title.trim();
        }

        // 限制标题长度
        if (cleanedTitle.length > 100) {
            cleanedTitle = cleanedTitle.substring(0, 100) + '...';
        }

        return cleanedTitle || '未命名页面';
    }

    /**
     * 将内容转换为段落格式
     * @param {string} content - 原始内容
     * @param {Object} pageData - 页面数据
     * @returns {Array} 段落数组
     */
    convertContentToParagraphs(content, pageData) {
        console.log('🔄 开始内容格式转换...');
        const startTime = Date.now();

        const paragraphs = [];

        // 1. 智能段落分割
        const rawParagraphs = this.smartParagraphSplit(content);
        console.log(`📝 智能分割后段落数: ${rawParagraphs.length}`);

        // 2. 处理每个段落，识别不同类型的内容
        rawParagraphs.forEach((paragraph, index) => {
            const processedParagraph = this.processParagraphEnhanced(paragraph, index);
            if (processedParagraph && processedParagraph.texts.length > 0) {
                paragraphs.push(processedParagraph);
            }
        });

        // 3. 后处理：合并过短的段落，分离过长的段落
        const optimizedParagraphs = this.optimizeParagraphs(paragraphs);

        const endTime = Date.now();
        console.log(`✅ 格式转换完成: ${paragraphs.length} → ${optimizedParagraphs.length} 段落，耗时: ${endTime - startTime}ms`);

        return optimizedParagraphs;
    }

    /**
     * 智能段落分割
     * @param {string} content - 原始内容
     * @returns {Array} 分割后的段落数组
     */
    smartParagraphSplit(content) {
        if (!content || content.trim().length === 0) {
            return [];
        }

        console.log('📝 开始简化段落分割，保持原网页结构...');

        // 1. 首先按双换行分割（保持原网页段落结构）
        let paragraphs = content
            .split(/\n\s*\n+/) // 按双换行或多换行分割
            .map(p => p.trim())
            .filter(p => p.length > 0);

        console.log(`📝 按双换行分割得到 ${paragraphs.length} 个段落`);

        // 2. 如果段落数量合理，直接使用
        if (paragraphs.length >= 2) {
            return paragraphs.filter(p => p.trim().length >= 10);
        }

        // 3. 如果只有一个大段落，尝试按单换行分割
        if (paragraphs.length === 1 && content.includes('\n')) {
            console.log('📝 尝试按单换行分割...');
            paragraphs = content
                .split(/\n/)
                .map(p => p.trim())
                .filter(p => p.length >= 15); // 过滤太短的行

            if (paragraphs.length >= 2) {
                return paragraphs;
            }
        }

        // 4. 最后的选择：如果内容很长，按句号分割
        if (content.length > 500) {
            console.log('📝 内容较长，尝试按句号分割...');
            const sentences = content
                .split(/[。！？.!?]+\s*/)
                .map(s => s.trim())
                .filter(s => s.length >= 20);

            if (sentences.length >= 2) {
                // 将2-3个句子组合成一段，避免段落过多
                const combinedParagraphs = [];
                const sentencesPerParagraph = Math.min(3, Math.max(1, Math.ceil(sentences.length / 8)));

                for (let i = 0; i < sentences.length; i += sentencesPerParagraph) {
                    const paragraphSentences = sentences.slice(i, i + sentencesPerParagraph);
                    const paragraph = paragraphSentences.join('。') + '。';
                    if (paragraph.length > 10) {
                        combinedParagraphs.push(paragraph);
                    }
                }

                if (combinedParagraphs.length >= 2) {
                    return combinedParagraphs;
                }
            }
        }

        // 5. 如果所有方法都不行，返回原内容作为单一段落
        console.log('📝 无法有效分割，保持为单一段落');
        return [content.trim()];
    }

    /**
     * 增强的段落处理 - 简化版本
     * @param {string} paragraphText - 段落文本
     * @param {number} index - 段落索引
     * @returns {Object} 处理后的段落对象
     */
    processParagraphEnhanced(paragraphText, index) {
        if (!paragraphText || paragraphText.trim().length === 0) {
            return null;
        }

        let cleanText = paragraphText.trim();

        // 1. 基本文本清理 - 保持必要的换行
        cleanText = cleanText
            .replace(/[ \t]+/g, ' ') // 只合并空格和制表符
            .replace(/\n{3,}/g, '\n\n') // 限制连续换行不超过2个
            .trim();

        // 2. 过滤掉太短的段落
        if (cleanText.length < 10) {
            return null;
        }

        // 3. 简化的格式处理，只保留基本格式
        const texts = this.formatParagraphSimple(cleanText, index);

        return {
            texts: texts,
            type: 'normal' // 简化类型，统一为普通段落
        };
    }

    /**
     * 简化的段落格式处理
     * @param {string} text - 原始文本
     * @param {number} index - 段落索引
     * @returns {Array} 格式化后的文本数组
     */
    formatParagraphSimple(text, index) {
        const texts = [];

        // 1. 处理链接
        const urlRegex = /(https?:\/\/[^\s\n]+)/g;
        const parts = text.split(urlRegex);

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (!part) continue;

            if (urlRegex.test(part)) {
                // 这是一个链接
                texts.push({
                    text: this.formatLinkText(part),
                    link: part
                });
            } else {
                // 2. 只对明显的标题进行加粗处理
                if (this.isObviousTitle(part, index)) {
                    texts.push({
                        text: part.trim(),
                        bold: true
                    });
                } else {
                    // 普通文本，不做任何特殊处理
                    texts.push({
                        text: part.trim()
                    });
                }
            }
        }

        // 如果没有文本，返回原始文本
        if (texts.length === 0 || texts.every(t => !t.text || t.text.trim().length === 0)) {
            return [{ text: text }];
        }

        return texts.filter(t => t.text && t.text.trim().length > 0);
    }

    /**
     * 判断是否是明显的标题（严格标准）
     * @param {string} text - 文本
     * @param {number} index - 段落索引
     * @returns {boolean} 是否是明显的标题
     */
    isObviousTitle(text, index) {
        if (!text || text.length > 80 || text.length < 5) return false;

        // 只有在前几个段落中，且满足明确标题特征的才加粗
        if (index > 3) return false;

        // 明确的标题特征
        return (
            // 数字开头的标题
            /^[一二三四五六七八九十\d]+[、\.]\s*/.test(text) ||
            // 章节标题
            /^第[一二三四五六七八九十\d]+[章节部分条]\s*/.test(text) ||
            // 以冒号结尾的短文本
            (text.length < 30 && text.endsWith('：')) ||
            // 全是大写字母的短文本
            (/^[A-Z\s]{3,20}$/.test(text))
        ) && (
            // 确保不包含句号等完整句子的标志
            !text.includes('。') &&
            !text.includes('，') &&
            !text.includes('、') &&
            // 不是列表项
            !/^[•·▪▫◦‣⁃\-\*\+]/.test(text)
        );
    }

    /**
     * 根据段落类型格式化文本 - 简化版本
     * @param {string} text - 原始文本
     * @param {string} type - 段落类型
     * @returns {Array} 格式化后的文本数组
     */
    formatParagraphByType(text, type) {
        // 简化处理，只处理链接
        const texts = [];
        const urlRegex = /(https?:\/\/[^\s\n]+)/g;
        const parts = text.split(urlRegex);

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (!part) continue;

            if (urlRegex.test(part)) {
                texts.push({
                    text: this.formatLinkText(part),
                    link: part
                });
            } else {
                texts.push({
                    text: part.trim()
                });
            }
        }

        return texts.filter(t => t.text && t.text.trim().length > 0) || [{ text: text }];
    }

    /**
     * 根据类型应用格式化 - 简化版本，去除高亮
     * @param {string} text - 文本
     * @param {string} type - 类型
     * @returns {Array} 格式化后的文本数组
     */
    applyTypeFormatting(text, type) {
        const trimmedText = text.trim();
        if (!trimmedText) return [];

        // 简化处理，去除高亮和复杂格式
        switch (type) {
            case 'main-title':
            case 'sub-title':
                return [{ text: trimmedText, bold: true }];

            default:
                // 所有其他类型都作为普通文本处理，不添加任何格式
                return [{ text: trimmedText }];
        }
    }

    /**
     * 高亮关键词 - 已禁用
     * @param {string} text - 文本
     * @returns {Array} 包含高亮的文本数组
     */
    highlightKeywords(text) {
        // 完全禁用高亮功能，直接返回原文本
        return [{ text: text }];
    }

    /**
     * 优化段落 - 简化版本
     * @param {Array} paragraphs - 段落数组
     * @returns {Array} 优化后的段落数组
     */
    optimizeParagraphs(paragraphs) {
        if (!paragraphs || paragraphs.length === 0) {
            return [];
        }

        // 简化优化逻辑，主要是过滤无效段落
        return paragraphs.filter(paragraph => {
            if (!paragraph || !paragraph.texts || paragraph.texts.length === 0) {
                return false;
            }

            const textContent = paragraph.texts.map(t => t.text || '').join('').trim();

            // 过滤掉太短或空的段落
            return textContent.length >= 10;
        });
    }

    /**
     * 分割过长的段落
     * @param {Object} paragraph - 段落对象
     * @returns {Array} 分割后的段落数组
     */
    splitLongParagraph(paragraph) {
        const fullText = paragraph.texts.map(t => t.text).join('');

        // 尝试在句号处分割
        const sentences = fullText.split(/[。！？.!?]+/).filter(s => s.trim().length > 0);

        if (sentences.length < 2) {
            return [paragraph]; // 无法分割，返回原段落
        }

        const result = [];
        let currentTexts = [];
        let currentLength = 0;

        for (const sentence of sentences) {
            const sentenceLength = sentence.length;

            if (currentLength + sentenceLength > 250 && currentTexts.length > 0) {
                // 创建新段落
                result.push({
                    texts: [...currentTexts, { text: '。' }],
                    type: paragraph.type
                });
                currentTexts = [];
                currentLength = 0;
            }

            currentTexts.push({ text: sentence });
            currentLength += sentenceLength;
        }

        // 添加最后一段
        if (currentTexts.length > 0) {
            result.push({
                texts: [...currentTexts, { text: '。' }],
                type: paragraph.type
            });
        }

        return result.length > 0 ? result : [paragraph];
    }

    // 辅助检测方法
    isMainTitle(text, index) {
        if (index > 2) return false; // 主标题通常在前面
        return (
            text.length < 100 &&
            text.length > 5 &&
            !text.includes('。') &&
            !text.includes('，') &&
            !/^[•·▪▫◦‣⁃\-\*\+]/.test(text)
        );
    }

    isSubTitle(text) {
        return /^[一二三四五六七八九十\d]+[、\.]\s*/.test(text) ||
            /^第[一二三四五六七八九十\d]+[章节部分条]\s*/.test(text) ||
            (text.length < 80 && text.length > 3 && text.endsWith('：'));
    }

    isListItem(text) {
        return /^([•·▪▫◦‣⁃\-\*\+]|\d+[\.\)])\s+/.test(text);
    }

    isQuote(text) {
        return text.startsWith('"') || text.startsWith('"') ||
            text.startsWith('「') || text.includes('表示') ||
            text.includes('认为') || text.includes('指出');
    }

    isCodeContent(text) {
        return /[{}()[\];=<>]/.test(text) &&
            (text.includes('function') || text.includes('class') ||
                text.includes('var') || text.includes('const') ||
                text.includes('import') || text.includes('#include'));
    }

    formatLinkText(url) {
        // 简化URL显示
        try {
            const urlObj = new URL(url);
            return urlObj.hostname || '链接';
        } catch {
            return '链接';
        }
    }

    /**
     * 处理单个段落
     * @param {string} paragraphText - 段落文本
     * @returns {Object} 处理后的段落对象
     */
    processParagraph(paragraphText) {
        if (!paragraphText || paragraphText.trim().length === 0) {
            return null;
        }

        // 清理文本
        let cleanText = paragraphText
            .replace(/\s+/g, ' ') // 合并多个空格
            .replace(/\n/g, ' ') // 替换换行为空格
            .trim();

        // 过滤掉太短或无意义的段落
        if (cleanText.length < 10) {
            return null;
        }

        // 检测并处理特殊格式
        const texts = this.detectAndFormatText(cleanText);

        return {
            texts: texts
        };
    }

    /**
     * 检测并格式化文本
     * @param {string} text - 原始文本
     * @returns {Array} 格式化后的文本数组
     */
    detectAndFormatText(text) {
        const texts = [];

        // 简单的格式检测和处理
        // 这里可以根据需要扩展更复杂的格式检测逻辑

        // 检测是否包含链接
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const parts = text.split(urlRegex);

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (!part) continue;

            if (urlRegex.test(part)) {
                // 这是一个链接
                texts.push({
                    text: '链接',
                    link: part
                });
            } else {
                // 检测是否是标题格式（全大写或包含特殊字符）
                if (this.isLikelyTitle(part)) {
                    texts.push({
                        text: part.trim(),
                        bold: true
                    });
                } else {
                    // 普通文本
                    texts.push({
                        text: part.trim()
                    });
                }
            }
        }

        // 如果没有检测到任何格式，返回原始文本
        if (texts.length === 0) {
            texts.push({
                text: text
            });
        }

        return texts.filter(t => t.text && t.text.trim().length > 0);
    }

    /**
     * 判断文本是否像标题
     * @param {string} text - 文本
     * @returns {boolean} 是否像标题
     */
    isLikelyTitle(text) {
        if (!text || text.length > 100) return false;

        // 检测标题的特征
        const titlePatterns = [
            /^[一二三四五六七八九十\d]+[、\.]\s*/, // 数字开头
            /^第[一二三四五六七八九十\d]+[章节部分]\s*/, // 章节标题
            /^[A-Z][A-Z\s]{2,}$/, // 全大写
            /^.{1,50}[：:]\s*$/, // 以冒号结尾
        ];

        return titlePatterns.some(pattern => pattern.test(text.trim()));
    }

    /**
     * 预处理页面数据
     * @param {Object} data - 原始页面数据
     * @param {string} processingMode - 处理模式 ('ai' 或 'clip')
     * @returns {Promise<Object>} 处理后的数据
     */
    async preprocessPageData(data, processingMode = 'ai') {
        console.log('🧹 开始智能内容预处理...');
        const startTime = Date.now();

        return new Promise(resolve => {
            // 添加数据安全检查
            if (!data || typeof data !== 'object') {
                console.warn('⚠️ 数据参数无效，使用默认值');
                data = {
                    title: '未知标题',
                    url: '未知URL',
                    content: '',
                    description: ''
                };
            }

            let processedContent = data.content || '';
            const originalLength = processedContent.length;

            // 1. 基本清理：移除多余的空白字符
            if (processingMode === 'ai') {
                // AI模式：合并多个空格为单个空格
                processedContent = processedContent.replace(/\s+/g, ' ').trim();
            } else {
                // 剪藏模式：保持原有格式，只清理极端情况
                processedContent = processedContent
                    .replace(/[ \t]+/g, ' ') // 只合并空格和制表符，保留换行
                    .replace(/\n{4,}/g, '\n\n\n') // 限制连续换行不超过3个
                    .trim();
            }

            // 2. 移除常见的无用内容（所有模式都适用）
            const removePatterns = [
                /广告|Advertisement|推广|sponsor/gi, // 广告内容
                /分享到|Share to|点赞|Like|评论|Comment/gi, // 社交按钮
                /登录|注册|Sign in|Sign up|Subscribe/gi, // 注册登录相关
                /Cookie|隐私政策|Privacy Policy|Terms/gi, // 法律条款
                /相关推荐|推荐阅读|Related Articles/gi, // 推荐内容
                /版权所有|Copyright|All Rights Reserved/gi // 版权信息
            ];

            removePatterns.forEach(pattern => {
                processedContent = processedContent.replace(pattern, '');
            });

            // 3. 长度限制处理 - 只在AI模式下进行
            if (processingMode === 'ai') {
                const maxLength = data.fullTextMode ? 15000 : 8000; // 全文模式允许更长内容

                /*
                console.log('\n📊 === 内容长度检查与预处理 ===');
                console.log(`📏 当前内容长度: ${processedContent.length} 字符`);
                console.log(`📏 最大允许长度: ${maxLength} 字符`);
                console.log(`🎯 全文模式: ${data.fullTextMode ? '是' : '否'}`);
                console.log(`📄 预处理后完整内容:`);
                console.log('--- 内容开始 ---');
                console.log(processedContent);
                console.log('--- 内容结束 ---');
                */
                if (processedContent.length > maxLength) {
                    console.log(`⚠️ 内容过长，需要裁剪`);

                    // 尝试保留最重要的段落（开头和结尾）
                    const words = processedContent.split(' ');
                    const keepStart = Math.floor(words.length * 0.6); // 保留前60%
                    const keepEnd = Math.floor(words.length * 0.1); // 保留后10%

                    const startPart = words.slice(0, keepStart).join(' ');
                    const endPart = words.slice(-keepEnd).join(' ');

                    processedContent = startPart + '\n\n[...内容已智能截取...]\n\n' + endPart;

                    /*
                    console.log(`📄 裁剪后内容长度: ${processedContent.length} 字符`);
                    console.log(`📄 裁剪后完整内容:`);
                    console.log('--- 裁剪后内容开始 ---');
                    console.log(processedContent);
                    console.log('--- 裁剪后内容结束 ---');
                    */
                    // 再次检查长度，如果还是太长就简单截取
                    /*
                    if (processedContent.length > maxLength) {
                        processedContent = processedContent.substring(0, maxLength) + '...[内容截取]';
                        console.log(`⚠️ 二次截取后长度: ${processedContent.length} 字符`);
                        console.log(`📄 二次截取后完整内容:`);
                        console.log('--- 二次截取后内容开始 ---');
                        console.log(processedContent);
                        console.log('--- 二次截取后内容结束 ---');
                    }
                    */
                } else {
                    console.log(`✅ 内容长度合适，无需裁剪`);
                }
                console.log('='.repeat(50));
            } else {
                // 剪藏模式：不进行任何内容截取，保留完整内容
                /*
                console.log(`📎 剪藏模式：保留完整内容 (${processedContent.length}字符)`);
                console.log(`📄 剪藏模式完整内容:`);
                console.log('--- 内容开始 ---');
                console.log(processedContent);
                console.log('--- 内容结束 ---');
                */
            }

            // 4. 清理标题和描述，使用安全的字符串处理
            const cleanTitle = String(data.title || '未知标题').replace(/\s+/g, ' ').trim().substring(0, 200);
            const cleanDescription = String(data.description || '').replace(/\s+/g, ' ').trim().substring(0, 500);

            const processedData = {
                ...data,
                title: cleanTitle,
                description: cleanDescription,
                content: processedContent,
                url: data.url || '未知URL',
                preprocessedAt: Date.now(),
                processingMode: processingMode,
                optimization: {
                    originalLength,
                    processedLength: processedContent.length,
                    reductionRatio: originalLength > 0 ? ((originalLength - processedContent.length) / originalLength * 100).toFixed(1) : '0',
                    truncated: processingMode === 'ai' && processedContent.includes('[...内容已智能截取...]')
                }
            };

            const endTime = Date.now();
            console.log('✅ 内容预处理完成:');
            console.log(`  📦 处理模式: ${processingMode === 'ai' ? 'AI智能整理' : '一键剪藏'}`);
            console.log(`  📉 内容变化: ${originalLength} → ${processedContent.length} 字符 (-${processedData.optimization.reductionRatio}%)`);
            if (processingMode === 'ai' && processedData.optimization.truncated) {
                console.log(`  ✂️ 内容已截取: 是`);
            }
            console.log(`  ⏱️ 处理耗时: ${endTime - startTime}ms`);

            resolve(processedData);
        });
    }

    /**
     * 更新任务状态
     * @param {string} tabId - 标签页ID  
     * @param {string} taskId - 任务ID
     * @param {string} status - 状态
     * @param {string} progressText - 进度文本
     * @param {Object} result - 结果
     * @param {string} error - 错误信息
     * @param {Object} progressInfo - 进度信息 {step: 当前步骤, total: 总步骤}
     * @param {Object} errorDetails - 详细错误信息
     */
    async updateTaskStatus(tabId, taskId, status, progressText, result = null, error = null, progressInfo = null, errorDetails = null) {
        const taskKey = `task_${tabId}`;

        try {
            const taskData = {
                taskId: taskId,
                status: status,
                progressText: progressText,
                updateTime: Date.now()
            };

            if (progressInfo) {
                taskData.progressInfo = progressInfo;
                // 计算进度百分比
                taskData.progressPercent = Math.round((progressInfo.step / progressInfo.total) * 100);
            }

            if (result) {
                taskData.result = result;
            }

            if (error) {
                taskData.error = error;
            }

            if (errorDetails) {
                taskData.errorDetails = errorDetails;
            }

            await new Promise((resolve) => {
                chrome.storage.local.set({
                    [taskKey]: taskData
                }, resolve);
            });

            // 发送通知
            if (status === 'completed') {
                const performanceInfo = (result && result.performanceMetrics) ? this.formatPerformanceInfo(result.performanceMetrics) : '';
                const message = (result && result.message) || '内容已成功处理并发布到墨问笔记';
                await this.sendNotification('任务完成', `${message}${performanceInfo}`, 'success');
            } else if (status === 'failed') {
                const performanceInfo = (errorDetails && errorDetails.performanceMetrics) ? this.formatPerformanceInfo(errorDetails.performanceMetrics) : '';
                await this.sendNotification('任务失败', `${error || '内容处理失败，请重试'}${performanceInfo}`, 'error');
            }

        } catch (error) {
            console.error('更新任务状态失败:', error);
        }
    }

    /**
     * 格式化性能信息用于通知
     */
    formatPerformanceInfo(metrics) {
        if (!metrics || !metrics.totalTime) return '';

        const totalSeconds = (metrics.totalTime / 1000).toFixed(1);
        let details = [];

        if (metrics.steps) {
            if (metrics.steps.aiProcessing) {
                details.push(`AI处理: ${(metrics.steps.aiProcessing / 1000).toFixed(1)}s`);
            }
            if (metrics.steps.mowenPublishing) {
                details.push(`墨问发布: ${(metrics.steps.mowenPublishing / 1000).toFixed(1)}s`);
            }
        }

        const detailsText = details.length > 0 ? ` (${details.join(', ')})` : '';
        return `\n总耗时: ${totalSeconds}s${detailsText}`;
    }

    /**
     * 发送通知
     */
    async sendNotification(title, message, type = 'info') {
        try {
            const iconUrl = type === 'success' ? 'icons/icon48.png' :
                type === 'error' ? 'icons/icon48.png' : 'icons/icon48.png';

            await chrome.notifications.create({
                type: 'basic',
                iconUrl: iconUrl,
                title: `墨问笔记助手 - ${title}`,
                message: message,
                priority: 1
            });
        } catch (error) {
            console.error('发送通知失败:', error);
        }
    }

    /**
     * 使用AI处理内容并发布到墨问
     * @param {Object} pageData - 页面数据
     * @param {Object} settings - 用户设置
     * @returns {Promise<Object>} 处理结果
     */
    async processContentWithAI(pageData, settings = {}) {
        try {
            // 获取用户配置
            const config = await this.getStoredConfig();

            // 详细验证配置
            const configError = this.validateConfigDetailed(config);
            if (configError) {
                throw new Error(configError);
            }

            // 使用AI整理内容
            const aiResult = await this.callAIAPI(pageData, config, settings);

            // 发布到墨问
            const mowenResult = await this.publishToMowen(aiResult, config, settings);

            const autoPublish = settings.autoPublish !== false;
            const message = autoPublish ? '内容已成功发布到墨问笔记' : '内容未公开';

            return {
                aiResult,
                mowenResult,
                message,
                autoPublish,
                fullTextMode: settings.fullTextMode || false
            };
        } catch (error) {
            console.error('处理内容失败:', error);
            throw error;
        }
    }

    /**
     * 获取存储的配置
     * @returns {Promise<Object>} 配置对象
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
     * @param {Object} config - 配置对象
     * @returns {boolean} 是否有效
     */
    validateConfig(config) {
        return config.aiApiUrl &&
            config.aiApiKey &&
            config.aiModel &&
            config.mowenApiKey;
    }

    /**
     * 详细验证配置并提供具体错误信息
     * @param {Object} config - 配置对象
     * @param {string} mode - 处理模式 ('ai' 或 'clip')
     * @returns {string|null} 错误信息，如果配置正确则返回null
     */
    validateConfigDetailed(config, mode = 'ai') {
        // 墨问API密钥在所有模式下都是必需的
        if (!config.mowenApiKey) {
            return '请在设置中配置墨问API密钥';
        }

        if (config.mowenApiKey.length < 10) {
            return '墨问API密钥格式不正确，请检查设置';
        }

        // 一键剪藏模式只需要墨问API密钥
        if (mode === 'clip') {
            return null;
        }

        // AI模式需要额外的AI配置
        if (mode === 'ai') {
            if (!config.aiApiUrl) {
                return '请在设置中配置AI API地址';
            }
            if (!config.aiApiKey) {
                return '请在设置中配置AI API密钥';
            }
            if (!config.aiModel) {
                return '请在设置中配置AI模型名称';
            }

            // 验证URL格式
            try {
                new URL(config.aiApiUrl);
            } catch (error) {
                return 'AI API地址格式不正确，请检查设置';
            }

            // 验证API密钥格式
            if (config.aiApiKey.length < 10) {
                return 'AI API密钥格式不正确，请检查设置';
            }
        }

        return null;
    }

    /**
     * 调用AI API整理内容
     * @param {Object} pageData - 页面数据
     * @param {Object} config - 配置
     * @param {Object} settings - 用户设置
     * @returns {Promise<Object>} AI处理结果
     */
    async callAIAPI(pageData, config, settings = {}) {
        const requestStart = Date.now();
        console.log('🌐 开始AI API调用流程...');

        // 直接执行AI请求
        return await this.executeAIRequest(pageData, config, settings, requestStart);
    }

    /**
     * 执行实际的AI请求
     * @param {Object} pageData - 页面数据
     * @param {Object} config - 配置
     * @param {Object} settings - 用户设置
     * @param {number} requestStart - 请求开始时间
     * @returns {Promise<Object>} AI处理结果
     */
    async executeAIRequest(pageData, config, settings, requestStart) {
        console.log('🌐 构建AI API请求...');

        const prompt = settings.fullTextMode ?
            this.buildFullTextPrompt(pageData, settings) :
            this.buildSummaryPrompt(pageData, settings);
        /*
        console.log('\n📝 === 发送给AI的详细信息 ===');
        console.log(`🎯 处理模式: ${settings.fullTextMode ? '全文整理' : '总结模式'}`);
        console.log(`📏 页面标题: ${pageData.title || '无标题'}`);
        console.log(`🌐 页面URL: ${pageData.url || '无URL'}`);
        console.log(`📏 页面内容长度: ${pageData.content ? pageData.content.length : 0} 字符`);
        console.log(`📄 页面完整内容:`);
        console.log('--- 页面内容开始 ---');
        console.log(pageData.content || '无内容');
        console.log('--- 页面内容结束 ---');
        console.log(`\n📝 完整Prompt长度: ${prompt.length} 字符`);
        console.log(`📝 发送给AI的完整Prompt:`);
        console.log('--- Prompt开始 ---');
        console.log(prompt);
        console.log('--- Prompt结束 ---');
        console.log('='.repeat(50));
        */
        // 动态调整API参数以提升性能
        const contentLength = pageData.content ? pageData.content.length : 0;
        const isLongContent = contentLength > 5000;

        // 根据内容长度动态调整参数
        const optimizedMaxTokens = settings.fullTextMode ?
            (isLongContent ? 6000 : 4000) :
            (isLongContent ? 3000 : 2000);

        // 更激进的temperature设置以获得更快响应
        const optimizedTemperature = isLongContent ? 0.1 : 0.3;

        const requestBody = {
            model: config.aiModel,
            messages: [{
                    role: "system",
                    content: "你是一个专业的内容整理助手，擅长将网页内容整理成结构化的笔记格式。"
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: optimizedTemperature,
            max_tokens: optimizedMaxTokens,
            // 添加性能优化参数
            stream: false, // 确保不使用流式响应
            top_p: 0.9, // 限制token选择范围，提升速度
            frequency_penalty: 0.1, // 轻微的重复惩罚
            presence_penalty: 0.1 // 轻微的存在惩罚
        };

        console.log('📦 请求体大小:', JSON.stringify(requestBody).length, '字符');
        console.log('🎯 优化参数:');
        console.log(`  📏 Max tokens: ${requestBody.max_tokens} (动态调整)`);
        console.log(`  🌡️ Temperature: ${requestBody.temperature} (${isLongContent ? '长内容优化' : '标准'})`);
        console.log(`  🎛️ Top-p: ${requestBody.top_p}`);
        console.log(`  📝 内容长度: ${contentLength} 字符`);

        const networkStart = Date.now();
        console.log('📡 发送网络请求...');

        // 创建优化的请求配置
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
        }, 300000); // 300秒超时

        try {
            const response = await fetch(config.aiApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.aiApiKey}`,
                    // 添加压缩支持
                    'Accept-Encoding': 'gzip, deflate, br',
                    // 添加连接保持
                    'Connection': 'keep-alive',
                    // 添加缓存控制
                    'Cache-Control': 'no-cache'
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal,
                // 添加现代fetch配置
                keepalive: true, // 保持连接
                priority: 'high' // 高优先级请求
            });

            clearTimeout(timeoutId);

            const networkEnd = Date.now();
            console.log('📡 网络请求完成，耗时:', (networkEnd - networkStart) + 'ms');
            console.log('📊 响应状态:', response.status, response.statusText);
            console.log('📏 响应头信息:');
            console.log(`  Content-Length: ${response.headers.get('content-length') || '未知'}`);
            console.log(`  Content-Encoding: ${response.headers.get('content-encoding') || '无压缩'}`);
            console.log(`  Content-Type: ${response.headers.get('content-type') || '未知'}`);

            if (!response.ok) {
                let errorMessage = `AI API调用失败: ${response.status} ${response.statusText}`;

                // 提供更具体的错误信息
                if (response.status === 401) {
                    errorMessage = 'AI API密钥无效或已过期，请检查设置中的API密钥';
                } else if (response.status === 403) {
                    errorMessage = 'AI API访问被拒绝，请检查API密钥权限或余额';
                } else if (response.status === 429) {
                    errorMessage = 'AI API请求过于频繁，请稍后重试';
                } else if (response.status === 404) {
                    errorMessage = 'AI API地址不正确，请检查设置中的API地址';
                } else if (response.status >= 500) {
                    errorMessage = 'AI服务暂时不可用，请稍后重试';
                }

                console.error('❌ AI API错误:', errorMessage);
                throw new Error(errorMessage);
            }

            const parseStart = Date.now();
            console.log('🔄 解析响应数据...');

            const result = await response.json();
            const parseEnd = Date.now();
            console.log('✅ 响应解析完成，耗时:', (parseEnd - parseStart) + 'ms');

            const content = result.choices[0].message.content;
            console.log('📄 AI返回内容长度:', content.length, '字符');

            console.log('\n🤖 === AI完整响应内容 ===');
            console.log('📄 AI原始返回完整内容:');
            console.log('--- AI响应开始 ---');
            console.log(content);
            console.log('--- AI响应结束 ---');
            console.log('='.repeat(50));

            // 详细的token使用分析
            if (result.usage) {
                console.log('💰 Token使用详情:');
                console.log(`  📥 输入tokens: ${result.usage.prompt_tokens || 'N/A'}`);
                console.log(`  📤 输出tokens: ${result.usage.completion_tokens || 'N/A'}`);
                console.log(`  🎯 总tokens: ${result.usage.total_tokens || 'N/A'}`);

                // 计算效率指标
                if (result.usage.total_tokens && contentLength) {
                    const efficiency = (contentLength / result.usage.total_tokens).toFixed(2);
                    console.log(`  ⚡ 处理效率: ${efficiency} 字符/token`);
                }
            }

            try {
                console.log('🔍 解析AI返回的JSON内容...');
                const parseStartTime = Date.now();
                const parsedResult = this.parseAIResponse(content);
                const parseEndTime = Date.now();

                console.log('\n📊 === AI解析后的结构化数据 ===');
                console.log('✅ JSON解析成功，耗时:', (parseEndTime - parseStartTime) + 'ms');
                console.log('📝 解析后完整结构:');
                console.log('--- 解析结果开始 ---');
                console.log(JSON.stringify(parsedResult, null, 2));
                console.log('--- 解析结果结束 ---');
                // console.log('📝 解析结果预览:', {
                //     title: parsedResult.title,
                //     paragraphCount: parsedResult.paragraphs ? parsedResult.paragraphs.length : 0,
                //     tagsCount: parsedResult.tags ? parsedResult.tags.length : 0
                // });

                // 计算内容字符数
                let totalTextLength = 0;
                if (parsedResult.paragraphs) {
                    parsedResult.paragraphs.forEach((p, pIndex) => {
                        if (p.texts) {
                            p.texts.forEach((t, tIndex) => {
                                if (t.text) {
                                    totalTextLength += t.text.length;
                                    console.log(`📝 段落${pIndex + 1}文本${tIndex + 1}: "${t.text}" (${t.text.length}字符)`);
                                }
                            });
                        }
                    });
                }
                console.log(`📏 解析后总文本长度: ${totalTextLength} 字符`);
                console.log('='.repeat(50));

                // JSON质量检查
                const qualityScore = this.assessJSONQuality(parsedResult, content);
                console.log(`🔍 JSON质量评估: ${qualityScore.emoji} ${qualityScore.grade} (${qualityScore.score}分)`);
                if (qualityScore.issues.length > 0) {
                    console.warn('❌ 发现问题:', qualityScore.issues.join('; '));
                }
                if (qualityScore.warnings.length > 0) {
                    console.warn('⚠️ 警告信息:', qualityScore.warnings.join('; '));
                }
                console.log('📊 质量详情:', qualityScore.details);

                const totalTime = Date.now() - requestStart;
                console.log('⏱️ AI API总耗时:', totalTime + 'ms');

                // 性能评估
                if (totalTime < 5000) {
                    console.log('🚀 AI响应速度：优秀 (<5s)');
                } else if (totalTime < 10000) {
                    console.log('👍 AI响应速度：良好 (<10s)');
                } else if (totalTime < 20000) {
                    console.log('⚠️ AI响应速度：一般 (<20s)');
                } else {
                    console.log('🐌 AI响应速度：较慢 (>20s)');
                }

                // 将质量评估添加到结果中
                parsedResult.qualityAssessment = qualityScore;

                return parsedResult;
            } catch (error) {
                console.error('❌ 意外的解析错误:', error.message);
                throw error;
            }

        } catch (error) {
            clearTimeout(timeoutId);

            if (error.name === 'AbortError') {
                console.error('❌ AI API请求超时 (60秒)');
                throw new Error('AI API请求超时，请检查网络连接或稍后重试');
            }

            throw error;
        }
    }

    /**
     * 从Markdown格式中提取JSON内容
     * @param {string} content - 可能包含Markdown格式的内容
     * @returns {string} 清理后的JSON字符串
     */
    extractJSONFromMarkdown(content) {
        // 基本清理：移除常见的Markdown标记和多余空白
        let cleaned = content.trim();

        // 移除代码块标记（一步完成，使用正则表达式）
        cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?\s*```$/, '');

        // 查找JSON对象的边界
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');

        if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
            cleaned = cleaned.substring(firstBrace, lastBrace + 1);
        }

        return cleaned.trim();
    }

    /**
     * 构建AI总结提示词
     * @param {Object} pageData - 页面数据
     * @param {Object} settings - 用户设置
     * @returns {string} 提示词
     */
    buildSummaryPrompt(pageData, settings = {}) {
        const shouldGenerateTags = settings.generateTags === true;
        const customPrompt = settings.customPrompt || '';

        const tagsInstruction = shouldGenerateTags ?
            "4. 为内容生成不超过1-3个相关标签" :
            "4. 不需要生成标签";

        const tagsJsonField = shouldGenerateTags ?
            '"tags": ["标签1", "标签2", "标签3"],' :
            '"tags": [],';

        const tagsNote = shouldGenerateTags ?
            "- 标签要简洁有意义，不超过3个" :
            "- 不生成标签，tags字段保持为空数组";

        // 构建自定义提示词部分
        const customPromptSection = customPrompt ?
            `

**特别要求：**
${customPrompt}

请在整理内容时特别注意上述要求。` : '';

        return `请将以下网页内容整理成适合发布到墨问笔记的格式。

网页信息：
标题: ${pageData.title}
URL: ${pageData.url}
描述: ${pageData.description}

网页内容：
${pageData.content}

请按照以下要求整理内容：

1. 提取并总结主要内容，去除无关信息
2. 将内容分成多个段落，段落之间用空行分隔
3. 识别重要信息并标记格式：
   - 重要概念或关键词用加粗格式
   - 特别重要的信息用高亮格式
   - 保留原文中的链接
${tagsInstruction}
5. 保持内容的逻辑性和可读性${customPromptSection}

**JSON格式要求：**
必须返回严格符合以下格式的JSON，不要添加任何解释文字：

{
  "title": "整理后的标题",
  "paragraphs": [
    {
      "texts": [
        {"text": "普通文本"},
        {"text": "加粗文本", "bold": true},
        {"text": "高亮文本", "highlight": true},
        {"text": "链接文本", "link": "https://example.com"}
      ]
    },
    {
      "texts": [
        {"text": "第二段内容"}
      ]
    }
  ],
  ${tagsJsonField}
  "sourceUrl": "${pageData.url}"
}

**格式约束：**
- 所有字符串必须用双引号包围
- JSON对象和数组的最后一个元素后不要添加逗号
- text字段不能为空字符串
- link字段必须是有效的URL
- 确保JSON语法完全正确，能被JSON.parse()成功解析
- 不要在JSON外添加任何文字说明或markdown标记

注意：
- 每个段落包含texts数组，每个text对象代表一段文本及其格式
- 段落之间会自动添加空行
- 段落之间中西文之间加空格
- 输出标准JSON格式，确保可以正确解析
- 使用中文输出
${tagsNote}`;
    }

    /**
     * 构建AI全文整理提示词
     * @param {Object} pageData - 页面数据
     * @param {Object} settings - 用户设置
     * @returns {string} 提示词
     */
    buildFullTextPrompt(pageData, settings = {}) {
        const shouldGenerateTags = settings.generateTags === true;
        const customPrompt = settings.customPrompt || '';

        const tagsInstruction = shouldGenerateTags ?
            "5. 为内容生成不超过1-3个相关标签" :
            "5. 不需要生成标签";

        const tagsJsonField = shouldGenerateTags ?
            '"tags": ["标签1", "标签2", "标签3"],' :
            '"tags": [],';

        const tagsNote = shouldGenerateTags ?
            "- 标签要简洁有意义，不超过3个" :
            "- 不生成标签，tags字段保持为空数组";

        // 构建自定义提示词部分
        const customPromptSection = customPrompt ?
            `

**特别要求：**
${customPrompt}

请在整理内容时特别注意上述要求。` : '';

        return `请将以下网页内容进行格式整理，转换为适合发布到墨问笔记的结构化格式。

网页信息：
标题: ${pageData.title}
URL: ${pageData.url}
描述: ${pageData.description}

网页内容：
${pageData.content}

请按照以下要求整理内容：

1. 保留完整的原文内容，不要总结或删减重要信息
2. 优化内容结构和段落划分，提高可读性
3. 识别并标记重要信息：
   - 标题和重要概念用加粗格式
   - 关键信息和要点用高亮格式
   - 保留并优化原文中的链接
4. 修正明显的格式问题和错误
${tagsInstruction}
6. 保持原文的完整性和准确性${customPromptSection}

**JSON格式要求：**
必须返回严格符合以下格式的JSON，不要添加任何解释文字：

{
  "title": "整理后的标题",
  "paragraphs": [
    {
      "texts": [
        {"text": "普通文本"},
        {"text": "加粗文本", "bold": true},
        {"text": "高亮文本", "highlight": true},
        {"text": "链接文本", "link": "https://example.com"}
      ]
    },
    {
      "texts": [
        {"text": "第二段内容"}
      ]
    }
  ],
  ${tagsJsonField}
  "sourceUrl": "${pageData.url}"
}

**格式约束：**
- 所有字符串必须用双引号包围
- JSON对象和数组的最后一个元素后不要添加逗号
- text字段不能为空字符串
- link字段必须是有效的URL
- 确保JSON语法完全正确，能被JSON.parse()成功解析
- 不要在JSON外添加任何文字说明或markdown标记

注意：
- 每个段落包含texts数组，每个text对象代表一段文本及其格式
- 段落之间会自动添加空行
- 段落之间中西文之间加空格
- 重点是格式整理而不是内容总结
- 输出标准JSON格式，确保可以正确解析
- 使用中文输出
${tagsNote}`;
    }

    /**
     * 发布内容到墨问
     * @param {Object} aiResult - AI处理结果
     * @param {Object} config - 配置
     * @param {Object} settings - 用户设置
     * @returns {Promise<Object>} 发布结果
     */
    async publishToMowen(aiResult, config, settings = {}) {
        const requestStart = Date.now();
        console.log('📝 构建墨问API请求...');

        console.log('\n📤 === 传给墨问的AI结果 ===');
        //console.log('📄 AI结果完整结构:');
        //console.log('--- AI结果开始 ---');
        JSON.stringify(aiResult, null, 2);
        //console.log(JSON.stringify(aiResult, null, 2));
        //console.log('--- AI结果结束 ---');

        // 计算AI结果的内容统计
        let aiTotalTextLength = 0;
        if (aiResult.paragraphs) {
            //console.log('📊 AI结果段落详情:');
            aiResult.paragraphs.forEach((p, pIndex) => {
                if (p.texts) {
                    let paragraphLength = 0;
                    p.texts.forEach((t, tIndex) => {
                        if (t.text) {
                            aiTotalTextLength += t.text.length;
                            paragraphLength += t.text.length;
                            //console.log(`  段落${pIndex + 1}文本${tIndex + 1}: "${t.text}" (${t.text.length}字符)`);
                        }
                    });
                    //console.log(`  段落${pIndex + 1}总长度: ${paragraphLength} 字符`);
                }
            });
        }
        console.log(`📏 AI结果总文本长度: ${aiTotalTextLength} 字符`);
        console.log('='.repeat(30));

        // 构建墨问API需要的NoteAtom结构
        const noteAtom = this.buildNoteAtom(aiResult);

        console.log('\n📋 === 构建的墨问NoteAtom结构 ===');
        //console.log('📄 NoteAtom完整结构:');
        //console.log('--- NoteAtom开始 ---');
        //console.log(JSON.stringify(noteAtom, null, 2));
        //console.log('--- NoteAtom结束 ---');

        // 计算NoteAtom的内容统计
        let noteAtomTextLength = 0;
        if (noteAtom.content) {
            // console.log('📊 NoteAtom内容详情:');
            noteAtom.content.forEach((item, iIndex) => {
                if (item.content) {
                    let itemLength = 0;
                    item.content.forEach((textItem, tIndex) => {
                        if (textItem.text) {
                            noteAtomTextLength += textItem.text.length;
                            itemLength += textItem.text.length;
                            //console.log(`  项目${iIndex + 1}文本${tIndex + 1}: "${textItem.text}" (${textItem.text.length}字符)`);
                        }
                    });
                    if (itemLength > 0) {
                        console.log(`  项目${iIndex + 1}总长度: ${itemLength} 字符`);
                    }
                }
            });
        }
        console.log(`📏 NoteAtom总文本长度: ${noteAtomTextLength} 字符`);
        console.log('='.repeat(30));

        // 获取自动发布设置，默认为true
        const autoPublish = settings.autoPublish !== false;

        // 根据generateTags设置决定是否传递标签
        const shouldGenerateTags = settings.generateTags === true;
        const tags = shouldGenerateTags ? (aiResult.tags || []) : [];

        const requestBody = {
            body: noteAtom,
            settings: {
                autoPublish: autoPublish,
                tags: tags
            }
        };

        console.log('📦 请求体大小:', JSON.stringify(requestBody).length, '字符');
        console.log('🏷️ 自动发布:', autoPublish);
        console.log('🔖 标签数量:', tags.length);
        console.log('📄 段落数量:', noteAtom.content ? noteAtom.content.length : 0);

        const networkStart = Date.now();
        console.log('📡 发送墨问API请求...');

        const response = await fetch('https://open.mowen.cn/api/open/api/v1/note/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.mowenApiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        const networkEnd = Date.now();
        console.log('📡 墨问网络请求完成，耗时:', (networkEnd - networkStart) + 'ms');
        console.log('📊 墨问响应状态:', response.status, response.statusText);
        console.log('📏 墨问响应头 Content-Length:', response.headers.get('content-length') || '未知');

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `墨问API调用失败: ${response.status}`;

            console.error('❌ 墨问API错误响应:', errorText);

            // 提供更具体的错误信息
            if (response.status === 401) {
                errorMessage = '墨问API密钥无效或已过期，请检查设置中的墨问API密钥';
            } else if (response.status === 403) {
                if (errorText.includes('Quota')) {
                    errorMessage = '墨问API配额不足，请检查今日使用次数';
                } else {
                    errorMessage = '墨问API权限不足，请确认是否为Pro会员';
                }
            } else if (response.status === 429) {
                errorMessage = '墨问API请求过于频繁，请稍后重试';
            } else if (response.status === 400) {
                errorMessage = '请求参数错误，请检查内容格式';
            } else if (response.status >= 500) {
                errorMessage = '墨问服务暂时不可用，请稍后重试';
            }

            // 如果有详细错误信息，添加到消息中
            if (errorText && errorText.length < 200) {
                errorMessage += `\n详细信息: ${errorText}`;
            }

            console.error('❌ 墨问API最终错误:', errorMessage);
            throw new Error(errorMessage);
        }

        const parseStart = Date.now();
        console.log('🔄 解析墨问响应数据...');

        const result = await response.json();
        const parseEnd = Date.now();
        console.log('✅ 墨问响应解析完成，耗时:', (parseEnd - parseStart) + 'ms');

        const totalTime = Date.now() - requestStart;
        console.log('⏱️ 墨问API总耗时:', totalTime + 'ms');
        console.log('📝 墨问返回结果:', {
            noteId: result.noteId || (result.data && result.data.noteId) || 'N/A',
            success: !!result.success || !!result.data,
            message: result.message || 'N/A'
        });

        return result;
    }

    /**
     * 构建墨问API需要的NoteAtom结构
     * @param {Object} aiResult - AI处理结果
     * @returns {Object} NoteAtom结构
     */
    buildNoteAtom(aiResult) {
        const content = [];

        // 添加标题段落
        if (aiResult.title) {
            content.push({
                type: "paragraph",
                content: [{
                    type: "text",
                    text: aiResult.title,
                    marks: [{ type: "bold" }]
                }]
            });

            // 标题后添加分隔线和空行
            content.push({ type: "paragraph" });
            content.push({
                type: "paragraph",
                content: [{
                    type: "text"
                }]
            });
            //content.push({ type: "paragraph" });
        }

        // 添加来源链接
        if (aiResult.sourceUrl) {
            content.push({
                type: "paragraph",
                content: [{
                        type: "text",
                        text: "📄 来源：",
                        marks: [{ type: "bold" }]
                    },
                    {
                        type: "text",
                        text: "查看原文",
                        marks: [{
                            type: "link",
                            attrs: { href: aiResult.sourceUrl }
                        }]
                    }
                ]
            });

            // 来源后添加更多空行
            content.push({ type: "paragraph" });
            content.push({ type: "paragraph" });
        }

        // 处理段落内容
        if (aiResult.paragraphs && Array.isArray(aiResult.paragraphs)) {
            console.log('\n🔧 === buildNoteAtom段落处理详情 ===');
            console.log(`📄 准备处理 ${aiResult.paragraphs.length} 个段落`);

            aiResult.paragraphs.forEach((paragraph, index) => {
                //console.log(`\n🔄 处理段落 ${index + 1}/${aiResult.paragraphs.length}:`);
                //console.log(`📝 原始段落结构:`, JSON.stringify(paragraph, null, 2));

                if (paragraph.texts && Array.isArray(paragraph.texts)) {
                    // 检查段落是否包含换行符，如果有则分别处理
                    const allText = paragraph.texts.map(t => t.text || '').join('');
                    //console.log(`📏 段落完整文本: "${allText}" (${allText.length}字符)`);
                    //console.log(`📋 包含换行符: ${allText.includes('\n') ? '是' : '否'}`);

                    if (allText.includes('\n')) {
                        // 处理包含换行的段落，按换行分割
                        const lines = allText.split('\n').filter(line => line.trim().length > 0);
                        //console.log(`📝 分割为 ${lines.length} 行:`);

                        lines.forEach((line, lineIndex) => {
                            //console.log(`  行${lineIndex + 1}: "${line.trim()}" (${line.trim().length}字符)`);
                            if (line.trim()) {
                                const lineNodes = this.buildTextNodesForLine(line.trim(), paragraph.texts);
                                //console.log(`  生成节点:`, JSON.stringify(lineNodes, null, 2));
                                content.push({
                                    type: "paragraph",
                                    content: lineNodes
                                });

                                // 行间添加小间距
                                if (lineIndex < lines.length - 1) {
                                    content.push({ type: "paragraph" });
                                    //console.log(`  添加行间空段落`);
                                }
                            }
                        });
                    } else {
                        // 处理普通段落
                        //console.log(`📝 处理为普通段落，包含 ${paragraph.texts.length} 个文本项:`);

                        const textNodes = paragraph.texts.map((textItem, textIndex) => {
                            //console.log(`  文本项${textIndex + 1}: "${textItem.text || ''}" (${(textItem.text || '').length}字符)`);
                            //console.log(`    格式: bold=${!!textItem.bold}, link=${!!textItem.link}`);

                            const node = {
                                type: "text",
                                text: textItem.text || ''
                            };

                            // 添加格式标记
                            const marks = [];
                            if (textItem.bold) {
                                marks.push({ type: "bold" });
                            }
                            // 移除高亮支持
                            if (textItem.link) {
                                marks.push({
                                    type: "link",
                                    attrs: { href: textItem.link }
                                });
                            }

                            if (marks.length > 0) {
                                node.marks = marks;
                            }

                            //console.log(`    生成节点:`, JSON.stringify(node, null, 2));
                            return node;
                        }).filter(node => {
                            const isValid = node.text.trim().length > 0;
                            if (!isValid) {
                                //console.log(`    ⚠️ 过滤掉空文本节点: "${node.text}"`);
                            }
                            return isValid;
                        });

                        //console.log(`📊 过滤后有效节点数: ${textNodes.length}`);

                        if (textNodes.length > 0) {
                            content.push({
                                type: "paragraph",
                                content: textNodes
                            });
                            //console.log(`✅ 添加段落到content，当前content长度: ${content.length}`);
                        } else {
                            //console.warn(`⚠️ 段落 ${index + 1} 被跳过，因为没有有效的文本节点`);
                        }
                    }

                    // 段落间添加空行（增加间距）
                    if (index < aiResult.paragraphs.length - 1) {
                        content.push({ type: "paragraph" });
                        //console.log(`📄 添加段落间空行`);

                        // 每隔几个段落添加额外空行，改善可读性
                        if ((index + 1) % 3 === 0) {
                            content.push({ type: "paragraph" });
                            //console.log(`📄 添加额外空行（每3段）`);
                        }
                    }
                } else {
                    console.warn(`⚠️ 段落 ${index + 1} 没有有效的texts数组:`, paragraph);
                }

                //console.log(`📊 段落 ${index + 1} 处理完成，当前content总长度: ${content.length}`);
            });

            console.log(`✅ 所有段落处理完成，最终content长度: ${content.length}`);
            console.log('='.repeat(50));
        }

        return {
            type: "doc",
            content: content
        };
    }

    /**
     * 为单行文本构建文本节点
     * @param {string} line - 行文本
     * @param {Array} originalTexts - 原始文本数组
     * @returns {Array} 文本节点数组
     */
    buildTextNodesForLine(line, originalTexts) {
        // 检查原始文本中是否有格式信息
        const hasFormatting = originalTexts.some(t => t.bold || t.link);

        if (!hasFormatting) {
            return [{
                type: "text",
                text: line
            }];
        }

        // 如果有格式信息，尝试应用到当前行
        // 简化处理：如果原文本有加粗，且当前行看起来像标题，则加粗
        const isTitle = line.length < 50 && (
            /^[一二三四五六七八九十\d]+[、\.]\s*/.test(line) ||
            /^第[一二三四五六七八九十\d]+[章节部分条]\s*/.test(line) ||
            line.endsWith('：')
        );

        if (isTitle) {
            return [{
                type: "text",
                text: line,
                marks: [{ type: "bold" }]
            }];
        }

        return [{
            type: "text",
            text: line
        }];
    }

    /**
     * 检查任务是否被取消
     * @param {string} tabId - 标签页ID
     * @param {string} taskId - 任务ID
     * @returns {Promise<boolean>} 是否被取消
     */
    async isTaskCancelled(tabId, taskId) {
        try {
            const taskKey = `task_${tabId}`;
            const result = await new Promise((resolve) => {
                chrome.storage.local.get([taskKey], resolve);
            });

            const taskData = result[taskKey];
            // 如果任务数据不存在，说明可能被取消了
            if (!taskData) {
                return true;
            }

            // 检查任务ID是否匹配（防止任务ID冲突）
            if (taskData.taskId !== taskId) {
                return true;
            }

            return false;
        } catch (error) {
            console.error('检查任务取消状态失败:', error);
            // 如果检查失败，为了安全起见，认为任务被取消
            return true;
        }
    }

    /**
     * 简化的AI响应解析方法
     * @param {string} content - AI返回的原始内容
     * @returns {Object} 解析后的JSON对象
     */
    parseAIResponse(content) {
        console.log('🔍 开始AI响应解析...');
        console.log('📄 原始内容长度:', content.length, '字符');
        console.log('📄 原始内容预览:', content.substring(0, 200) + (content.length > 200 ? '...' : ''));

        // 步骤1: 首先去除可能的markdown格式包裹
        let cleanedContent = this.removeMarkdownWrapper(content);
        console.log('🧹 去除markdown包裹后:');
        console.log('📄 清理后内容长度:', cleanedContent.length, '字符');
        console.log('📄 清理后内容预览:', cleanedContent.substring(0, 200) + (cleanedContent.length > 200 ? '...' : ''));

        // 步骤2: 尝试直接解析清理后的JSON
        try {
            console.log('🔄 尝试直接JSON解析...');
            const result = JSON.parse(cleanedContent);
            console.log('✅ 直接解析成功');
            return result;
        } catch (error) {
            console.warn('⚠️ 直接JSON解析失败:', error.message);
        }

        // 步骤3: 进行智能修复后再解析
        try {
            console.log('🔧 进行智能修复...');
            let fixedContent = this.fixJSONSyntax(cleanedContent);
            console.log('📄 修复后内容预览:', fixedContent.substring(0, 200) + (fixedContent.length > 200 ? '...' : ''));

            const result = JSON.parse(fixedContent);
            console.log('✅ 修复后解析成功');
            return result;
        } catch (secondError) {
            console.warn('⚠️ 修复后解析仍失败:', secondError.message);
        }

        // 步骤4: 最后尝试降级解析
        try {
            console.log('🚨 尝试降级解析...');
            const fallbackResult = this.extractFallbackResult(cleanedContent);
            if (fallbackResult) {
                console.warn('⚠️ 使用降级解析结果');
                return fallbackResult;
            }
        } catch (fallbackError) {
            console.error('❌ 降级解析也失败:', fallbackError.message);
        }

        // 步骤5: 所有方法都失败，输出详细错误信息后抛出异常
        console.error('❌ === 所有解析方法均失败 ===');
        console.error('📄 原始内容完整内容:');
        console.error('--- 原始内容开始 ---');
        console.error(content);
        console.error('--- 原始内容结束 ---');
        console.error('📄 清理后内容完整内容:');
        console.error('--- 清理后内容开始 ---');
        console.error(cleanedContent);
        console.error('--- 清理后内容结束 ---');
        console.error('='.repeat(50));

        throw new Error('AI返回的JSON格式不正确，请重试。如果问题持续出现，请检查AI模型设置。');
    }

    /**
     * 去除markdown代码块包裹
     * @param {string} content - 原始内容
     * @returns {string} 去除markdown包裹后的内容
     */
    removeMarkdownWrapper(content) {
        let cleaned = content.trim();

        console.log('🧹 开始去除markdown包裹...');
        console.log('📄 处理前内容:', cleaned.substring(0, 100) + '...');

        // 1. 去除代码块标记（支持多种变体）
        // 匹配 ```json 或 ``` 开头，以及结尾的 ```
        cleaned = cleaned.replace(/^```(?:json|JSON)?\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '');

        // 2. 去除其他可能的markdown标记
        cleaned = cleaned.replace(/^#+\s+.*\n?/gm, ''); // 移除标题行
        cleaned = cleaned.replace(/^\*\*.*\*\*\s*\n?/gm, ''); // 移除加粗说明行

        // 3. 查找JSON对象的边界，提取纯JSON部分
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');

        if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
            const extracted = cleaned.substring(firstBrace, lastBrace + 1);
            console.log('✅ 成功提取JSON边界内容');
            console.log('📏 提取前长度:', cleaned.length, '→ 提取后长度:', extracted.length);
            return extracted.trim();
        }

        console.log('⚠️ 未找到完整的JSON边界，返回清理后的原内容');
        return cleaned.trim();
    }

    /**
     * 修复JSON语法错误
     * @param {string} content - 清理后的内容
     * @returns {string} 修复后的JSON字符串
     */
    fixJSONSyntax(content) {
        let fixed = content.trim();

        console.log('🔧 开始修复JSON语法...');

        // 1. 修复常见的JSON语法错误
        fixed = fixed
            // 移除JSON末尾多余的逗号
            .replace(/,(\s*[}\]])/g, '$1')
            // 修复单引号为双引号
            .replace(/'/g, '"')
            // 修复属性名没有引号的情况
            .replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":')
            // 修复值中的换行符
            .replace(/\n/g, '\\n')
            // 修复值中的制表符
            .replace(/\t/g, '\\t')
            // 移除多余的反斜杠
            .replace(/\\\\/g, '\\');

        // 2. 验证关键字段存在
        if (!fixed.includes('"title"') || !fixed.includes('"paragraphs"')) {
            console.warn('⚠️ 缺少必要的JSON字段');
            throw new Error('缺少必要的JSON字段');
        }

        console.log('✅ JSON语法修复完成');
        return fixed;
    }

    /**
     * 提取降级解析结果
     * @param {string} content - 原始内容
     * @returns {Object|null} 降级解析结果或null
     */
    extractFallbackResult(content) {
        try {
            // 尝试提取基本信息
            const titleMatch = content.match(/"title"\s*:\s*"([^"]+)"/);
            const sourceUrlMatch = content.match(/"sourceUrl"\s*:\s*"([^"]+)"/);

            // 只有在标题有意义时才继续处理
            if (!titleMatch || titleMatch[1].trim().length < 3) {
                console.warn('⚠️ 无法提取有效标题，放弃降级解析');
                return null;
            }

            const title = titleMatch[1].trim();

            // 检查标题是否包含错误信息关键词
            const errorKeywords = ['错误', '失败', '格式', 'error', 'failed', 'invalid', '解析'];
            if (errorKeywords.some(keyword => title.toLowerCase().includes(keyword.toLowerCase()))) {
                console.warn('⚠️ 标题包含错误信息，放弃降级解析');
                return null;
            }

            // 尝试提取段落内容
            const paragraphsMatch = content.match(/"paragraphs"\s*:\s*\[([\s\S]*?)\]/);

            if (paragraphsMatch) {
                console.log('🔧 提取到部分有效信息，尝试构建降级结果');

                // 尝试解析段落内容
                try {
                    const paragraphsStr = '{"paragraphs":[' + paragraphsMatch[1] + ']}';
                    const parsedParagraphs = JSON.parse(paragraphsStr);

                    if (parsedParagraphs.paragraphs && parsedParagraphs.paragraphs.length > 0) {
                        // 验证段落内容的有效性
                        const validParagraphs = parsedParagraphs.paragraphs.filter(p => {
                            if (!p.texts || !Array.isArray(p.texts) || p.texts.length === 0) {
                                return false;
                            }

                            // 检查是否有有效的文本内容
                            const validTexts = p.texts.filter(t => {
                                if (!t.text || typeof t.text !== 'string' || t.text.trim().length === 0) {
                                    return false;
                                }

                                // 排除包含错误信息的文本
                                const text = t.text.toLowerCase();
                                return !errorKeywords.some(keyword => text.includes(keyword.toLowerCase()));
                            });

                            return validTexts.length > 0;
                        });

                        if (validParagraphs.length > 0) {
                            // 进一步清理段落，移除错误相关的文本
                            const cleanedParagraphs = validParagraphs.map(p => ({
                                texts: p.texts.filter(t => {
                                    const text = t.text.toLowerCase();
                                    return !errorKeywords.some(keyword => text.includes(keyword.toLowerCase()));
                                })
                            })).filter(p => p.texts.length > 0);

                            if (cleanedParagraphs.length > 0) {
                                console.log(`✅ 成功提取 ${cleanedParagraphs.length} 个有效段落`);
                                return {
                                    title: title,
                                    paragraphs: cleanedParagraphs,
                                    tags: [],
                                    sourceUrl: sourceUrlMatch ? sourceUrlMatch[1] : ""
                                };
                            }
                        }
                    }
                } catch (parseError) {
                    console.warn('段落内容解析失败:', parseError.message);
                }
            }

            // 如果无法提取完整段落，尝试提取文本片段
            console.log('🔧 尝试从原始内容中提取文本片段');

            // 尝试从原始内容中提取一些有意义的文本
            const textMatches = content.match(/"text"\s*:\s*"([^"]+)"/g);
            if (textMatches && textMatches.length > 0) {
                const extractedTexts = textMatches
                    .map(match => {
                        const textMatch = match.match(/"text"\s*:\s*"([^"]+)"/);
                        return textMatch ? textMatch[1] : null;
                    })
                    .filter(text => {
                        if (!text || text.trim().length < 5) return false;

                        // 排除包含错误信息的文本
                        const lowerText = text.toLowerCase();
                        return !errorKeywords.some(keyword => lowerText.includes(keyword.toLowerCase()));
                    })
                    .slice(0, 3); // 最多提取3个文本片段

                if (extractedTexts.length > 0) {
                    console.log(`✅ 提取到 ${extractedTexts.length} 个有效文本片段`);
                    return {
                        title: title,
                        paragraphs: [{
                            texts: extractedTexts.map(text => ({ text: text }))
                        }],
                        tags: [],
                        sourceUrl: sourceUrlMatch ? sourceUrlMatch[1] : ""
                    };
                }
            }
        } catch (error) {
            console.error('降级解析失败:', error);
        }

        // 如果无法提取任何有效内容，返回null让上层抛出错误
        console.warn('⚠️ 无法提取任何有效且有意义的内容');
        return null;
    }

    /**
     * 评估JSON质量
     * @param {Object} parsedResult - 解析后的JSON对象
     * @param {string} originalContent - 原始内容
     * @returns {Object} 质量评估结果
     */
    assessJSONQuality(parsedResult, originalContent) {
        const assessment = {
            score: 100,
            issues: [],
            warnings: [],
            details: {}
        };

        // 1. 检查必需字段
        if (!parsedResult.title) {
            assessment.score -= 20;
            assessment.issues.push('缺少title字段');
        } else if (parsedResult.title.length < 3) {
            assessment.score -= 10;
            assessment.warnings.push('title过短');
        }

        if (!parsedResult.paragraphs || !Array.isArray(parsedResult.paragraphs)) {
            assessment.score -= 30;
            assessment.issues.push('缺少或格式错误的paragraphs字段');
        } else {
            // 检查段落结构
            let validParagraphs = 0;
            let totalTexts = 0;

            parsedResult.paragraphs.forEach((paragraph, index) => {
                if (!paragraph.texts || !Array.isArray(paragraph.texts)) {
                    assessment.score -= 5;
                    assessment.issues.push(`段落${index + 1}缺少texts数组`);
                } else {
                    validParagraphs++;
                    paragraph.texts.forEach((text, textIndex) => {
                        if (!text.text || typeof text.text !== 'string') {
                            assessment.score -= 3;
                            assessment.issues.push(`段落${index + 1}文本${textIndex + 1}无效`);
                        } else {
                            totalTexts++;
                            if (text.text.trim().length === 0) {
                                assessment.score -= 2;
                                assessment.warnings.push(`段落${index + 1}包含空文本`);
                            }
                        }

                        // 检查链接格式
                        if (text.link && !text.link.match(/^https?:\/\//)) {
                            assessment.score -= 2;
                            assessment.warnings.push(`段落${index + 1}包含无效链接`);
                        }
                    });
                }
            });

            assessment.details.validParagraphs = validParagraphs;
            assessment.details.totalTexts = totalTexts;
        }

        // 2. 检查标签
        if (parsedResult.tags && Array.isArray(parsedResult.tags)) {
            if (parsedResult.tags.length > 5) {
                assessment.score -= 5;
                assessment.warnings.push('标签数量过多');
            }
            assessment.details.tagsCount = parsedResult.tags.length;
        }

        // 3. 检查原始内容质量
        const needsCleanup = originalContent.includes('```') ||
            originalContent.includes('解释') ||
            originalContent.includes('说明');
        if (needsCleanup) {
            assessment.score -= 5;
            assessment.warnings.push('AI返回包含额外说明文字');
        }

        // 4. 计算内容丰富度
        const contentLength = JSON.stringify(parsedResult).length;
        if (contentLength < 200) {
            assessment.score -= 10;
            assessment.warnings.push('内容过于简单');
        }
        assessment.details.contentLength = contentLength;

        // 5. 质量等级
        if (assessment.score >= 90) {
            assessment.grade = '优秀';
            assessment.emoji = '🎯';
        } else if (assessment.score >= 75) {
            assessment.grade = '良好';
            assessment.emoji = '👍';
        } else if (assessment.score >= 60) {
            assessment.grade = '一般';
            assessment.emoji = '⚠️';
        } else {
            assessment.grade = '较差';
            assessment.emoji = '🚨';
        }

        return assessment;
    }
}

// 初始化后台脚本
new MowenNoteHelper();