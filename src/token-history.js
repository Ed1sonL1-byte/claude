#!/usr/bin/env node

/**
 * Token Flame - Historical Analysis Module
 *
 * Modes:
 *   summary  - JSON output of all time periods
 *   detail   - Pretty-printed ASCII art report
 *   chart    - 7-day bar chart with ASCII fire art
 *   export csv - CSV export of daily data
 *   trend    - JSON daily trend data
 *   uninstall - Call uninstall logic
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ============ Path config ============
const HOME = os.homedir();
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude');
const STATS_CACHE_FILE = path.join(CLAUDE_DIR, 'stats-cache.json');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
const CACHE_DIR = path.join(CLAUDE_DIR, 'cache');
const HISTORY_CACHE_FILE = path.join(CACHE_DIR, 'token-flame-history.json');

// ============ Pricing (USD per million tokens) ============
const PRICING = {
  'default': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'opus':    { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  'haiku':   { input: 0.25, output: 1.25, cacheRead: 0.025, cacheWrite: 0.3125 },
};

// ============ ANSI Colors ============
const C = {
  red:     '\x1b[31m',
  bred:    '\x1b[91m',
  yellow:  '\x1b[33m',
  byellow: '\x1b[93m',
  green:   '\x1b[32m',
  bgreen:  '\x1b[92m',
  cyan:    '\x1b[36m',
  magenta: '\x1b[35m',
  bmagenta:'\x1b[95m',
  gray:    '\x1b[90m',
  white:   '\x1b[37m',
  bold:    '\x1b[1m',
  reset:   '\x1b[0m',
  orange:  '\x1b[38;5;208m',
  fire:    '\x1b[38;5;196m',
  dim:     '\x1b[2m',
};

// ============ Utility ============

function ensureDir(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  } catch (e) { /* ignore */ }
}

function atomicWrite(filePath, data) {
  const tmp = filePath + '.' + process.pid + '.tmp';
  try {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, filePath);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
}

function safeReadJSON(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (e) { /* ignore */ }
  return null;
}

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
  const cacheWrite = (tokens.cacheWrite || 0) * pricing.cacheWrite / 1_000_000;
  return input + output + cacheRead + cacheWrite;
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

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

function getWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.getFullYear(), now.getMonth(), diff);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().split('T')[0];
}

function getMonthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
}

function getLastMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

// ============ Data Sources ============

function readStatsCache() {
  const data = safeReadJSON(STATS_CACHE_FILE);
  if (!data) return null;

  const result = { daily: {}, totalCost: 0, totalTokens: 0, modelBreakdown: {} };

  try {
    // Read modelUsage for per-model aggregate data (camelCase fields)
    if (data.modelUsage) {
      for (const [model, usage] of Object.entries(data.modelUsage)) {
        const pricing = getPricing(model);
        const tokens = {
          input: usage.inputTokens || 0,
          output: usage.outputTokens || 0,
          cacheRead: usage.cacheReadInputTokens || 0,
          cacheWrite: usage.cacheCreationInputTokens || 0,
        };
        const cost = calcCost(tokens, pricing);
        result.totalCost += cost;
        const totalTok = tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite;
        result.totalTokens += totalTok;
        result.modelBreakdown[model] = {
          cost,
          inputTokens: tokens.input,
          outputTokens: tokens.output,
          cacheReadTokens: tokens.cacheRead,
          cacheWriteTokens: tokens.cacheWrite,
        };
      }
    }

    // Read dailyModelTokens (array format: [{date, tokensByModel}])
    if (Array.isArray(data.dailyModelTokens)) {
      for (const entry of data.dailyModelTokens) {
        const day = entry.date;
        if (!day || !entry.tokensByModel) continue;
        let dayCost = 0;
        for (const [model, tokenCount] of Object.entries(entry.tokensByModel)) {
          const modelInfo = result.modelBreakdown[model];
          if (modelInfo && modelInfo.inputTokens + modelInfo.outputTokens + modelInfo.cacheReadTokens + modelInfo.cacheWriteTokens > 0) {
            const modelTotalTokens = modelInfo.inputTokens + modelInfo.outputTokens + modelInfo.cacheReadTokens + modelInfo.cacheWriteTokens;
            dayCost += (tokenCount / modelTotalTokens) * modelInfo.cost;
          }
        }
        result.daily[day] = (result.daily[day] || 0) + dayCost;
      }
    }
  } catch (e) { /* ignore */ }

  return result;
}

