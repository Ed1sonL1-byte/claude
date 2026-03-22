#!/usr/bin/env node

/**
 * Token Flame - Claude Code statusline burn monitor
 *
 * Display: [Model] Session $X.XX FireXXX tok/s | Today $X.XX | Week $X.XX | Total $X.XX
 *
 * Data sources:
 * - Current session: Claude Code statusline API (stdin JSON)
 * - Historical stats: Scan ~/.claude/projects/ JSONL files
 * - Stats cache: ~/.claude/stats-cache.json (per-model historical data)
 * - Persistent cache: ~/.claude/token-flame-stats.json
 * - Session state: ~/.claude/cache/token-flame-session.json
 * - Today state: ~/.claude/cache/token-flame-today.json
 * - Config: ~/.claude/token-flame-config.json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

// ============ Color definitions (ANSI) ============
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

// ============ Theme system ============
const THEMES = {
  fire:    { model: C.bred, session: C.byellow, rate: C.orange, today: C.orange, week: C.bmagenta, total: C.gray },
  ocean:   { model: '\x1b[34m', session: '\x1b[36m', rate: '\x1b[96m', today: '\x1b[34m', week: '\x1b[96m', total: C.gray },
  forest:  { model: C.bgreen, session: C.green, rate: C.byellow, today: C.green, week: C.byellow, total: C.gray },
  golden:  { model: '\x1b[1;33m', session: C.byellow, rate: C.yellow, today: '\x1b[1;33m', week: C.byellow, total: C.gray },
};

// ============ Pricing config (USD per million tokens) ============
const PRICING = {
  // Claude 4.x / Sonnet 4.x
  'default': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  // Opus series
  'opus':    { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  // Haiku series
  'haiku':   { input: 0.25, output: 1.25, cacheRead: 0.025, cacheWrite: 0.3125 },
};

// ============ Default config ============
const DEFAULT_CONFIG = {
  theme: 'fire',
  show_burn_rate: true,
  show_total: true,
  show_week: true,
};

// ============ Path config ============
const HOME = os.homedir();
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude');
const STATS_FILE = path.join(CLAUDE_DIR, 'token-flame-stats.json');
const STATS_CACHE_FILE = path.join(CLAUDE_DIR, 'stats-cache.json');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
const CACHE_DIR = path.join(CLAUDE_DIR, 'cache');
const SESSION_STATE_FILE = path.join(CACHE_DIR, 'token-flame-session.json');
const TODAY_STATE_FILE = path.join(CACHE_DIR, 'token-flame-today.json');
const CONFIG_FILE = path.join(CLAUDE_DIR, 'token-flame-config.json');

// ============ Utility functions ============

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

function loadConfig() {
  const userConfig = safeReadJSON(CONFIG_FILE);
  return Object.assign({}, DEFAULT_CONFIG, userConfig || {});
}

function getTheme(config) {
  return THEMES[config.theme] || THEMES.fire;
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

function getWeekStart() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(now.getFullYear(), now.getMonth(), diff);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().split('T')[0];
}

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

// ============ Stats cache: read from ~/.claude/stats-cache.json ============

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
        result.modelBreakdown[model] = { cost, tokens: totalTok };
      }
    }

    // Read dailyModelTokens (array format: [{date, tokensByModel}])
    // Only has total token count per model per day, so distribute total cost proportionally
    if (Array.isArray(data.dailyModelTokens)) {
      for (const entry of data.dailyModelTokens) {
        const day = entry.date;
        if (!day || !entry.tokensByModel) continue;
        let dayCost = 0;
        for (const [model, tokenCount] of Object.entries(entry.tokensByModel)) {
          // Use model's total cost ratio to estimate daily cost
          const modelInfo = result.modelBreakdown[model];
          if (modelInfo && modelInfo.tokens > 0) {
            dayCost += (tokenCount / modelInfo.tokens) * modelInfo.cost;
          }
        }
        result.daily[day] = (result.daily[day] || 0) + dayCost;
      }
    }
  } catch (e) { /* ignore */ }

  return result;
}

// ============ Historical stats: scan JSONL files ============

