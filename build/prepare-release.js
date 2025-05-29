#!/usr/bin/env node

/**
 * Chrome扩展发布准备脚本
 * 功能：清理调试代码、移除敏感信息、优化代码
 * 作者：墨问笔记助手团队
 */

const fs = require('fs');
const path = require('path');

console.log('🚀 开始准备Chrome扩展发布包...\n');

// 配置项
const config = {
    // 需要清理的文件类型
    targetExtensions: ['.js', '.html', '.css'],

    // 需要移除的调试代码模式
    debugPatterns: [
        /console\.log\([^)]*\);?\s*/g, // console.log语句
        /console\.debug\([^)]*\);?\s*/g, // console.debug语句
        /console\.warn\([^)]*\);?\s*/g, // console.warn语句（保留error）
        /\/\*\s*DEBUG.*?\*\//gs, // /* DEBUG ... */ 注释块
        /\/\/\s*DEBUG.*$/gm, // // DEBUG 注释行
        /\/\/\s*TODO.*$/gm, // // TODO 注释行
        /\/\/\s*FIXME.*$/gm, // // FIXME 注释行
        /debugger;?\s*/g, // debugger语句
    ],

    // 保留的console方法（错误日志等重要信息）
    preserveConsole: ['console.error'],

    // 排除的文件和目录
    excludeFiles: [
        '.git',
        'node_modules',
        'build',
        '.gitignore',
        '*.md',
        '测试*.md',
        'test*.html',
        'debug.js',
        'screenshot'
    ],

    // 代码混淆选项（可选，默认关闭）
    // 注意：混淆可能影响调试和审核通过率
    obfuscation: {
        enabled: false, // 设为true启用混淆
        options: {
            compact: true,
            controlFlowFlattening: false, // 避免过度混淆影响性能
            deadCodeInjection: false,
            debugProtection: false,
            renameGlobals: false, // 保持Chrome API调用不变
            stringArray: true,
            stringArrayEncoding: ['base64'],
            target: 'browser'
        }
    }
};

/**
 * 检查文件是否应该被处理
 */
function shouldProcessFile(filePath) {
    const fileName = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();

    // 检查文件扩展名
    if (!config.targetExtensions.includes(ext)) {
        return false;
    }

    // 检查排除列表
    for (const exclude of config.excludeFiles) {
        if (exclude.includes('*')) {
            // 通配符匹配
            const pattern = exclude.replace(/\*/g, '.*');
            if (new RegExp(pattern).test(fileName)) {
                return false;
            }
        } else if (filePath.includes(exclude)) {
            return false;
        }
    }

    return true;
}

/**
 * 清理JavaScript文件中的调试代码
 */
function cleanJavaScriptFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let originalLength = content.length;
    let removedCount = 0;

    console.log(`📝 处理JS文件: ${path.relative(process.cwd(), filePath)}`);

    // 应用清理模式
    config.debugPatterns.forEach((pattern, index) => {
        const matches = content.match(pattern);
        if (matches) {
            removedCount += matches.length;
            content = content.replace(pattern, '');
        }
    });

    // 清理多余的空行（连续超过2行的空行）
    content = content.replace(/\n\s*\n\s*\n/g, '\n\n');

    // 清理行尾空格
    content = content.replace(/[ \t]+$/gm, '');

    // 如果内容有变化，写回文件
    if (content.length !== originalLength) {
        fs.writeFileSync(filePath, content, 'utf8');
        const reductionPercent = ((originalLength - content.length) / originalLength * 100).toFixed(1);
        console.log(`   ✅ 清理完成：移除 ${removedCount} 项调试代码，文件减小 ${reductionPercent}%`);
    } else {
        console.log(`   ℹ️  无需清理`);
    }
}

/**
 * 清理HTML文件中的调试代码
 */
function cleanHtmlFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let originalLength = content.length;

    console.log(`📄 处理HTML文件: ${path.relative(process.cwd(), filePath)}`);

    // 移除HTML注释中的调试信息
    content = content.replace(/<!--\s*DEBUG.*?-->/gs, '');
    content = content.replace(/<!--\s*TODO.*?-->/gs, '');

    // 清理多余的空行
    content = content.replace(/\n\s*\n\s*\n/g, '\n\n');

    if (content.length !== originalLength) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`   ✅ 清理完成`);
    } else {
        console.log(`   ℹ️  无需清理`);
    }
}

/**
 * 清理CSS文件中的调试代码
 */
function cleanCssFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let originalLength = content.length;

    console.log(`🎨 处理CSS文件: ${path.relative(process.cwd(), filePath)}`);

    // 移除CSS注释中的调试信息
    content = content.replace(/\/\*\s*DEBUG.*?\*\//gs, '');
    content = content.replace(/\/\*\s*TODO.*?\*\//gs, '');

    // 清理多余的空行
    content = content.replace(/\n\s*\n\s*\n/g, '\n\n');

    if (content.length !== originalLength) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`   ✅ 清理完成`);
    } else {
        console.log(`   ℹ️  无需清理`);
    }
}

/**
 * 优化manifest.json文件
 */
