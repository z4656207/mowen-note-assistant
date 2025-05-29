#!/usr/bin/env node

/**
 * 简化版Chrome扩展打包脚本
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('📦 创建Chrome扩展发布包...\n');

// 读取manifest获取版本信息
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
console.log(`扩展名称: ${manifest.name}`);
console.log(`版本: ${manifest.version}\n`);

// 需要包含的文件列表
const filesToInclude = [
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
];

// 创建输出目录
const outputDir = 'build/release';
const tempDir = 'build/temp';

// 清理并创建目录
if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true });
}
if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
}

fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(tempDir, { recursive: true });

// 复制文件到临时目录
console.log('📋 复制文件到临时目录...');
filesToInclude.forEach(file => {
    if (fs.existsSync(file)) {
        const destPath = path.join(tempDir, file);

        // 确保目标目录存在
        fs.mkdirSync(path.dirname(destPath), { recursive: true });

        // 复制文件
        fs.copyFileSync(file, destPath);
        console.log(`   ✅ ${file}`);
    } else {
        console.log(`   ❌ ${file} (文件不存在)`);
    }
});

// 创建ZIP包
const zipFileName = `mowen-chrome-extension-v${manifest.version}.zip`;
const zipFilePath = path.join(outputDir, zipFileName);

console.log('\n📦 创建ZIP包...');

try {
    // 切换到临时目录
    const currentDir = process.cwd();
    process.chdir(tempDir);

    // 创建ZIP
    if (process.platform === 'win32') {
        const absoluteZipPath = path.resolve(currentDir, zipFilePath);
        execSync(`powershell -Command "Compress-Archive -Path * -DestinationPath '${absoluteZipPath}' -Force"`, { stdio: 'inherit' });
    } else {
        const absoluteZipPath = path.resolve(currentDir, zipFilePath);
        execSync(`zip -r "${absoluteZipPath}" *`, { stdio: 'inherit' });
    }

    // 返回原目录
    process.chdir(currentDir);

    // 检查结果
    if (fs.existsSync(zipFilePath)) {
        const zipStats = fs.statSync(zipFilePath);
        const zipSizeMB = (zipStats.size / 1024 / 1024).toFixed(2);

        console.log(`\n✅ 发布包创建成功！`);
        console.log(`📁 文件路径: ${zipFilePath}`);
        console.log(`📊 文件大小: ${zipSizeMB}MB`);

        // 清理临时文件
        fs.rmSync(tempDir, { recursive: true });
        console.log('\n🧹 临时文件已清理');

        console.log('\n🚀 下一步: 上传到Chrome Web Store!');
    } else {
        throw new Error('ZIP文件创建失败');
    }

} catch (error) {
    console.error('❌ 打包失败:', error.message);
    process.exit(1);
}