function scanDirRecursive(dirPath, stats, depth) {
  if (depth > 3) return; // prevent infinite recursion
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (e) { return; }

  // Scan JSONL files in this directory
  const jsonlFiles = entries.filter(e => e.isFile() && e.name.endsWith('.jsonl'));
  for (const file of jsonlFiles) {
    const filePath = path.join(dirPath, file.name);
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

  // Recurse into subdirectories
  const subdirs = entries.filter(e => e.isDirectory());
  for (const sub of subdirs) {
    scanDirRecursive(path.join(dirPath, sub.name), stats, depth + 1);
  }
}

function scanProjectsForHistory() {
  const stats = { daily: {}, totalCost: 0, totalTokens: 0 };

  if (!fs.existsSync(PROJECTS_DIR)) return stats;

  try {
    const projects = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
    for (const proj of projects) {
      if (!proj.isDirectory()) continue;
      scanDirRecursive(path.join(PROJECTS_DIR, proj.name), stats, 0);
    }
  } catch (e) { /* skip errors */ }

  return stats;
}

// ============ Cache management ============

function loadCache() {
  try {
    if (fs.existsSync(STATS_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
      // Cache valid for 5 minutes
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
    atomicWrite(STATS_FILE, data);
  } catch (e) { /* ignore */ }
}

function getHistoryStats() {
  const cached = loadCache();
  if (cached && cached.daily) return cached;

  // Try stats-cache.json first (more accurate per-model data)
  const statsCacheData = readStatsCache();

  // Also scan JSONL files
  const jsonlStats = scanProjectsForHistory();

  // Merge: use the data source with higher totalCost as primary,
  // supplement with the other
  let stats;
  if (statsCacheData && statsCacheData.totalCost > jsonlStats.totalCost) {
    stats = statsCacheData;
    // Supplement daily data from JSONL where stats-cache doesn't have it
    for (const [day, cost] of Object.entries(jsonlStats.daily)) {
      if (!stats.daily[day] || jsonlStats.daily[day] > stats.daily[day]) {
        stats.daily[day] = cost;
      }
    }
  } else {
    stats = jsonlStats;
    // Supplement with stats-cache model breakdown if available
    if (statsCacheData) {
      stats.modelBreakdown = statsCacheData.modelBreakdown;
    }
  }

  saveCache(stats);
  return stats;
}

// ============ Session state persistence ============

function loadSessionState() {
  return safeReadJSON(SESSION_STATE_FILE) || {};
}

function saveSessionState(state) {
  try {
    atomicWrite(SESSION_STATE_FILE, state);
  } catch (e) { /* ignore */ }
}

// ============ Today state persistence ============

function loadTodayState() {
  const state = safeReadJSON(TODAY_STATE_FILE);
  if (!state) return null;
  // Reset on date change
  if (state.date !== getTodayStr()) return null;
  return state;
}

function saveTodayState(state) {
  try {
    atomicWrite(TODAY_STATE_FILE, state);
  } catch (e) { /* ignore */ }
}

// ============ Read session data from Claude Code statusline API (stdin) ============

function getSessionDataFromStdin(jsonStr) {
  try {
    const data = JSON.parse(jsonStr);

    const model = data.model?.display_name || data.model?.name || 'Claude';
    const sessionCost = data.cost?.total_cost_usd || data.session?.cost_usd || data.total_cost_usd || 0;
    const sessionId = data.session_id || data.session?.id || '';

    const cw = data.context_window || {};
    const cu = cw.current_usage || data.current_usage || {};
    const inputTokens = cu.input_tokens || cw.total_input_tokens || data.total_input_tokens || 0;
    const outputTokens = cu.output_tokens || cw.total_output_tokens || data.total_output_tokens || 0;
    const cacheReadTokens = cu.cache_read_input_tokens || 0;
    const cacheWriteTokens = cu.cache_creation_input_tokens || 0;

    const totalSessionTokens = inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens;

    // Calculate cost from tokens if API didn't provide it
    const pricing = getPricing(model);
    const calcSessionCost = sessionCost > 0 ? sessionCost : calcCost(
      { input: inputTokens, output: outputTokens, cacheRead: cacheReadTokens, cacheWrite: cacheWriteTokens },
      pricing
    );

    // Context info
    const contextPct = data.context_window?.used_percentage || 0;

    return {
      model,
      sessionId,
      sessionCost: calcSessionCost,
      totalSessionTokens,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      contextPct,
    };
  } catch (e) {
    return null;
  }
}

// ============ Calculate Burn Rate ============

function calcBurnRate(currentTokens, sessionState) {
  const now = Date.now();
  let rate = 0;

  const lastTokenCount = sessionState.lastTokenCount || 0;
  const lastTimestamp = sessionState.lastTimestamp || 0;

  if (lastTimestamp > 0 && lastTokenCount > 0) {
    const dtSec = (now - lastTimestamp) / 1000;
    if (dtSec > 0 && dtSec < 300) { // Valid within 5 minutes
      const dtTokens = currentTokens - lastTokenCount;
      if (dtTokens > 0) {
        rate = Math.round(dtTokens / dtSec);
      }
    }
  }

  sessionState.lastTokenCount = currentTokens;
  sessionState.lastTimestamp = now;
  return rate;
}

// ============ Fire intensity icon ============

function getFireEmoji(costPerHour) {
  if (costPerHour > 20) return '\u{1F525}\u{1F525}\u{1F525}';
  if (costPerHour > 10) return '\u{1F525}\u{1F525}';
  if (costPerHour > 2)  return '\u{1F525}';
  if (costPerHour > 0.5) return '\u{1F56F}\u{FE0F}';
  return '\u{2744}\u{FE0F}';
}

function getBurnRateColor(rate) {
  if (rate > 500) return C.fire;
  if (rate > 200) return C.bred;
  if (rate > 100) return C.orange;
  if (rate > 50)  return C.yellow;
  return C.green;
}

// ============ Main render function ============

function render(sessionData, historyStats, config) {
  const today = getTodayStr();
  const weekStart = getWeekStart();
  const theme = getTheme(config);

  // Load and manage session state
  let sessionState = loadSessionState();
  if (sessionData && sessionData.sessionId && sessionState.sessionId !== sessionData.sessionId) {
    // Session changed - reset burn rate state
    sessionState = { sessionId: sessionData.sessionId, startTime: Date.now(), lastTokenCount: 0, lastTimestamp: 0 };
  }

  // Session cost from Claude Code API
  const currentSessionCost = sessionData?.sessionCost || 0;

  // All costs come directly from JSONL scan (already includes current session)
  const todayCost = historyStats.daily?.[today] || 0;

  // Week cost
  let weekCost = 0;
  if (historyStats.daily) {
    for (const [day, cost] of Object.entries(historyStats.daily)) {
      if (day >= weekStart) weekCost += cost;
    }
  }

  // Total cost
  const totalCost = historyStats.totalCost || 0;

  // Burn rate
  let burnRate = 0;
  if (sessionData && config.show_burn_rate) {
    burnRate = calcBurnRate(sessionData.totalSessionTokens, sessionState);
  }

  // Clean model name: remove "(1M context)" etc, keep full name
  let modelShort = sessionData?.model || 'Claude';
  modelShort = modelShort
    .replace(/\s*\(.*?\)\s*/g, '')
    .replace('Claude ', '')
    .replace('claude-', '')
    .trim();

  const modelColor = `${C.bold}${theme.model}`;

  // Build statusline
  const parts = [];

  // [Model]
  parts.push(`${modelColor}[${modelShort}]${C.reset}`);

  // Session cost
  const sessionCostStr = formatCost(currentSessionCost);
  parts.push(`${theme.session}\u4F1A\u8BDD ${sessionCostStr}${C.reset}`);

  // Burn rate
  if (burnRate > 0 && config.show_burn_rate) {
    const brColor = getBurnRateColor(burnRate);
    parts.push(`${brColor}${getFireEmoji(burnRate / 60)}${burnRate} tok/s${C.reset}`);
  }

  // Today
  parts.push(`${theme.today}\u4ECA\u65E5 ${formatCost(todayCost)}${C.reset}`);

  // Week
  if (config.show_week) {
    parts.push(`${theme.week}\u672C\u5468 ${formatCost(weekCost)}${C.reset}`);
  }

  // Total
  if (config.show_total) {
    parts.push(`${theme.total}\u603B\u8BA1 ${formatCost(totalCost)}${C.reset}`);
  }

  const separator = ` ${C.gray}|${C.reset} `;
  const output = parts.join(separator);

  process.stdout.write(output + '\n');

  // Save session state (for burn rate tracking)
  saveSessionState(sessionState);
}

// ============ Entry point ============

async function main() {
  // Ensure cache directory exists
  ensureDir(CACHE_DIR);

  // Load config
  const config = loadConfig();

  // Read JSON from stdin (Claude Code input)
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

  render(sessionData, historyStats, config);
}

main().catch(() => {
  // Show a basic statusline on error
  process.stdout.write(`${C.bred}[Token Flame]${C.reset} ${C.gray}\u52A0\u8F7D\u4E2D...${C.reset}\n`);
});