function scanJsonlDir(dirPath, stats) {
  let files;
  try {
    files = fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl'));
  } catch (e) { return; }

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          if (entry.type !== 'assistant') continue;

          const ts = entry.timestamp || entry.createdAt;
          if (!ts) continue;
          const day = ts.slice(0, 10);

          const msg = entry.message || {};
          const usage = msg.usage;
          if (usage) {
            const pricing = getPricing(msg.model || '');
            const cost = calcCost({
              input: usage.input_tokens || 0,
              output: usage.output_tokens || 0,
              cacheRead: usage.cache_read_input_tokens || 0,
              cacheWrite: usage.cache_creation_input_tokens || 0,
            }, pricing);
            stats.daily[day] = (stats.daily[day] || 0) + cost;
            stats.totalCost += cost;
            stats.totalTokens += (usage.input_tokens || 0) + (usage.output_tokens || 0)
              + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
          } else if (entry.costUSD) {
            stats.daily[day] = (stats.daily[day] || 0) + entry.costUSD;
            stats.totalCost += entry.costUSD;
          }
        } catch (e) { /* skip */ }
      }
    } catch (e) { /* skip */ }
  }
}

function scanProjectsForHistory() {
  const stats = { daily: {}, totalCost: 0, totalTokens: 0 };

  if (!fs.existsSync(PROJECTS_DIR)) return stats;

  try {
    const projects = fs.readdirSync(PROJECTS_DIR);
    for (const proj of projects) {
      const projPath = path.join(PROJECTS_DIR, proj);
      try {
        if (!fs.statSync(projPath).isDirectory()) continue;
      } catch (e) { continue; }

      scanJsonlDir(projPath, stats);

      const subagentsDir = path.join(projPath, 'subagents');
      try {
        if (fs.existsSync(subagentsDir) && fs.statSync(subagentsDir).isDirectory()) {
          scanJsonlDir(subagentsDir, stats);
        }
      } catch (e) { /* ignore */ }
    }
  } catch (e) { /* skip */ }

  return stats;
}

function getHistoryData() {
  // Check cache first (5-min TTL)
  const cached = safeReadJSON(HISTORY_CACHE_FILE);
  if (cached && cached._ts && (Date.now() - cached._ts) < 5 * 60 * 1000) {
    return cached;
  }

  // Priority 1: stats-cache.json
  const statsCacheData = readStatsCache();

  // Priority 2: JSONL scan
  const jsonlStats = scanProjectsForHistory();

  // Merge
  let result;
  if (statsCacheData && statsCacheData.totalCost > jsonlStats.totalCost) {
    result = statsCacheData;
    for (const [day, cost] of Object.entries(jsonlStats.daily)) {
      if (!result.daily[day] || jsonlStats.daily[day] > result.daily[day]) {
        result.daily[day] = cost;
      }
    }
  } else {
    result = jsonlStats;
    if (statsCacheData) {
      result.modelBreakdown = statsCacheData.modelBreakdown;
    }
  }

  // Cache result
  result._ts = Date.now();
  ensureDir(CACHE_DIR);
  atomicWrite(HISTORY_CACHE_FILE, result);

  return result;
}

// ============ Compute Periods ============

function computePeriods(data) {
  const today = getTodayStr();
  const weekStart = getWeekStart();
  const monthStart = getMonthStart();
  const lastMonth = getLastMonthRange();

  const periods = {
    today: { cost: 0, tokens: 0 },
    thisWeek: { cost: 0, tokens: 0 },
    thisMonth: { cost: 0, tokens: 0 },
    lastMonth: { cost: 0, tokens: 0 },
    allTime: { cost: data.totalCost || 0, tokens: data.totalTokens || 0 },
  };

  if (data.daily) {
    for (const [day, cost] of Object.entries(data.daily)) {
      if (day === today) {
        periods.today.cost += cost;
      }
      if (day >= weekStart) {
        periods.thisWeek.cost += cost;
      }
      if (day >= monthStart) {
        periods.thisMonth.cost += cost;
      }
      if (day >= lastMonth.start && day <= lastMonth.end) {
        periods.lastMonth.cost += cost;
      }
    }
  }

  return periods;
}

