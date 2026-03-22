# Token Flame

> **"看着你的钱包在燃烧，但至少你知道烧了多少。"**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

一个为 **Claude Code** 准备的中文状态栏插件。实时追踪你的 token 消耗和费用，支持会话级、日级、周级和历史累计统计。现已支持多主题、预算告警、Slash 命令和精准多模型计价（含缓存写入）。

---

## 效果预览

```
[Opus 4.6] 会话 $2.45 128 tok/s | 今日 $15.30 | 本周 $89.50 | 总计 $469.90
```

超出预算时：
```
[S4] 会话 $5.20 256 tok/s | 今日 $12.30 | 本周 $55.00 | 总计 $520.00 | 日超预算 | 周超预算
```

---

## 特性

- **实时烧钱速度** -- 精准显示每秒消耗 token 数，火焰图标随速度变化
- **会话费用** -- 当前对话花了多少钱
- **今日统计** -- 跨 session 持久化追踪今天的累计花费
- **本周统计** -- 自动按周一至周日汇总本周花费
- **历史总计** -- 累计所有历史消耗，建议心脏好的人再看
- **精准多模型计价** -- 自动识别 Opus/Sonnet/Haiku，包含缓存写入(cache_creation)费用
- **主题系统** -- 4 种主题：fire(默认)、ocean、forest、golden
- **预算告警** -- 日/周花费超过阈值时，模型名变红闪烁提醒
- **Slash 命令** -- 4 个便捷命令查看账单、图表、导出数据、卸载
- **会话状态持久化** -- 跨进程准确追踪 burn rate
- **今日状态持久化** -- 跨会话准确追踪今日花费
- **stats-cache.json 支持** -- 读取 Claude 原生统计数据，实现更精准的per-model历史计价
- **零依赖** -- 纯 Node.js，Claude Code 自带运行环境
- **全中文** -- 状态栏显示完全中文

---

## 安装

```bash
npm install -g @exbyte/token-flame
```

安装后自动配置，重启 Claude Code 即可看到效果。

---

## Slash 命令

安装后可在 Claude Code 中使用以下命令：

| 命令 | 功能 |
|------|------|
| `/burn-your-money` | 查看详细账单（含 ASCII 艺术和趣味对比） |
| `/burn-your-money-stats` | 查看 7 日消费趋势图 |
| `/burn-your-money-export` | 导出每日消费 CSV 数据 |
| `/burn-your-money-uninstall` | 完全卸载 Token Flame |

---

## 配置

创建 `~/.claude/token-flame-config.json` 自定义设置：

```json
{
  "theme": "fire",
  "alert_daily": 10.0,
  "alert_weekly": 50.0,
  "show_burn_rate": true,
  "show_total": true,
  "show_week": true
}
```

### 主题选项

| 主题 | 风格 |
|------|------|
| `fire` | 默认 红/橙色系 |
| `ocean` | 蓝/青色系 |
| `forest` | 绿/黄色系 |
| `golden` | 金/黄色系 |

### 告警配置

- `alert_daily` -- 日花费超过此金额(USD)时，模型名变醒目红色
- `alert_weekly` -- 周花费超过此金额(USD)时，模型名变醒目红色

---

## 价格说明

费用计算基于 Claude 模型官方定价（含缓存写入）：

| 模型 | Input | Output | Cache Read | Cache Write |
|------|-------|--------|------------|-------------|
| Sonnet 4 / 4.5 | $3 / 百万 | $15 / 百万 | $0.30 / 百万 | $3.75 / 百万 |
| Opus 4 / 4.5 | $15 / 百万 | $75 / 百万 | $1.50 / 百万 | $18.75 / 百万 |
| Haiku 4.5 | $0.25 / 百万 | $1.25 / 百万 | $0.025 / 百万 | $0.3125 / 百万 |

Cache Write = 1.25x Input price（缓存写入费用为输入价格的 1.25 倍）

---

## 火焰指示器

| 图标 | 含义 |
|------|------|
| 冰晶 | 轻度使用 (< 30 tok/s) |
| 蜡烛 | 正常使用 |
| 1火 | 快速消耗 |
| 2火 | 高速燃烧 |
| 3火 | 疯狂碎钞 |

---

## 数据来源

- **当前会话**: 从 Claude Code statusline API 实时获取
- **历史统计**: 优先读取 `~/.claude/stats-cache.json`（per-model精准计价），补充扫描 `~/.claude/projects/` 下的 JSONL 日志
- **缓存策略**: 历史数据每 5 分钟刷新一次
- **会话持久化**: `~/.claude/cache/token-flame-session.json`
- **今日持久化**: `~/.claude/cache/token-flame-today.json`

---

## 技术实现

- **纯 Node.js** -- 零外部依赖，只需要 Claude Code 自带的 Node
- **原子写入** -- 所有文件写入使用 temp+rename 确保不损坏
- **跨 session 追踪** -- 通过持久化状态和扫描 JSONL 日志
- **智能缓存** -- 5 分钟 TTL，避免每次刷新都扫描
- **跨平台** -- macOS / Linux / Windows

---

## 卸载

```bash
npm uninstall -g @exbyte/token-flame
```

或在 Claude Code 中使用 `/burn-your-money-uninstall` 命令。

卸载会自动清理配置、脚本、命令和缓存文件。如果卸载后状态栏仍显示，手动编辑 `~/.claude/settings.json` 删除 `statusLine` 字段。

---

## 贡献

欢迎 PR！

---

## License

MIT

---

## 免责声明

本插件不能帮你省钱，只能让你清楚地知道自己花了多少。

**享受燃烧的感觉吧。**
