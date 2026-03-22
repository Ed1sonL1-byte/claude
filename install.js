#!/usr/bin/env node

/**
 * 🔥 Token Flame - 自动安装脚本
 * 将 statusline 配置写入 ~/.claude/settings.json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude');
const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json');
const STATUSLINE_SCRIPT = path.join(__dirname, 'src', 'statusline.js');

function install() {
  console.log('\n🔥 Token Flame - 安装中...\n');

  // 确保 .claude 目录存在
  if (!fs.existsSync(CLAUDE_DIR)) {
    fs.mkdirSync(CLAUDE_DIR, { recursive: true });
  }

  // 读取现有 settings.json
  let settings = {};
  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    } catch (e) {
      console.log('⚠️  无法解析现有 settings.json，将创建新配置');
    }
  }

  // 备份旧的 statusLine 配置
  if (settings.statusLine) {
    settings._tokenFlameBackup_statusLine = settings.statusLine;
    console.log('📦 已备份原有 statusLine 配置');
  }

  // 写入新的 statusLine 配置
  settings.statusLine = {
    type: 'command',
    command: `node "${STATUSLINE_SCRIPT}"`,
    padding: 0,
  };

  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));

  console.log('✅ 已写入 Claude Code 配置');
  console.log(`   📄 ${SETTINGS_FILE}`);
  console.log('');
  console.log('🎉 安装完成！重启 Claude Code 即可看到状态栏');
  console.log('');
  console.log('   状态栏效果预览:');
  console.log('   \x1b[91m[Sonnet 4]\x1b[0m \x1b[93m会话 $2.45\x1b[0m \x1b[38;5;208m🔥128 tok/s\x1b[0m \x1b[90m|\x1b[0m \x1b[38;5;208m今日 $15.30\x1b[0m \x1b[90m|\x1b[0m \x1b[95m本周 $89.50\x1b[0m \x1b[90m|\x1b[0m \x1b[90m总计 $469.90\x1b[0m');
  console.log('');
  console.log('   卸载: npm uninstall -g @exbyte/token-flame');
  console.log('');
}

install();
