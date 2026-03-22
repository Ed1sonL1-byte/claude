#!/usr/bin/env node

/**
 * Token Flame - Uninstall script
 * Removes all Token Flame files and restores settings.json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude');
const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json');
const CACHE_DIR = path.join(CLAUDE_DIR, 'cache');

function safeUnlink(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`\u{1F5D1}\u{FE0F}  \u5DF2\u5220\u9664 ${path.basename(filePath)}`);
    }
  } catch (e) { /* ignore */ }
}

function uninstall() {
  console.log('\n\u{1F525} Token Flame - \u5378\u8F7D\u4E2D...\n');

  // Clean settings.json statusLine
  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));

      // Restore backed-up statusLine config
      if (settings._tokenFlameBackup_statusLine) {
        settings.statusLine = settings._tokenFlameBackup_statusLine;
        delete settings._tokenFlameBackup_statusLine;
        console.log('\u{1F4E6} \u5DF2\u6062\u590D\u539F\u6709 statusLine \u914D\u7F6E');
      } else {
        delete settings.statusLine;
        console.log('\u{1F5D1}\u{FE0F}  \u5DF2\u79FB\u9664 statusLine \u914D\u7F6E');
      }

      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    } catch (e) {
      console.log('\u26A0\u{FE0F}  \u65E0\u6CD5\u66F4\u65B0 settings.json\uFF0C\u8BF7\u624B\u52A8\u79FB\u9664 statusLine \u5B57\u6BB5');
    }
  }

  // Remove installed files
  const filesToRemove = [
    // Main statusline
    path.join(CLAUDE_DIR, 'statusline.js'),
    // History script
    path.join(CLAUDE_DIR, 'scripts', 'token-flame-history.js'),
    // Command files
    path.join(CLAUDE_DIR, 'commands', 'burn-your-money.md'),
    path.join(CLAUDE_DIR, 'commands', 'burn-your-money-stats.md'),
    path.join(CLAUDE_DIR, 'commands', 'burn-your-money-export.md'),
    path.join(CLAUDE_DIR, 'commands', 'burn-your-money-uninstall.md'),
    // Cache and config files
    path.join(CLAUDE_DIR, 'token-flame-stats.json'),
    path.join(CACHE_DIR, 'token-flame-session.json'),
    path.join(CACHE_DIR, 'token-flame-today.json'),
    path.join(CACHE_DIR, 'token-flame-history.json'),
    path.join(CLAUDE_DIR, 'token-flame-config.json'),
  ];

  for (const filePath of filesToRemove) {
    safeUnlink(filePath);
  }

  console.log('');
  console.log('\u2705 \u5378\u8F7D\u5B8C\u6210\uFF01\u91CD\u542F Claude Code \u540E\u72B6\u6001\u680F\u5C06\u6D88\u5931');
  console.log('');
}

uninstall();
