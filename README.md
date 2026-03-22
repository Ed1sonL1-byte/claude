# 🔥 Token Flame

> **"看着你的钱包在燃烧，但至少你知道烧了多少。"**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

一个为 **Claude Code** 准备的中文状态栏插件。实时追踪你的 token 消耗和费用，支持会话级、日级、周级和历史累计统计。

---

## 📸 效果预览

```
[Opus 4.6] 会话 $2.45 🔥128 tok/s | 今日 $15.30 | 本周 $89.50 | 总计 $469.90
```

---

## ✨ 特性

- 🔥 **实时烧钱速度** — 精准显示每秒消耗 token 数，火焰图标随速度变化
- 💰 **会话费用** — 当前对话花了多少钱
- 📅 **今日统计** — 跨 session 追踪今天的累计花费
- 📊 **本周统计** — 自动按周一至周日汇总本周花费
- 🏦 **历史总计** — 累计所有历史消耗，建议心脏好的人再看
- 🎯 **精准计价** — 自动识别 Opus/Sonnet/Haiku 模型，按官方价格计算
- 🚀 **零依赖** — 纯 Node.js，Claude Code 自带运行环境
- 🌏 **全中文** — 状态栏显示完全中文

---

## 🚀 安装

```bash
npm install -g @exbyte/token-flame
```

安装后自动配置，重启 Claude Code 即可看到效果。

---

## 💰 价格说明

费用计算基于 Claude 模型官方定价：

| 模型 | Input | Output | Cache Read |
|------|-------|--------|------------|
| Sonnet 4 / 4.5 | $3 / 百万 | $15 / 百万 | $0.30 / 百万 |
| Opus 4 / 4.5 | $15 / 百万 | $75 / 百万 | $1.50 / 百万 |
| Haiku 4.5 | $0.25 / 百万 | $1.25 / 百万 | $0.025 / 百万 |

---

## 🔥 火焰指示器

| 图标 | 含义 |
|------|------|
| ❄️ | 轻度使用 (< 30 tok/s) |
| 🕯️ | 正常使用 |
| 🔥 | 快速消耗 |
| 🔥🔥 | 高速燃烧 |
| 🔥🔥🔥 | 疯狂碎钞 |

---

## 📊 数据来源

- **当前会话**: 从 Claude Code statusline API 实时获取
- **历史统计**: 扫描 `~/.claude/projects/` 下的 JSONL 对话日志
- **缓存策略**: 历史数据每 5 分钟刷新一次，缓存在 `~/.claude/token-flame-stats.json`

---

## ⚙️ 技术实现

- ✅ **纯 Node.js** — 零外部依赖，只需要 Claude Code 自带的 Node
- ✅ **跨 session 追踪** — 通过扫描 JSONL 日志实现历史统计
- ✅ **智能缓存** — 避免每次刷新都扫描全部文件
- ✅ **跨平台** — macOS / Linux / Windows

---

## 🗑️ 卸载

```bash
npm uninstall -g @exbyte/token-flame
```

卸载会自动清理配置和缓存文件。如果卸载后状态栏仍显示，手动编辑 `~/.claude/settings.json` 删除 `statusLine` 字段。

---

## 🤝 贡献

欢迎 PR！

---

## 📄 License

MIT

---

## 😄 免责声明

本插件不能帮你省钱，只能让你清楚地知道自己花了多少。

**享受燃烧的感觉吧。🔥**
