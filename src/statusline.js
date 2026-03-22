#!/usr/bin/env node

/**
 * 🔥 Token Flame - Claude Code 状态栏烧钱监控
 * 
 * 显示: [模型] 会话 $X.XX 🔥XXX tok/s | 今日 $X.XX | 本周 $X.XX | 总计 $X.XX
 * 
 * 数据来源:
 * - 当前会话: Claude Code statusline API (stdin JSON)
 * - 历史统计: 扫描 ~/.claude/projects/ 下的 JSONL 文件
 * - 持久化缓存: ~/.claude/token-flame-stats.json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

// ============ 颜色定义 (ANSI) ============
const C = {
  red:     '\x1b[31m',
  bred:    '\x1b[91m',  // bright red
  yellow:  '\x1b[33m',
  byellow: '\x1b[93m',  // bright yellow
  green:   '\x1b[32m',
  bgreen:  '\x1b[92m',
  cyan:    '\x1b[36m',
  magenta: '\x1b[35m',
  bmagenta:'\x1b[95m',
  gray:    '\x1b[90m',
  white:   '\x1b[37m',
  bold:    '\x1b[1m',
  reset:   '\x1b[0m',
  orange:  '\x1b[38;5;208m',  // 256-color orange
  fire:    '\x1b[38;5;196m',  // 256-color fire red
};

// ============ 价格配置 (USD per million tokens) ============
const PRICING = {
  // Claude 4.x / Sonnet 4.x
  'default': { input: 3, output: 15, cacheRead: 0.3 },
  // Opus 系列
  'opus':    { input: 15, output: 75, cacheRead: 1.5 },
  // Haiku 系列
  'haiku':   { input: 0.25, output: 1.25, cacheRead: 0.025 },
};

// ============ 路径配置 ============
const HOME = os.homedir();
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude');
const STATS_FILE = path.join(CLAUDE_DIR, 'token-flame-stats.json');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');

// ============ 工具函数 ============

function getPricing(modelName) {
  const name = (modelName || '').toLowerCase();
  if (name.includes('opus')) return PRICING.opus;
  if (name.includes('haiku')) return PRICING.haiku;
  return PRICING.default;
}

function calcCost(tokens, pricing) {
  const input = (tokens.input || 0) * pricing.input / 1_000_000;
  const output = (tokens.output || 0) * pricing.output / 1_000_000;
  const cacheRead = (tokens.cacheRead || 0) * pricing.cacheRead / 1_000_000;
  return input + output + cacheRead;
}

function formatCost(cost) {
  if (cost >= 100) return `$${cost.toFixed(0)}`;
  if (cost >= 10) return `$${cost.toFixed(1)}`;
  return `$${cost.toFixed(2)}`;
}

function formatTokens(count) {
  if (count >= 1_000_000_000) return `${(count / 1_000_000_000).toFixed(1)}B`;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return `${count}`;
}

function getWeekStart() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(now.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().split('T')[0];
}

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

// ============ 历史统计：扫描 JSONL 文件 ============

function scanProjectsForHistory() {
  const stats = { daily: {}, totalCost: 0, totalTokens: 0 };
  
  if (!fs.existsSync(PROJECTS_DIR)) return stats;

  try {
    const projects = fs.readdirSync(PROJECTS_DIR);
    for (const proj of projects) {
      const projPath = path.join(PROJECTS_DIR, proj);
      if (!fs.statSync(projPath).isDirectory()) continue;

      const files = fs.readdirSync(projPath).filter(f => f.endsWith('.jsonl'));
      for (const file of files) {
        const filePath = path.join(projPath, file);
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const lines = content.split('\n').filter(l => l.trim());
          
          for (const line of lines) {
            try {
              const entry = JSON.parse(line);
              if (entry.type !== 'assistant' || !entry.costUSD) continue;
              
              const ts = entry.timestamp || entry.createdAt;
              if (!ts) continue;
              
              const day = new Date(ts).toISOString().split('T')[0];
              if (!stats.daily[day]) stats.daily[day] = 0;
              stats.daily[day] += entry.costUSD;
              stats.totalCost += entry.costUSD;
              
              // Token 统计
              if (entry.usage) {
                stats.totalTokens += (entry.usage.input_tokens || 0);
                stats.totalTokens += (entry.usage.output_tokens || 0);
                stats.totalTokens += (entry.usage.cache_read_input_tokens || 0);
              }
            } catch (e) { /* skip malformed line */ }
          }
        } catch (e) { /* skip unreadable file */ }
      }
    }
  } catch (e) { /* skip errors */ }
  
  return stats;
}

// ============ 缓存管理 ============

