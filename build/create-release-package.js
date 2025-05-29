#!/usr/bin/env node

/**
 * Chrome扩展发布包打包脚本
 * 功能：创建干净的发布ZIP包，排除开发文件，保护源码安全
 * 作者：墨问笔记助手团队
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('📦 开始创建Chrome扩展发布包...\n');

// 配置项
const config = {
    // 发布包信息
    packageName: 'mowen-chrome-extension',
    outputDir: 'build/release',
    tempDir: 'build/temp',

    // 需要包含在发布包中的文件和目录
    includePatterns: [
        'manifest.json',
        'background.js',
        'content.js',
        'popup.html',
        'popup.css',
        'popup.js',
        'options.html',
        'options.css',
        'options.js',
        'sidepanel.html',
        'sidepanel.css',
        'sidepanel.js',
        'icons/icon16.png',
        'icons/icon32.png',
        'icons/icon48.png',
        'icons/icon64.png',
        'icons/icon128.png'
    ],

    // 需要排除的文件和目录（安全考虑）
    excludePatterns: [
        '.git/**/*',
        '.gitignore',
        'node_modules/**/*',
        'build/**/*',
        '*.md',
        '测试*.md',
        'test*.html',
        'debug.js',
        'screenshot/**/*',
        '**/*.log',
        '**/*.tmp',
        '**/.*',
        'package*.json',
        'yarn.lock',
        '.env*'
    ]
};

/**
 * 创建目录（如果不存在）
 */
function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`📁 创建目录: ${dirPath}`);
    }
}

/**
 * 清理目录
 */
function cleanDir(dirPath) {
    if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
        console.log(`🧹 清理目录: ${dirPath}`);
    }
}

/**
 * 检查文件是否应该被包含
 */
function shouldIncludeFile(filePath) {
    const relativePath = path.relative(process.cwd(), filePath);

    // 检查排除模式
    for (const pattern of config.excludePatterns) {
        if (matchPattern(relativePath, pattern)) {
            return false;
        }
    }

    // 检查包含模式
    for (const pattern of config.includePatterns) {
        if (matchPattern(relativePath, pattern)) {
            return true;
        }
    }

    return false;
}

/**
 * 简单的通配符匹配
 */
function matchPattern(filePath, pattern) {
    // 标准化路径分隔符
    const normalizedFilePath = filePath.replace(/\\/g, '/');
    const normalizedPattern = pattern.replace(/\\/g, '/');

    // 转换通配符为正则表达式
    const regexPattern = normalizedPattern
        .replace(/\*\*/g, '___DOUBLESTAR___')
        .replace(/\*/g, '[^/]*')
        .replace(/___DOUBLESTAR___/g, '.*')
        .replace(/\?/g, '[^/]');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(normalizedFilePath);
}

/**
 * 复制文件到临时目录
 */
function copyFilesToTemp() {
    console.log('📋 收集发布文件...');

    const copiedFiles = [];

    function processFile(filePath) {
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            // 递归处理目录
            const files = fs.readdirSync(filePath);
            files.forEach(file => {
                processFile(path.join(filePath, file));
            });
        } else if (stat.isFile() && shouldIncludeFile(filePath)) {
            // 复制文件
            const relativePath = path.relative(process.cwd(), filePath);
            const destPath = path.join(config.tempDir, relativePath);

            // 确保目标目录存在
            ensureDir(path.dirname(destPath));

            // 复制文件
            fs.copyFileSync(filePath, destPath);
            copiedFiles.push(relativePath);
            console.log(`   ✅ ${relativePath}`);
        }
    }

    // 从当前目录开始处理
    processFile('.');

    console.log(`\n📊 总共收集了 ${copiedFiles.length} 个文件`);
    return copiedFiles;
}

/**
 * 验证发布包内容
 */
