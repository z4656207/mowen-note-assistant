#!/usr/bin/env node

/**
 * Chrome扩展一键发布脚本
 * 功能：整合发布准备和打包流程，提供完整的发布解决方案
 * 作者：墨问笔记助手团队
 */

const fs = require('fs');
const path = require('path');
const { main: prepareBuild } = require('./prepare-release');
const { main: createPackage } = require('./create-release-package');

console.log('🚀 墨问笔记助手 - 一键发布工具');
console.log('━'.repeat(80));

/**
 * 检查发布前置条件
 */
function checkPrerequisites() {
    console.log('🔍 检查发布前置条件...\n');

    const checks = [{
            name: '检查manifest.json是否存在',
            test: () => fs.existsSync('manifest.json'),
            error: 'manifest.json文件不存在'
        },
        {
            name: '检查核心文件是否完整',
            test: () => {
                const requiredFiles = [
                    'background.js', 'content.js', 'popup.html',
                    'popup.js', 'popup.css', 'options.html',
                    'options.js', 'sidepanel.html', 'sidepanel.js'
                ];
                return requiredFiles.every(file => fs.existsSync(file));
            },
            error: '核心文件不完整'
        },
        {
            name: '检查图标文件是否存在',
            test: () => {
                const iconFiles = ['icons/icon16.png', 'icons/icon48.png', 'icons/icon128.png'];
                return iconFiles.every(file => fs.existsSync(file));
            },
            error: '图标文件不完整'
        },
        {
            name: '检查版本号格式',
            test: () => {
                try {
                    const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
                    return /^\d+\.\d+\.\d+$/.test(manifest.version);
                } catch {
                    return false;
                }
            },
            error: '版本号格式不正确（应为 x.y.z 格式）'
        }
    ];

    let allPassed = true;

    checks.forEach((check, index) => {
        process.stdout.write(`${index + 1}. ${check.name}... `);

        if (check.test()) {
            console.log('✅ 通过');
        } else {
            console.log('❌ 失败');
            console.error(`   错误: ${check.error}`);
            allPassed = false;
        }
    });

    console.log('');

    if (!allPassed) {
        console.error('❌ 前置条件检查失败，请解决上述问题后重试');
        process.exit(1);
    }

    console.log('✅ 所有前置条件检查通过\n');
}

/**
 * 显示发布信息
 */
function showReleaseInfo() {
    try {
        const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));

        console.log('📋 发布信息确认');
        console.log('━'.repeat(50));
        console.log(`扩展名称: ${manifest.name}`);
        console.log(`版本号: ${manifest.version}`);
        console.log(`描述: ${manifest.description}`);
        console.log(`清单版本: ${manifest.manifest_version}`);
        console.log('━'.repeat(50));
        console.log('');

        return manifest;
    } catch (error) {
        console.error('❌ 无法读取manifest.json:', error.message);
        process.exit(1);
    }
}

/**
 * 确认发布意图
 */
function confirmPublish() {
    return new Promise((resolve) => {
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question('✋ 确认要开始发布流程吗？这将：\n   • 清理调试代码\n   • 创建发布包\n   • 准备上传到Chrome Web Store\n\n继续？(y/N): ', (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        });
    });
}

/**
 * 显示发布后指导
 */