function loadCache() {
  try {
    if (fs.existsSync(STATS_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
      // 缓存超过 5 分钟则刷新历史数据
      if (data._ts && (Date.now() - data._ts) < 5 * 60 * 1000) {
        return data;
      }
    }
  } catch (e) { /* ignore */ }
  return null;
}

function saveCache(data) {
  try {
    data._ts = Date.now();
    fs.writeFileSync(STATS_FILE, JSON.stringify(data, null, 2));
  } catch (e) { /* ignore */ }
}

function getHistoryStats() {
  const cached = loadCache();
  if (cached && cached.daily) return cached;
  
  const stats = scanProjectsForHistory();
  saveCache(stats);
  return stats;
}

// ============ 从 Claude Code statusline API (stdin) 获取数据 ============

function getSessionDataFromStdin(jsonStr) {
  try {
    const data = JSON.parse(jsonStr);
    
    const model = data.model?.display_name || data.model?.name || 'Claude';
    const sessionCost = data.session?.cost_usd || data.total_cost_usd || 0;
    
    const inputTokens = data.current_usage?.input_tokens || data.total_input_tokens || 0;
    const outputTokens = data.current_usage?.output_tokens || data.total_output_tokens || 0;
    const cacheReadTokens = data.current_usage?.cache_read_input_tokens || 0;
    const cacheWriteTokens = data.current_usage?.cache_creation_input_tokens || 0;
    
    const totalSessionTokens = inputTokens + outputTokens + cacheReadTokens;
    
    // 如果 API 没给 cost，用 token 计算
    const pricing = getPricing(model);
    const calcSessionCost = sessionCost > 0 ? sessionCost : calcCost(
      { input: inputTokens + cacheWriteTokens, output: outputTokens, cacheRead: cacheReadTokens },
      pricing
    );
    
    // Context 信息
    const contextPct = data.context_window?.used_percentage || 0;
    
    return {
      model,
      sessionCost: calcSessionCost,
      totalSessionTokens,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      contextPct,
    };
  } catch (e) {
    return null;
  }
}

// ============ 计算 Burn Rate ============

let lastTokenCount = 0;
let lastTimestamp = 0;

function calcBurnRate(currentTokens) {
  const now = Date.now();
  let rate = 0;
  
  if (lastTimestamp > 0 && lastTokenCount > 0) {
    const dtSec = (now - lastTimestamp) / 1000;
    if (dtSec > 0 && dtSec < 300) { // 5分钟内有效
      const dtTokens = currentTokens - lastTokenCount;
      if (dtTokens > 0) {
        rate = Math.round(dtTokens / dtSec);
      }
    }
  }
  
  lastTokenCount = currentTokens;
  lastTimestamp = now;
  return rate;
}

// ============ 火焰强度图标 ============

function getFireEmoji(costPerHour) {
  if (costPerHour > 20) return '🔥🔥🔥';
  if (costPerHour > 10) return '🔥🔥';
  if (costPerHour > 2)  return '🔥';
  if (costPerHour > 0.5) return '🕯️';
  return '❄️';
}

function getBurnRateColor(rate) {
  if (rate > 500) return C.fire;
  if (rate > 200) return C.bred;
  if (rate > 100) return C.orange;
  if (rate > 50)  return C.yellow;
  return C.green;
}

// ============ 主渲染函数 ============

function render(sessionData, historyStats) {
  const today = getTodayStr();
  const weekStart = getWeekStart();
  
  // 今日花费 = 历史今日 + 当前会话
  const historyToday = historyStats.daily?.[today] || 0;
  const todayCost = historyToday + (sessionData?.sessionCost || 0);
  
  // 本周花费
  let weekCost = 0;
  if (historyStats.daily) {
    for (const [day, cost] of Object.entries(historyStats.daily)) {
      if (day >= weekStart) weekCost += cost;
    }
  }
  weekCost += (sessionData?.sessionCost || 0);
  
  // 总计花费
  const totalCost = (historyStats.totalCost || 0) + (sessionData?.sessionCost || 0);
  
  // Burn rate
  const burnRate = sessionData ? calcBurnRate(sessionData.totalSessionTokens) : 0;
  
  // 模型名简化
  let modelShort = sessionData?.model || 'Claude';
  modelShort = modelShort
    .replace('Claude ', '')
    .replace('claude-', '')
    .replace('Sonnet', 'S')
    .replace('Opus', 'O')
    .replace('Haiku', 'H');
  
  // 拼装状态栏
  const parts = [];
  
  // [模型]
  parts.push(`${C.bold}${C.bred}[${modelShort}]${C.reset}`);
  
  // 会话费用
  const sessionCostStr = formatCost(sessionData?.sessionCost || 0);
  parts.push(`${C.byellow}会话 ${sessionCostStr}${C.reset}`);
  
  // Burn rate
  if (burnRate > 0) {
    const brColor = getBurnRateColor(burnRate);
    parts.push(`${brColor}${getFireEmoji(burnRate / 60)}${burnRate} tok/s${C.reset}`);
  }
  
  // 今日
  parts.push(`${C.orange}今日 ${formatCost(todayCost)}${C.reset}`);
  
  // 本周
  parts.push(`${C.bmagenta}本周 ${formatCost(weekCost)}${C.reset}`);
  
  // 总计
  parts.push(`${C.gray}总计 ${formatCost(totalCost)}${C.reset}`);

  const separator = ` ${C.gray}|${C.reset} `;
  const output = parts.join(separator);
  
  process.stdout.write(output + '\n');
}

// ============ 入口 ============

async function main() {
  // 从 stdin 读取 Claude Code 传入的 JSON
  let inputData = '';
  
  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false,
  });

  for await (const line of rl) {
    inputData += line;
  }
  
  const sessionData = getSessionDataFromStdin(inputData);
  const historyStats = getHistoryStats();
  
  render(sessionData, historyStats);
}

main().catch(() => {
  // 出错时显示一个最基础的状态栏
  process.stdout.write(`${C.bred}[Token Flame]${C.reset} ${C.gray}加载中...${C.reset}\n`);
});