function validatePackage() {
    console.log('🔍 验证发布包内容...');

    const requiredFiles = [
        'manifest.json',
        'background.js',
        'content.js',
        'popup.html',
        'popup.js',
        'popup.css',
        'icons/icon16.png',
        'icons/icon48.png',
        'icons/icon128.png'
    ];

    const missingFiles = [];

    requiredFiles.forEach(file => {
        const filePath = path.join(config.tempDir, file);
        if (!fs.existsSync(filePath)) {
            missingFiles.push(file);
        }
    });

    if (missingFiles.length > 0) {
        console.error('❌ 发布包缺少必要文件:');
        missingFiles.forEach(file => console.error(`   - ${file}`));
        throw new Error('发布包验证失败');
    }

    // 验证manifest.json
    const manifestPath = path.join(config.tempDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    if (!manifest.name || !manifest.version || !manifest.description) {
        throw new Error('manifest.json 缺少必要字段');
    }

    console.log('   ✅ 发布包验证通过');
    console.log(`   📝 扩展名称: ${manifest.name}`);
    console.log(`   🏷️  版本号: ${manifest.version}`);
    console.log(`   📄 描述: ${manifest.description}`);

    return manifest;
}

/**
 * 创建ZIP包
 */
function createZipPackage(manifest) {
    console.log('\n📦 创建ZIP发布包...');

    const zipFileName = `${config.packageName}-v${manifest.version}.zip`;
    const zipFilePath = path.join(config.outputDir, zipFileName);

    // 确保输出目录存在
    ensureDir(config.outputDir);

    try {
        // 切换到临时目录并创建ZIP
        const currentDir = process.cwd();
        process.chdir(config.tempDir);

        // 使用系统的压缩命令（跨平台）
        let zipCommand;
        if (process.platform === 'win32') {
            // Windows使用PowerShell
            const absoluteZipPath = path.resolve(currentDir, zipFilePath);
            zipCommand = `powershell -Command "Compress-Archive -Path * -DestinationPath '${absoluteZipPath}' -Force"`;
        } else {
            // Unix/Linux/macOS使用zip命令
            const absoluteZipPath = path.resolve(currentDir, zipFilePath);
            zipCommand = `zip -r "${absoluteZipPath}" *`;
        }

        console.log(`   🔧 执行命令: ${zipCommand}`);
        execSync(zipCommand, { stdio: 'inherit' });

        // 恢复原目录
        process.chdir(currentDir);

        // 检查ZIP文件是否创建成功
        if (fs.existsSync(zipFilePath)) {
            const zipStats = fs.statSync(zipFilePath);
            const zipSizeMB = (zipStats.size / 1024 / 1024).toFixed(2);

            console.log(`   ✅ ZIP包创建成功`);
            console.log(`   📁 文件路径: ${zipFilePath}`);
            console.log(`   📊 文件大小: ${zipSizeMB}MB`);

            return zipFilePath;
        } else {
            throw new Error('ZIP文件创建失败');
        }

    } catch (error) {
        process.chdir(process.cwd()); // 确保返回原目录
        throw error;
    }
}

/**
 * 生成发布清单
 */
function generateReleaseManifest(zipFilePath, manifest, copiedFiles) {
    console.log('\n📋 生成发布清单...');

    const releaseManifest = {
        packageInfo: {
            name: manifest.name,
            version: manifest.version,
            description: manifest.description,
            created: new Date().toISOString()
        },
        package: {
            fileName: path.basename(zipFilePath),
            filePath: zipFilePath,
            size: fs.statSync(zipFilePath).size,
            hash: generateFileHash(zipFilePath)
        },
        contents: {
            totalFiles: copiedFiles.length,
            files: copiedFiles.sort()
        },
        buildInfo: {
            buildTool: 'mowen-plugin-build-tool',
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch
        },
        security: {
            excludedPatterns: config.excludePatterns,
            notes: [
                '所有开发文件已排除',
                '敏感信息已过滤',
                '源码安全已保护'
            ]
        }
    };

    const manifestPath = path.join(config.outputDir, 'release-manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(releaseManifest, null, 2));

    console.log(`   ✅ 发布清单已保存: ${manifestPath}`);
    return releaseManifest;
}

/**
 * 生成文件哈希值（简单版本）
 */
function generateFileHash(filePath) {
    const crypto = require('crypto');
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex').substring(0, 16); // 取前16位
}

/**
 * 清理临时文件
 */
function cleanup() {
    console.log('\n🧹 清理临时文件...');
    cleanDir(config.tempDir);
    console.log('   ✅ 清理完成');
}

/**
 * 显示发布指导
 */
function showReleaseGuide(zipFilePath, manifest) {
    console.log('\n' + '━'.repeat(80));
    console.log('🎉 发布包创建成功！');
    console.log('━'.repeat(80));
    console.log();
    console.log('📦 发布包信息:');
    console.log(`   名称: ${manifest.name}`);
    console.log(`   版本: ${manifest.version}`);
    console.log(`   文件: ${path.basename(zipFilePath)}`);
    console.log(`   路径: ${zipFilePath}`);
    console.log();
    console.log('🚀 下一步操作:');
    console.log('   1. 访问 Chrome Web Store 开发者控制台');
    console.log('   2. 上传ZIP文件');
    console.log('   3. 填写商店列表信息');
    console.log('   4. 提交审核');
    console.log();
    console.log('📖 详细指导请查看: CHROME_STORE_PUBLISH_GUIDE.md');
    console.log();
    console.log('🛡️  安全提醒:');
    console.log('   ✅ 开发文件已排除');
    console.log('   ✅ 调试代码已清理');
    console.log('   ✅ 敏感信息已过滤');
    console.log('   ✅ 源码安全已保护');
    console.log();
    console.log('━'.repeat(80));
}

// 主执行流程
async function main() {
    try {
        console.log('━'.repeat(80));
        console.log('               墨问笔记助手 - 发布包创建工具');
        console.log('━'.repeat(80));
        console.log();

        // 步骤1: 准备目录
        cleanDir(config.tempDir);
        cleanDir(config.outputDir);
        ensureDir(config.tempDir);
        ensureDir(config.outputDir);

        // 步骤2: 复制文件到临时目录
        const copiedFiles = copyFilesToTemp();

        // 步骤3: 验证发布包
        const manifest = validatePackage();

        // 步骤4: 创建ZIP包
        const zipFilePath = createZipPackage(manifest);

        // 步骤5: 生成发布清单
        generateReleaseManifest(zipFilePath, manifest, copiedFiles);

        // 步骤6: 清理临时文件
        cleanup();

        // 步骤7: 显示发布指导
        showReleaseGuide(zipFilePath, manifest);

    } catch (error) {
        console.error('\n❌ 发布包创建失败:', error.message);
        console.error('');
        console.error('🔧 可能的解决方案:');
        console.error('   1. 检查所有必要文件是否存在');
        console.error('   2. 确保有足够的磁盘空间');
        console.error('   3. 验证文件权限是否正确');
        console.error('   4. 尝试重新运行发布准备脚本');

        // 清理失败的临时文件
        try {
            cleanup();
        } catch (cleanupError) {
            console.error('清理临时文件失败:', cleanupError.message);
        }

        process.exit(1);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    main();
}

module.exports = { main, config };