function showPostReleaseGuide(packagePath) {
    console.log('\n🎉 发布包准备完成！');
    console.log('━'.repeat(80));
    console.log();
    console.log('📦 发布包位置:');
    console.log(`   ${packagePath}`);
    console.log();
    console.log('🚀 下一步操作指南:');
    console.log('   1. 访问 Chrome Web Store 开发者控制台');
    console.log('      https://chrome.google.com/webstore/devconsole');
    console.log();
    console.log('   2. 点击"添加新项"并上传ZIP文件');
    console.log();
    console.log('   3. 填写商店信息（参考 CHROME_STORE_PUBLISH_GUIDE.md）');
    console.log('      • 应用名称：墨问笔记助手');
    console.log('      • 类别：生产力工具');
    console.log('      • 语言：中文（简体）');
    console.log();
    console.log('   4. 上传宣传素材');
    console.log('      • 需要准备 1280x800, 640x400, 440x280 规格的图片');
    console.log();
    console.log('   5. 设置隐私政策链接');
    console.log('      • 可以将 PRIVACY_POLICY.md 托管到 GitHub Pages');
    console.log();
    console.log('   6. 提交审核');
    console.log('      • 通常需要 3-7 个工作日');
    console.log();
    console.log('📖 详细发布指南: CHROME_STORE_PUBLISH_GUIDE.md');
    console.log('🔒 隐私政策文档: PRIVACY_POLICY.md');
    console.log();
    console.log('💡 提示：');
    console.log('   • 首次发布需要支付5美元注册费');
    console.log('   • 确保所有信息准确无误以提高审核通过率');
    console.log('   • 审核期间可通过开发者控制台查看状态');
    console.log();
    console.log('━'.repeat(80));
    console.log('祝您发布成功！🎊');
}

/**
 * 生成发布检查清单
 */
function generateReleaseChecklist(manifest) {
    const checklist = {
        metadata: {
            generated: new Date().toISOString(),
            version: manifest.version,
            name: manifest.name
        },
        preSubmission: [
            '✅ 扩展包已生成',
            '⏳ 注册Chrome Web Store开发者账户',
            '⏳ 准备宣传图片 (1280x800, 640x400, 440x280)',
            '⏳ 设置隐私政策链接',
            '⏳ 准备应用描述文案',
            '⏳ 测试扩展功能'
        ],
        submission: [
            '⏳ 访问开发者控制台',
            '⏳ 上传ZIP文件',
            '⏳ 填写基本信息',
            '⏳ 上传宣传素材',
            '⏳ 设置分类和语言',
            '⏳ 配置隐私设置',
            '⏳ 提交审核'
        ],
        postSubmission: [
            '⏳ 监控审核状态',
            '⏳ 回复审核意见（如有）',
            '⏳ 准备发布后推广',
            '⏳ 设置用户反馈收集'
        ],
        links: {
            developerConsole: 'https://chrome.google.com/webstore/devconsole',
            publishGuide: './CHROME_STORE_PUBLISH_GUIDE.md',
            privacyPolicy: './PRIVACY_POLICY.md'
        }
    };

    const checklistPath = 'build/release-checklist.json';
    fs.writeFileSync(checklistPath, JSON.stringify(checklist, null, 2));
    console.log(`📋 发布检查清单已生成: ${checklistPath}`);

    return checklist;
}

/**
 * 主执行流程
 */
async function main() {
    try {
        // 步骤1: 检查前置条件
        checkPrerequisites();

        // 步骤2: 显示发布信息
        const manifest = showReleaseInfo();

        // 步骤3: 确认发布意图
        const confirmed = await confirmPublish();
        if (!confirmed) {
            console.log('📝 发布已取消');
            process.exit(0);
        }

        console.log('\n🚀 开始发布流程...\n');

        // 步骤4: 运行发布准备
        console.log('第1步: 准备发布环境');
        await prepareBuild();

        console.log('\n');

        // 步骤5: 创建发布包
        console.log('第2步: 创建发布包');
        await createPackage();

        // 步骤6: 生成检查清单
        console.log('\n第3步: 生成发布清单');
        generateReleaseChecklist(manifest);

        // 步骤7: 显示发布后指导
        const packagePath = path.join('build', 'release', `mowen-chrome-extension-v${manifest.version}.zip`);
        showPostReleaseGuide(packagePath);

    } catch (error) {
        console.error('\n❌ 发布流程失败:', error.message);
        console.error('\n🔧 解决建议:');
        console.error('   1. 检查所有必要文件是否存在');
        console.error('   2. 确保manifest.json格式正确');
        console.error('   3. 验证文件权限设置');
        console.error('   4. 尝试手动运行单独的脚本进行调试');
        console.error('');
        console.error('🆘 需要帮助？查看发布指南或提交Issue');
        process.exit(1);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    main();
}

module.exports = { main };