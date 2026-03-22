#!/usr/bin/env node

/**
 * Token Flame - Auto-install script
 * Copies scripts and configures ~/.claude/settings.json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude');
const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json');
const SCRIPTS_DIR = path.join(CLAUDE_DIR, 'scripts');
const CACHE_DIR = path.join(CLAUDE_DIR, 'cache');
const COMMANDS_DIR = path.join(CLAUDE_DIR, 'commands');

const SRC_STATUSLINE = path.join(__dirname, 'src', 'statusline.js');
const SRC_HISTORY = path.join(__dirname, 'src', 'token-history.js');
const SRC_COMMANDS_DIR = path.join(__dirname, 'src', 'commands');

const DST_STATUSLINE = path.join(CLAUDE_DIR, 'statusline.js');
const DST_HISTORY = path.join(SCRIPTS_DIR, 'token-flame-history.js');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function copyFile(src, dst) {
  fs.copyFileSync(src, dst);
  // Make executable on non-Windows
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(dst, 0o755);
    } catch (e) { /* ignore */ }
  }
}

function install() {
  console.log('\n\u{1F525} Token Flame - \u5B89\u88C5\u4E2D...\n');

  // Create directories
  ensureDir(CLAUDE_DIR);
  ensureDir(SCRIPTS_DIR);
  ensureDir(CACHE_DIR);
  ensureDir(COMMANDS_DIR);

  // Copy statusline.js
  try {
    copyFile(SRC_STATUSLINE, DST_STATUSLINE);
    console.log(`\u2705 \u5DF2\u590D\u5236 statusline.js \u2192 ${DST_STATUSLINE}`);
  } catch (e) {
    console.log(`\u26A0\u{FE0F}  \u590D\u5236 statusline.js \u5931\u8D25: ${e.message}`);
  }

  // Copy token-history.js
  try {
    copyFile(SRC_HISTORY, DST_HISTORY);
    console.log(`\u2705 \u5DF2\u590D\u5236 token-history.js \u2192 ${DST_HISTORY}`);
  } catch (e) {
    console.log(`\u26A0\u{FE0F}  \u590D\u5236 token-history.js \u5931\u8D25: ${e.message}`);
  }

  // Copy command files
  const commandFiles = [
    'burn-your-money.md',
    'burn-your-money-stats.md',
    'burn-your-money-export.md',
    'burn-your-money-uninstall.md',
  ];

  for (const cmdFile of commandFiles) {
    try {
      const src = path.join(SRC_COMMANDS_DIR, cmdFile);
      const dst = path.join(COMMANDS_DIR, cmdFile);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dst);
        console.log(`\u2705 \u5DF2\u590D\u5236\u547D\u4EE4 ${cmdFile}`);
      }
    } catch (e) {
      console.log(`\u26A0\u{FE0F}  \u590D\u5236\u547D\u4EE4 ${cmdFile} \u5931\u8D25: ${e.message}`);
    }
  }

  // Read existing settings.json
  let settings = {};
  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    } catch (e) {
      console.log('\u26A0\u{FE0F}  \u65E0\u6CD5\u89E3\u6790\u73B0\u6709 settings.json\uFF0C\u5C06\u521B\u5EFA\u65B0\u914D\u7F6E');
    }
  }

  // Backup old statusLine config
  if (settings.statusLine) {
    settings._tokenFlameBackup_statusLine = settings.statusLine;
    console.log('\u{1F4E6} \u5DF2\u5907\u4EFD\u539F\u6709 statusLine \u914D\u7F6E');
  }

  // Write new statusLine config using process.execPath for Node.js path
  const nodePath = process.execPath;
  settings.statusLine = {
    type: 'command',
    command: `"${nodePath}" "${DST_STATUSLINE}"`,
    padding: 0,
  };

  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));

  console.log('\u2705 \u5DF2\u5199\u5165 Claude Code \u914D\u7F6E');
  console.log(`   \u{1F4C4} ${SETTINGS_FILE}`);
  console.log('');
  console.log('\u{1F389} \u5B89\u88C5\u5B8C\u6210\uFF01\u91CD\u542F Claude Code \u5373\u53EF\u770B\u5230\u72B6\u6001\u680F');
  console.log('');
  console.log('   \u72B6\u6001\u680F\u6548\u679C\u9884\u89C8:');
  console.log('   \x1b[91m[Sonnet 4]\x1b[0m \x1b[93m\u4F1A\u8BDD $2.45\x1b[0m \x1b[38;5;208m\u{1F525}128 tok/s\x1b[0m \x1b[90m|\x1b[0m \x1b[38;5;208m\u4ECA\u65E5 $15.30\x1b[0m \x1b[90m|\x1b[0m \x1b[95m\u672C\u5468 $89.50\x1b[0m \x1b[90m|\x1b[0m \x1b[90m\u603B\u8BA1 $469.90\x1b[0m');
  console.log('');
  console.log('   \u{1F4DD} Slash \u547D\u4EE4:');
  console.log('     /burn-your-money          - \u67E5\u770B\u8BE6\u7EC6\u8D26\u5355');
  console.log('     /burn-your-money-stats     - \u67E5\u770B 7 \u65E5\u8D8B\u52BF\u56FE');
  console.log('     /burn-your-money-export    - \u5BFC\u51FA CSV \u6570\u636E');
  console.log('     /burn-your-money-uninstall - \u5378\u8F7D\u63D2\u4EF6');
  console.log('');
  console.log('   \u2699\u{FE0F}  \u914D\u7F6E\u6587\u4EF6: ~/.claude/token-flame-config.json');
  console.log('');
  console.log('   \u5378\u8F7D: npm uninstall -g @exbyte/token-flame');
  console.log('');
}

install();