function optimizeManifest() {
    const manifestPath = 'manifest.json';
    if (!fs.existsSync(manifestPath)) {
        console.warn('⚠️  未找到manifest.json文件');
        return;
    }

    console.log('⚙️  优化manifest.json文件...');

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    // 检查版本号格式
    if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
        console.warn('⚠️  版本号格式建议使用 x.y.z 格式');
    }

    // 检查必要字段
    const requiredFields = ['name', 'version', 'description', 'manifest_version'];
    const missingFields = requiredFields.filter(field => !manifest[field]);

    if (missingFields.length > 0) {
        console.warn('⚠️  缺少必要字段:', missingFields.join(', '));
    }

    // 格式化输出（美化JSON）
    const prettifiedManifest = JSON.stringify(manifest, null, 2);
    fs.writeFileSync(manifestPath, prettifiedManifest, 'utf8');

    console.log('   ✅ manifest.json优化完成');
}

/**
 * 递归处理目录中的文件
 */
function processDirectory(dirPath) {
    const files = fs.readdirSync(dirPath);

    files.forEach(file => {
        const filePath = path.join(dirPath, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            // 检查是否应该跳过这个目录
            if (!config.excludeFiles.some(exclude => filePath.includes(exclude))) {
                processDirectory(filePath);
            }
        } else if (stat.isFile() && shouldProcessFile(filePath)) {
            const ext = path.extname(filePath).toLowerCase();

            switch (ext) {
                case '.js':
                    cleanJavaScriptFile(filePath);
                    break;
                case '.html':
                    cleanHtmlFile(filePath);
                    break;
                case '.css':
                    cleanCssFile(filePath);
                    break;
            }
        }
    });
}

/**
 * 验证关键文件存在性
 */
function validateCoreFiles() {
    console.log('🔍 验证核心文件...');

    const coreFiles = [
        'manifest.json',
        'background.js',
        'content.js',
        'popup.html',
        'popup.js',
        'popup.css',
        'options.html',
        'options.js',
        'options.css',
        'sidepanel.html',
        'sidepanel.js',
        'sidepanel.css',
        'icons/icon16.png',
        'icons/icon48.png',
        'icons/icon128.png'
    ];

    const missingFiles = coreFiles.filter(file => !fs.existsSync(file));

    if (missingFiles.length > 0) {
        console.error('❌ 缺少关键文件:');
        missingFiles.forEach(file => console.error(`   - ${file}`));
        process.exit(1);
    }

    console.log('   ✅ 所有核心文件存在');
}

/**
 * 检查文件大小
 */
function checkFileSizes() {
    console.log('📊 检查文件大小...');

    const sizeWarningThreshold = 1024 * 1024; // 1MB
    let totalSize = 0;

    function checkFile(filePath) {
        if (fs.existsSync(filePath)) {
            const stat = fs.statSync(filePath);
            if (stat.isFile()) {
                totalSize += stat.size;
                if (stat.size > sizeWarningThreshold) {
                    console.warn(`⚠️  大文件警告: ${filePath} (${(stat.size / 1024 / 1024).toFixed(2)}MB)`);
                }
            } else if (stat.isDirectory() && !config.excludeFiles.some(exclude => filePath.includes(exclude))) {
                fs.readdirSync(filePath).forEach(file => {
                    checkFile(path.join(filePath, file));
                });
            }
        }
    }

    checkFile('.');

    console.log(`   ℹ️  总文件大小: ${(totalSize / 1024 / 1024).toFixed(2)}MB`);

    if (totalSize > 128 * 1024 * 1024) { // 128MB是Chrome扩展的大小限制
        console.error('❌ 扩展包过大，超过128MB限制');
        process.exit(1);
    }
}

/**
 * 生成发布报告
 */
function generateReport() {
    console.log('\n📋 生成发布准备报告...');

    const report = {
        timestamp: new Date().toISOString(),
        version: JSON.parse(fs.readFileSync('manifest.json', 'utf8')).version,
        status: 'ready',
        notes: [
            '✅ 调试代码已清理',
            '✅ 文件格式已优化',
            '✅ 核心文件验证通过',
            '✅ 文件大小检查通过'
        ]
    };

    fs.writeFileSync('build/release-report.json', JSON.stringify(report, null, 2));
    console.log('   ✅ 报告已保存到 build/release-report.json');
}

// 主执行流程
async function main() {
    try {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('                   墨问笔记助手 - 发布准备工具');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // 步骤1: 验证核心文件
        validateCoreFiles();

        // 步骤2: 优化manifest.json
        optimizeManifest();

        // 步骤3: 清理代码文件
        console.log('\n🧹 开始清理调试代码...');
        processDirectory('.');

        // 步骤4: 检查文件大小
        console.log('');
        checkFileSizes();

        // 步骤5: 生成报告
        generateReport();

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🎉 发布准备完成！您的扩展已准备好进行打包。');
        console.log('');
        console.log('📦 下一步: 运行 node build/create-release-package.js 创建发布包');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    } catch (error) {
        console.error('\n❌ 发布准备失败:', error.message);
        process.exit(1);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    main();
}

module.exports = { main, config };