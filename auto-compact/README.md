# 晨间上下文压缩（auto-compact）

每天清晨 token 使用高峰到来之前（默认 **08:30**），把当前所有存活会话的上下文压缩一遍。
压缩前的高峰时段往往要重新上传整段历史，提前压一次能省下不少输入 token。

## 行为

- **定时**：每天本地时间 `time`（默认 08:30）触发，压缩所有 `idle` 会话。
- **补压**：Host 启动时若当天已过定点且尚未压缩，稍等 `settleSeconds` 秒后补跑一次。
- **跳过忙碌**：正在跑回合或排队的会话不会被强压（记为 busy），
  之后按 `retries` × `retryMinutes` 重试，仍忙碌就等明天。
- **手动**：聊天里输入 `/compact-all` 立即执行一次，输出逐会话明细。
- **去重**：状态写在 profile 目录的 `.auto-compact-state.json`，同一天不会重复自动压缩。

## 配置

在 profile 的 `cordis.patch.yml` 里按 id 覆盖（bundle 自带的默认值）：

```yaml
- id: auto-compact
  config:
    time: '08:30'      # 本地时间 HH:mm
    catchUp: true      # 启动后补压当天遗漏
    target: all        # all=所有存活会话；roots=仅顶层会话
    retries: 2         # 忙碌会话的延迟重试次数
    retryMinutes: 10   # 每次重试间隔
    timeoutMinutes: 30 # 单会话压缩超时
    settleSeconds: 20  # 启动后等待 Host 就绪的时间
    gapMs: 250         # 两个会话之间的间隔，避免集中打满 provider
```

## 依赖：压缩引擎

压缩能力在 Web profile 里**不是 Host 服务的默认成员**：它一般挂在每个 Agent 的
preset 隔离组里（`agentPresets.serviceFor(agent, 'compaction')`）。本机装的
billion-context 会通过 `__BILI_DSH_COMPACTION_VERDICT__` 把 preset 内的
`compaction-basic` / `command-compact` 行改成 `disabled: true`，所以按 agent 解析会拿到
`undefined`。

因此本 bundle 的 `cordis.patch.yml` 先自己声明宿主级压缩引擎：

```yaml
- id: compaction-basic
  disabled: false
  config:
    auto: false   # 只保留手动/定时触发，避免与外部压缩方案重复压缩
```

`auto: false` 很重要：默认 `auto: true` 会在上下文压力达到阈值时自动压缩，
可能和 billion-context 的 ACP 压缩互相覆盖。插件运行时先按 agent 解析 preset 实例，
拿不到就回退到宿主级 `ctx.get('compaction')`；两者都没有时该会话记为
`unavailable` 并如实写进报告，不会中断其他会话。

## 状态文件

`<profile>/.auto-compact-state.json`：

```json
{
  "lastRunDay": "2026-11-02",
  "lastRunAt": "2026-11-02T01:49:40.850Z",
  "lastTrigger": "catch-up",
  "lastResults": [{ "sessionId": "session-…", "outcome": "compacted", "items": 630, "tokens": 225836 }]
}
```

`outcome` 取值：`compacted` / `nothing` / `busy` / `cancelled` / `timed-out` /
`unavailable` / `unsupported` / `changed` / `summary` / `commit` / `persistence`。
删除该文件并重新启用插件，可立即触发一次补压（调试用）。

## 验证方式

- `plugin_manager list_plugins` 里 `include:auto-compact` 应为 `fiberPhase: active`。
- 状态文件出现当天的 `lastRunDay` 与逐会话 `lastResults`。
- 报告中 `compacted` 行给出被摘要掉的历史条数与 token 数。