// ============ Mode: summary ============

function modeSummary(data) {
  const periods = computePeriods(data);
  const output = {
    today: formatCost(periods.today.cost),
    thisWeek: formatCost(periods.thisWeek.cost),
    thisMonth: formatCost(periods.thisMonth.cost),
    lastMonth: formatCost(periods.lastMonth.cost),
    allTime: formatCost(periods.allTime.cost),
    totalTokens: formatTokens(periods.allTime.tokens),
    modelBreakdown: data.modelBreakdown || {},
    raw: periods,
  };
  console.log(JSON.stringify(output, null, 2));
}

// ============ Mode: detail ============

function modeDetail(data) {
  const periods = computePeriods(data);

  const FIRE_ART = [
    `${C.fire}                )  (`,
    `${C.fire}               (   ) )`,
    `${C.orange}                ) ( (`,
    `${C.orange}              _______)_`,
    `${C.byellow}           .-'---------|`,
    `${C.byellow}          ( C|/\\/\\/\\/\\/|`,
    `${C.yellow}           '-./\\/\\/\\/\\/|`,
    `${C.yellow}             '_________'`,
    `${C.gray}              '-------'`,
  ];

  const line = `${C.gray}${'='.repeat(52)}${C.reset}`;
  const thinLine = `${C.gray}${'-'.repeat(52)}${C.reset}`;

  console.log('');
  for (const artLine of FIRE_ART) {
    console.log(`  ${artLine}${C.reset}`);
  }
  console.log('');
  console.log(`  ${C.bold}${C.fire}   TOKEN FLAME - BURN REPORT${C.reset}`);
  console.log(`  ${C.gray}   Your wallet called. It's crying.${C.reset}`);
  console.log('');
  console.log(`  ${line}`);
  console.log('');

  // Period breakdown
  const rows = [
    ['\u{1F4C5} \u4ECA\u65E5', periods.today.cost],
    ['\u{1F4CA} \u672C\u5468', periods.thisWeek.cost],
    ['\u{1F4C6} \u672C\u6708', periods.thisMonth.cost],
    ['\u{1F4CB} \u4E0A\u6708', periods.lastMonth.cost],
    ['\u{1F3E6} \u603B\u8BA1', periods.allTime.cost],
  ];

  for (const [label, cost] of rows) {
    const costStr = formatCost(cost);
    const bar = '\u2588'.repeat(Math.min(30, Math.max(1, Math.round(cost / 2))));
    const barColor = cost > 50 ? C.fire : cost > 20 ? C.bred : cost > 10 ? C.orange : cost > 5 ? C.yellow : C.green;
    console.log(`  ${label.padEnd(14)} ${C.bold}${costStr.padStart(10)}${C.reset}  ${barColor}${bar}${C.reset}`);
  }

  console.log('');
  console.log(`  ${thinLine}`);
  console.log('');

  // Fun comparisons
  const totalCost = periods.allTime.cost;
  const coffees = Math.floor(totalCost / 5);
  const chatgptSubs = Math.floor(totalCost / 20);
  const burritos = Math.floor(totalCost / 12);
  const beers = Math.floor(totalCost / 8);

  console.log(`  ${C.bold}${C.byellow}  \u2615 \u8FD9\u7B14\u94B1\u8FD8\u80FD\u4E70...${C.reset}`);
  console.log('');
  if (coffees > 0) console.log(`  ${C.orange}    \u2615 ${coffees} \u676F\u661F\u5DF4\u514B\u62FF\u94C1 ($5/\u676F)${C.reset}`);
  if (chatgptSubs > 0) console.log(`  ${C.bgreen}    \u{1F916} ${chatgptSubs} \u4E2A\u6708 ChatGPT Plus ($20/\u6708)${C.reset}`);
  if (burritos > 0) console.log(`  ${C.byellow}    \u{1F32F} ${burritos} \u4E2A Chipotle Burrito ($12/\u4E2A)${C.reset}`);
  if (beers > 0) console.log(`  ${C.yellow}    \u{1F37A} ${beers} \u676F\u7CBE\u917F\u5564\u9152 ($8/\u676F)${C.reset}`);

  console.log('');
  console.log(`  ${thinLine}`);
  console.log('');

  // Token stats
  console.log(`  ${C.bold}${C.cyan}  \u{1F4CA} Token \u7EDF\u8BA1${C.reset}`);
  console.log('');
  console.log(`  ${C.gray}    \u603B Token: ${formatTokens(periods.allTime.tokens)}${C.reset}`);

  // Model breakdown
  if (data.modelBreakdown && Object.keys(data.modelBreakdown).length > 0) {
    console.log('');
    console.log(`  ${C.bold}${C.magenta}  \u{1F916} \u6A21\u578B\u8D39\u7528\u5206\u5E03${C.reset}`);
    console.log('');
    for (const [model, info] of Object.entries(data.modelBreakdown)) {
      const pct = periods.allTime.cost > 0 ? ((info.cost / periods.allTime.cost) * 100).toFixed(1) : '0.0';
      console.log(`  ${C.gray}    ${model.padEnd(30)} ${formatCost(info.cost).padStart(10)}  (${pct}%)${C.reset}`);
    }
  }

  console.log('');
  console.log(`  ${line}`);
  console.log(`  ${C.dim}${C.gray}  Token Flame v1.1.0 | github.com/exbyte/token-flame${C.reset}`);
  console.log('');
}

