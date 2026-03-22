#!/usr/bin/env node

/**
 * 🔥 Token Flame - 卸载脚本
 * 从 ~/.claude/settings.json 移除 statusLine 配置
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude');
const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json');
const STATS_FILE = path.join(CLAUDE_DIR, 'token-flame-stats.json');

function uninstall() {
  console.log('\n🔥 Token Flame - 卸载中...\n');

  // 清理 settings.json 中的 statusLine
  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
      
      // 恢复备份的 statusLine 配置
      if (settings._tokenFlameBackup_statusLine) {
        settings.statusLine = settings._tokenFlameBackup_statusLine;
        delete settings._tokenFlameBackup_statusLine;
        console.log('📦 已恢复原有 statusLine 配置');
      } else {
        delete settings.statusLine;
        console.log('🗑️  已移除 statusLine 配置');
      }

      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    } catch (e) {
      console.log('⚠️  无法更新 settings.json，请手动移除 statusLine 字段');
    }
  }

  // 清理缓存文件
  if (fs.existsSync(STATS_FILE)) {
    fs.unlinkSync(STATS_FILE);
    console.log('🗑️  已删除缓存文件');
  }

  console.log('');
  console.log('✅ 卸载完成！重启 Claude Code 后状态栏将消失');
  console.log('');
}

uninstall();
