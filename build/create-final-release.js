const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

class ReleasePackager {
    constructor() {
        this.rootDir = path.resolve(__dirname, '..');
        this.releaseDir = path.join(__dirname, 'release');
        this.packageName = 'mowen-note-assistant';

        // 读取版本号
        const manifest = JSON.parse(fs.readFileSync(path.join(this.rootDir, 'manifest.json'), 'utf8'));
        this.version = manifest.version;

        console.log(`📦 准备打包 ${manifest.name} v${this.version}`);

        // 安全配置
        this.securityConfig = {
            // 需要检查的敏感信息模式
            sensitivePatterns: [
                /sk-[a-zA-Z0-9]{48}/g, // OpenAI API keys
                /pk_[a-zA-Z0-9]{24}/g, // 其他API keys
                /AKIA[0-9A-Z]{16}/g, // AWS Access Key
                /AIza[0-9A-Za-z-_]{35}/g, // Google API Key
                /ya29\.[0-9A-Za-z\-_]+/g, // Google OAuth
                /[0-9a-f]{32}/g, // MD5 hashes (可能是密钥)
                /password\s*[:=]\s*['"][^'"]+['"]/gi,
                /api_key\s*[:=]\s*['"][^'"]+['"]/gi,
                /secret\s*[:=]\s*['"][^'"]+['"]/gi,
                /token\s*[:=]\s*['"][^'"]+['"]/gi,
            ],

            // 需要清理的开发相关内容
            developmentPatterns: [
                /console\.log\([^)]*\)/g,
                /console\.warn\([^)]*\)/g,
                /console\.error\([^)]*\)/g,
                /console\.debug\([^)]*\)/g,
                /debugger;?/g,
                /\/\/ TODO[^\n]*/g,
                /\/\/ FIXME[^\n]*/g,
                /\/\/ DEBUG[^\n]*/g,
            ],

            // 允许保留的console语句（用于正常错误处理）
            allowedConsole: [
                'console.error(', // 错误处理可以保留
            ]
        };
    }

    // 需要包含的文件列表
    getRequiredFiles() {
        return [
            // 核心文件
            'manifest.json',
            'background.js',
            'content.js',

            // 用户界面
            'popup.html',
            'popup.js',
            'popup.css',
            'sidepanel.html',
            'sidepanel.js',
            'sidepanel.css',
            'options.html',
            'options.js',
            'options.css',

            // 文档
            'README.md',
            'PRIVACY_POLICY.md',

            // 图标目录
            'icons/'
        ];
    }

    // 检查必需文件是否存在
    checkRequiredFiles() {
        const missing = [];
        const requiredFiles = this.getRequiredFiles();

        for (const file of requiredFiles) {
            const filePath = path.join(this.rootDir, file);
            if (!fs.existsSync(filePath)) {
                missing.push(file);
            }
        }

        if (missing.length > 0) {
            throw new Error(`缺少必需文件: ${missing.join(', ')}`);
        }

        console.log('✅ 所有必需文件检查完成');
    }

    // 安全检查：扫描敏感信息
    performSecurityScan() {
        console.log('🔒 执行安全扫描...');

        const jsFiles = ['background.js', 'content.js', 'popup.js', 'sidepanel.js', 'options.js'];
        const securityIssues = [];

        for (const jsFile of jsFiles) {
            const filePath = path.join(this.rootDir, jsFile);
            const content = fs.readFileSync(filePath, 'utf8');

            // 检查敏感信息
            for (const pattern of this.securityConfig.sensitivePatterns) {
                const matches = content.match(pattern);
                if (matches) {
                    securityIssues.push({
                        file: jsFile,
                        type: 'sensitive_data',
                        matches: matches,
                        description: '检测到可能的敏感信息'
                    });
                }
            }

            // 检查硬编码的URL和配置
            const hardcodedUrls = content.match(/https?:\/\/[^\s'"]+/g);
            if (hardcodedUrls) {
                const suspiciousUrls = hardcodedUrls.filter(url =>
                    !url.includes('chrome.google.com') &&
                    !url.includes('open.mowen.cn') &&
                    !url.includes('github.com') &&
                    !url.includes('example.com')
                );

                if (suspiciousUrls.length > 0) {
                    securityIssues.push({
                        file: jsFile,
                        type: 'hardcoded_url',
                        matches: suspiciousUrls,
                        description: '发现硬编码的URL'
                    });
                }
            }
        }

        if (securityIssues.length > 0) {
            console.warn('⚠️  发现安全问题:');
            securityIssues.forEach(issue => {
                console.warn(`  ${issue.file}: ${issue.description}`);
                console.warn(`    ${issue.matches.join(', ')}`);
            });

            // 询问是否继续（在实际使用中可能需要手动确认）
            console.warn('请手动检查上述问题是否为误报，或是否需要处理');
        } else {
            console.log('✅ 安全扫描通过');
        }

        return securityIssues;
    }

    // 验证文件内容
    validateFiles() {
        console.log('🔍 验证文件内容...');

        // 检查manifest.json
        const manifest = JSON.parse(fs.readFileSync(path.join(this.rootDir, 'manifest.json'), 'utf8'));
        if (!manifest.name || !manifest.version || !manifest.description) {
            throw new Error('manifest.json 缺少必要字段');
        }

        // 验证权限是否合理
        const permissions = manifest.permissions || [];
        const sensitivePermissions = ['<all_urls>', 'tabs', 'history', 'bookmarks'];
        const foundSensitivePerms = permissions.filter(p => sensitivePermissions.includes(p));

        if (foundSensitivePerms.length > 0) {
            console.warn(`⚠️  使用了敏感权限: ${foundSensitivePerms.join(', ')}`);
        }

        // 检查JavaScript文件语法
        const jsFiles = ['background.js', 'content.js', 'popup.js', 'sidepanel.js', 'options.js'];
        for (const jsFile of jsFiles) {
            try {
                const content = fs.readFileSync(path.join(this.rootDir, jsFile), 'utf8');

                // 检查是否有明显的语法错误
                if (content.includes('`);') || content.includes('```')) {
                    console.warn(`⚠️  ${jsFile} 可能包含格式错误`);
                }

                // 检查是否有eval或Function构造器（安全风险）
                if (content.includes('eval(') || content.includes('new Function(')) {
                    throw new Error(`${jsFile} 包含潜在不安全的代码: eval 或 Function 构造器`);
                }

            } catch (error) {
                throw new Error(`无法读取 ${jsFile}: ${error.message}`);
            }
        }

        console.log('✅ 文件内容验证完成');
    }

    // 清理开发代码
    cleanDevelopmentCode(content, filename) {
        // 为了彻底避免语法错误，我们使用极度保守的清理策略
        // 只移除非常安全的内容

        let cleaned = content;

        // 1. 移除独立的debugger语句（安全）
        cleaned = cleaned.replace(/^\s*debugger\s*;?\s*$/gm, '');

        // 2. 移除单行的TODO/FIXME/DEBUG注释（安全）
        cleaned = cleaned.replace(/^\s*\/\/\s*(TODO|FIXME|DEBUG)[\s\S]*?$/gm, '');

        // 3. 移除多余的连续空行（美化）
        cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n');

        // 注意：我们完全跳过所有console语句的清理
        // 这样确保打包的代码100%能正常运行，不会有任何语法错误
        // 在生产环境中，console语句不会对性能产生明显影响

        console.log(`文件 ${filename} 清理完成，保留所有console语句确保语法正确`);

        return cleaned;
    }

    // 创建发布目录
    createReleaseDirectory() {
        if (fs.existsSync(this.releaseDir)) {
            fs.rmSync(this.releaseDir, { recursive: true, force: true });
        }
        fs.mkdirSync(this.releaseDir, { recursive: true });
        console.log('📁 创建发布目录');
    }

    // 复制文件到发布目录
    copyFiles() {
        console.log('📄 复制并清理文件...');
        const stagingDir = path.join(this.releaseDir, 'staging');
        fs.mkdirSync(stagingDir, { recursive: true });

        const requiredFiles = this.getRequiredFiles();
        const jsFiles = ['.js'];

        for (const file of requiredFiles) {
            const sourcePath = path.join(this.rootDir, file);
            const targetPath = path.join(stagingDir, file);

            if (file.endsWith('/')) {
                // 目录
                this.copyDirectory(sourcePath, targetPath);
            } else {
                // 文件
                const targetDir = path.dirname(targetPath);
                if (!fs.existsSync(targetDir)) {
                    fs.mkdirSync(targetDir, { recursive: true });
                }

                // 对JS文件进行清理
                if (jsFiles.some(ext => file.endsWith(ext))) {
                    const content = fs.readFileSync(sourcePath, 'utf8');
                    const cleanedContent = this.cleanDevelopmentCode(content, file);
                    fs.writeFileSync(targetPath, cleanedContent, 'utf8');
                    console.log(`  ✓ ${file} (已清理)`);
                } else {
                    fs.copyFileSync(sourcePath, targetPath);
                    console.log(`  ✓ ${file}`);
                }
            }
        }

        console.log('✅ 文件复制和清理完成');
        return stagingDir;
    }

    // 复制目录
    copyDirectory(source, target) {
        if (!fs.existsSync(target)) {
            fs.mkdirSync(target, { recursive: true });
        }

        const items = fs.readdirSync(source);
        for (const item of items) {
            const sourcePath = path.join(source, item);
            const targetPath = path.join(target, item);

            if (fs.statSync(sourcePath).isDirectory()) {
                this.copyDirectory(sourcePath, targetPath);
            } else {
                fs.copyFileSync(sourcePath, targetPath);
            }
        }
    }

    // 创建zip包
    async createZipPackage(stagingDir) {
        console.log('📦 创建ZIP包...');

        const zipName = `${this.packageName}-v${this.version}.zip`;
        const zipPath = path.join(this.releaseDir, zipName);

        return new Promise((resolve, reject) => {
            const output = fs.createWriteStream(zipPath);
            const archive = archiver('zip', { zlib: { level: 9 } });

            output.on('close', () => {
                const sizeKB = Math.round(archive.pointer() / 1024);
                console.log(`✅ ZIP包创建完成: ${zipName} (${sizeKB}KB)`);
                resolve(zipPath);
            });

            archive.on('error', reject);
            archive.pipe(output);

            // 添加staging目录中的所有文件
            archive.directory(stagingDir, false);
            archive.finalize();
        });
    }

    // 生成发布报告
    generateReleaseReport(zipPath, securityIssues) {
            const stats = fs.statSync(zipPath);
            const report = {
                packageName: this.packageName,
                version: this.version,
                buildDate: new Date().toISOString(),
                zipFile: path.basename(zipPath),
                sizeBytes: stats.size,
                sizeKB: Math.round(stats.size / 1024),
                files: this.getRequiredFiles(),
                security: {
                    scanPerformed: true,
                    issuesFound: securityIssues.length,
                    issues: securityIssues,
                    codeCleaningApplied: true
                },
                buildInfo: {
                    platform: process.platform,
                    nodeVersion: process.version,
                    timestamp: Date.now()
                }
            };

            const reportPath = path.join(this.releaseDir, 'release-report.json');
            fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

            console.log('\n📋 发布报告:');
            console.log(`  包名: ${report.packageName}`);
            console.log(`  版本: ${report.version}`);
            console.log(`  文件: ${report.zipFile}`);
            console.log(`  大小: ${report.sizeKB}KB`);
            console.log(`  文件数: ${report.files.length}`);
            console.log(`  安全扫描: ${securityIssues.length === 0 ? '✅ 通过' : `⚠️  发现${securityIssues.length}个问题`}`);
        console.log(`  代码清理: ✅ 已应用`);
        console.log(`  构建时间: ${new Date(report.buildDate).toLocaleString()}`);
        
        return report;
    }

    // 清理临时文件
    cleanup() {
        const stagingDir = path.join(this.releaseDir, 'staging');
        if (fs.existsSync(stagingDir)) {
            fs.rmSync(stagingDir, { recursive: true, force: true });
        }
        console.log('🧹 清理临时文件完成');
    }

    // 主要打包流程
    async build() {
        try {
            console.log('🚀 开始构建安全发布包...\n');
            
            // 检查文件
            this.checkRequiredFiles();
            this.validateFiles();
            
            // 安全扫描
            const securityIssues = this.performSecurityScan();
            
            // 准备发布
            this.createReleaseDirectory();
            const stagingDir = this.copyFiles();
            
            // 创建包
            const zipPath = await this.createZipPackage(stagingDir);
            
            // 生成报告
            const report = this.generateReleaseReport(zipPath, securityIssues);
            
            // 清理
            this.cleanup();
            
            console.log('\n🎉 安全发布包构建完成!');
            console.log(`📦 文件位置: ${zipPath}`);
            
            if (securityIssues.length > 0) {
                console.log('\n⚠️  安全提醒:');
                console.log('发现了一些潜在的安全问题，请在发布前仔细检查。');
                console.log('详细信息请查看 release-report.json 文件。');
            }
            
            console.log('\n📝 下一步:');
            console.log('1. 检查生成的ZIP文件');
            console.log('2. 查看安全报告 (release-report.json)');
            console.log('3. 访问 https://chrome.google.com/webstore/devconsole/');
            console.log('4. 上传ZIP文件到Chrome扩展商店');
            
            return {
                success: true,
                zipPath,
                report,
                securityIssues
            };
            
        } catch (error) {
            console.error('❌ 构建失败:', error.message);
            
            // 如果出错，尝试清理
            try {
                this.cleanup();
            } catch (cleanupError) {
                console.error('清理失败:', cleanupError.message);
            }
            
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// 执行构建
async function main() {
    const packager = new ReleasePackager();
    const result = await packager.build();
    
    if (!result.success) {
        process.exit(1);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    main().catch(console.error);
}

module.exports = ReleasePackager;