// ============ Mode: chart ============

function modeChart(data) {
  const today = new Date();
  const days = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dayStr = d.toISOString().split('T')[0];
    const dayLabel = d.toLocaleDateString('zh-CN', { weekday: 'short' });
    const shortLabel = dayStr.slice(5); // MM-DD
    days.push({
      date: dayStr,
      label: shortLabel,
      weekday: dayLabel,
      cost: data.daily?.[dayStr] || 0,
    });
  }

  const maxCost = Math.max(...days.map(d => d.cost), 0.01);
  const maxBarHeight = 12;

  // Fire art header
  console.log('');
  console.log(`  ${C.fire}       )  (           ${C.bold}TOKEN FLAME${C.reset}`);
  console.log(`  ${C.fire}      (   ) )         ${C.gray}7-Day Burn Chart${C.reset}`);
  console.log(`  ${C.orange}       ) ( (${C.reset}`);
  console.log('');

  const line = `  ${C.gray}${'='.repeat(56)}${C.reset}`;
  console.log(line);
  console.log('');

  // Build chart rows (top-down)
  for (let row = maxBarHeight; row >= 1; row--) {
    let rowStr = '  ';
    for (const day of days) {
      const barHeight = Math.round((day.cost / maxCost) * maxBarHeight);
      if (barHeight >= row) {
        const intensity = row / maxBarHeight;
        let color;
        if (intensity > 0.7) color = C.fire;
        else if (intensity > 0.4) color = C.orange;
        else color = C.byellow;
        rowStr += ` ${color}\u2588\u2588\u2588\u2588\u2588${C.reset}  `;
      } else {
        rowStr += '        ';
      }
    }
    // Cost label on the top bar
    if (row === maxBarHeight) {
      rowStr += ` ${C.gray}${formatCost(maxCost)}${C.reset}`;
    }
    console.log(rowStr);
  }

  // X-axis
  let axisStr = '  ';
  for (const day of days) {
    axisStr += `${C.gray} ${day.label}  ${C.reset}`;
  }
  console.log(`  ${C.gray}${'_'.repeat(56)}${C.reset}`);
  console.log(axisStr);

  // Cost labels
  let costStr = '  ';
  for (const day of days) {
    const cs = formatCost(day.cost);
    costStr += `${C.byellow}${cs.padStart(6)} ${C.reset} `;
  }
  console.log(costStr);

  // Total for the week
  const weekTotal = days.reduce((sum, d) => sum + d.cost, 0);
  console.log('');
  console.log(`  ${C.bold}${C.orange}  7\u65E5\u5408\u8BA1: ${formatCost(weekTotal)}${C.reset}  ${C.gray}| \u65E5\u5747: ${formatCost(weekTotal / 7)}${C.reset}`);
  console.log('');
  console.log(line);
  console.log('');
}

