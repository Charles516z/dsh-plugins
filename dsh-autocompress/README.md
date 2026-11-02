# dsh-autocompress

**每天在 token 高峰期之前，把所有空闲会话的上下文压一遍。**

DeepSeek Harness（DSH）插件。定时跑一次压缩，错过时间就在当天首次启动时补跑，也可以随时
`/compact-all` 手动执行一次。压缩本身用的是 DSH 自己的 `compaction` 服务，不做任何模型调用之外的事。

> 默认时间 **08:30**，只压**空闲**会话（不打断正在跑的回合），每个会话之间留 250ms 间隔，避免把 provider 打满。

## 安装

```sh
dsh plugin add dsh-autocompress
```

或者在桌面端：**设置 → 插件**，从市场/本地安装后开启。装完即生效，不需要重启。

插件自带一条 patch，会确保宿主级 `compaction-basic` 存在并把它的 `auto` 关掉（见下方“为什么需要宿主级
compaction”）。如果你已经在自定义 preset 里挂了 compaction，这一行只是让 `compaction` 服务可解析，不会重复压缩。

## 用法

| 入口 | 说明 |
| --- | --- |
| 定时 | 每天 `time` 到点自动跑一次；同一天只跑一次（状态文件里记 `lastRunDay`） |
| 启动补压 | 当天已经过了 `time` 而这次启动还没跑过，则在启动 `settleSeconds` 秒后补跑 |
| `/compact-all` | 立即对所有空闲会话压缩一次；手动触发不查重，也不做延后重试 |

运行结果会写进日志，并落到 profile 目录的 `.auto-compact-state.json`：

```json
{ "lastRunDay": "2026-11-02", "lastRunAt": "2026-11-02T08:30:01.000Z", "lastTrigger": "schedule",
  "lastResults": [{ "session": "session-…", "outcome": "compacted", "items": 12, "tokens": 48321 }] }
```

`outcome` 取值：`compacted`（压缩成功）、`nothing`（没有可压区间）、`busy`（会话正在跑）、`unavailable`
（找不到压缩服务）、`unsupported`（Agent 不支持维护任务）、`cancelled` / `timed-out`。

## 配置

在 profile 的 `cordis.patch.yml` 里覆盖，全部可选：

```yaml
- id: autocompress
  config:
    time: '08:30'          # 本地墙钟时间 HH:MM
    catchUp: true          # 当天错过时，启动后补跑一次
    target: all            # all = 所有存活会话；roots = 只压顶层会话
    retries: 2             # busy 会话的延后重试次数（仅定时触发）
    retryMinutes: 10       # 每次重试间隔（分钟）
    timeoutMinutes: 30     # 单个会话压缩超时，超时即中断
    settleSeconds: 20      # 启动补压前等待宿主就绪的秒数
    gapMs: 250             # 两个会话之间的间隔
```

## 为什么需要宿主级 compaction

在 Web/desktop profile 里，`compaction` 不是 Host 服务，而是挂在**每个 Agent 的 preset 隔离组**里
（`compaction-basic` + `command-compact`）。所以本插件按会话解析：

1. `agentPresets.serviceFor(agent, 'compaction')` —— 取该 Agent 所在 preset 的实例；
2. 取不到再退回宿主级 `ctx.get('compaction')`；
3. 两者都没有，就如实记 `unavailable`，不静默跳过。

第 1 步拿不到、第 2 步又被别的插件（例如 billion-context 的 compaction gate）压掉的 profile，需要自己
保证有可用的 compaction 服务，否则本插件只能报 `unavailable`。

## 限制

- 只处理 `agent.status === 'idle'` 的会话；正在跑的回合不会被抢占。
- 压缩是否“值得做”由 `compaction` 服务判断：区间太小或摘要不更小时会返回 `nothing` / `summary` 错误，这是正常行为。
- 定时器随宿主进程存活；进程不在时不会做任何事，下一次启动按“启动补压”补一次。

## License

MIT

---

## English

**Compress every idle session's context before the daily token rush.**

A DeepSeek Harness plugin. It runs DSH's own `compaction` service on a schedule (default 08:30 local time),
catches up on the first launch after a missed slot, and exposes `/compact-all` for an on-demand run.
Only idle agents are touched; sessions are processed one at a time with a 250 ms gap.

```sh
dsh plugin add dsh-autocompress
```

Config keys: `time`, `catchUp`, `target` (`all` | `roots`), `retries`, `retryMinutes`, `timeoutMinutes`,
`settleSeconds`, `gapMs`. It resolves `compaction` per agent via `agentPresets.serviceFor(agent, 'compaction')`
and falls back to a host-level service; if neither exists it reports `unavailable` instead of failing silently.