// ============ Mode: export csv ============

function modeExportCSV(data) {
  console.log('date,cost_usd');
  if (data.daily) {
    const sortedDays = Object.keys(data.daily).sort();
    for (const day of sortedDays) {
      console.log(`${day},${data.daily[day].toFixed(4)}`);
    }
  }
}

// ============ Mode: trend ============

function modeTrend(data) {
  if (!data.daily) {
    console.log(JSON.stringify([]));
    return;
  }

  const sortedDays = Object.keys(data.daily).sort();
  const trend = sortedDays.map(day => ({
    date: day,
    cost: data.daily[day],
  }));

  console.log(JSON.stringify(trend, null, 2));
}

// ============ Mode: uninstall ============

function modeUninstall() {
  const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json');
  const filesToRemove = [
    path.join(CLAUDE_DIR, 'statusline.js'),
    path.join(CLAUDE_DIR, 'scripts', 'token-flame-history.js'),
    path.join(CLAUDE_DIR, 'commands', 'burn-your-money.md'),
    path.join(CLAUDE_DIR, 'commands', 'burn-your-money-stats.md'),
    path.join(CLAUDE_DIR, 'commands', 'burn-your-money-export.md'),
    path.join(CLAUDE_DIR, 'commands', 'burn-your-money-uninstall.md'),
    path.join(CLAUDE_DIR, 'token-flame-stats.json'),
    path.join(CACHE_DIR, 'token-flame-session.json'),
    path.join(CACHE_DIR, 'token-flame-today.json'),
    path.join(CACHE_DIR, 'token-flame-history.json'),
    path.join(CLAUDE_DIR, 'token-flame-config.json'),
  ];

  console.log(`\n${C.fire}\u{1F525} Token Flame - \u5378\u8F7D\u4E2D...${C.reset}\n`);

  // Clean settings.json
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
      if (settings._tokenFlameBackup_statusLine) {
        settings.statusLine = settings._tokenFlameBackup_statusLine;
        delete settings._tokenFlameBackup_statusLine;
        console.log('\u{1F4E6} \u5DF2\u6062\u590D\u539F\u6709 statusLine \u914D\u7F6E');
      } else {
        delete settings.statusLine;
        console.log('\u{1F5D1}\u{FE0F}  \u5DF2\u79FB\u9664 statusLine \u914D\u7F6E');
      }
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    }
  } catch (e) {
    console.log('\u26A0\u{FE0F}  \u65E0\u6CD5\u66F4\u65B0 settings.json\uFF0C\u8BF7\u624B\u52A8\u79FB\u9664 statusLine \u5B57\u6BB5');
  }

  // Remove files
  for (const filePath of filesToRemove) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`\u{1F5D1}\u{FE0F}  \u5DF2\u5220\u9664 ${path.basename(filePath)}`);
      }
    } catch (e) { /* ignore */ }
  }

  console.log('');
  console.log(`\u2705 \u5378\u8F7D\u5B8C\u6210\uFF01\u91CD\u542F Claude Code \u540E\u72B6\u6001\u680F\u5C06\u6D88\u5931`);
  console.log('');
}

// ============ Main ============

function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'summary';
  const subMode = args[1] || '';

  const data = (mode === 'uninstall') ? null : getHistoryData();

  switch (mode) {
    case 'summary':
      modeSummary(data);
      break;
    case 'detail':
      modeDetail(data);
      break;
    case 'chart':
      modeChart(data);
      break;
    case 'export':
      if (subMode === 'csv') {
        modeExportCSV(data);
      } else {
        console.error('Usage: token-flame-history export csv');
        process.exit(1);
      }
      break;
    case 'trend':
      modeTrend(data);
      break;
    case 'uninstall':
      modeUninstall();
      break;
    default:
      console.error(`Unknown mode: ${mode}`);
      console.error('Available modes: summary, detail, chart, export csv, trend, uninstall');
      process.exit(1);
  }
}

main();
