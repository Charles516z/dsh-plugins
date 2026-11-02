# C 盘清理（@local/disk-clean）

给 DeepSeek Harness 用的 C 盘自动清理插件：扫描临时文件、浏览器缓存、回收站、崩溃转储等垃圾，只删除缓存类文件；按计划自动清理，也可以双击桌面快捷方式随时手动清理。

## 用起来

- 设置 → **C 盘清理**：看空间、扫描、勾选、清理；设置定时时间与「空间不足时也清理」。
- 定时清理默认开启：**工作日（周一至周五）21:00**、**周末（周六、周日）02:00**，由 Windows 计划任务执行——Harness 没开也会清理，到点时电脑关着会在下次开机后尽快补跑。
- 桌面上的 **清理C盘** 快捷方式：双击立即清理一次（弹窗报告释放量）。Harness 没开时会退回 `node` 直接清理；两者都不可用时提示先启动 Harness。
- 直接对助手说「看看 C 盘还能清理多少」「清理 C 盘」，助手会调用 `clean_c_disk` 工具（默认只预览，`confirm: true` 才真删）。
- 「空间不足时清理」默认关闭，需要时在设置页打开并设定阈值（默认 8 GB），避免和固定时点重复触发。

## 定时与快捷方式

- 配置结构：`schedule.weekdaysAt` / `schedule.weekendAt`（`HH:MM`，空串表示关闭该时段）；`guard.enabled` / `guard.thresholdGb` / `guard.checkIntervalMin`。
- 计划任务：`DSH-DiskClean-Weekdays`（周一至周五）与 `DSH-DiskClean-Weekend`（周六、周日），动作是隐藏运行的 `wscript clean-now.vbs -Quiet`，带 `StartWhenAvailable`；改时间或关闭自动清理会同步注册/删除这两个任务。
- 定时触发时优先走宿主 HTTP（Harness 开着），否则直接用 `node bin/clean-now.mjs --scheduled` 清理；静默运行的结果写进 `<profile>/.disk-clean/clean.log`。
- 交错保护：HTTP 清理任务同一时刻只允许一个，计划任务与页面/工具同时触发时后到的会收到 busy，不会重复删除。
- 页面里的进程内调度器保留为兜底：计划任务注册失败（无权限等）时，仍会在 Harness 运行时按时间补跑，错过超过 12 小时则跳过。
- 快捷方式由 `POST /disk-clean/shortcut` 生成：`<profile>/.disk-clean/clean-now.ps1` + `clean-now.vbs`，桌面 `清理C盘.lnk` 指向 `wscript.exe`（隐藏窗口），图标取自 `cleanmgr.exe`。
- 触发来源会记录在历史里：`schedule`（定时）、`guard`（空间不足）、`shortcut`（桌面快捷方式）、`manual`（设置页/接口）、`tool`（助手工具）。

## 安全边界

- 只删白名单目录**内部**的文件，绝不删目录本身，也不碰文档、下载、桌面、程序目录。
- 不跟随符号链接/联接点；跳过被占用和无权限的文件并计数。
- 每个类别有最小保留时间（临时文件 1 小时，其余 0）；`Windows.old`、`Prefetch`、更新缓存等默认关闭且需要管理员。
- 状态写在 `<profile>/.disk-clean-state.json`（配置 + 最近 20 条清理记录）。

## 清理类别

| id | 说明 | 默认 |
| --- | --- | --- |
| user-temp / win-temp | 用户与系统临时文件 | 开 |
| recycle-bin | 回收站 | 开 |
| browser-cache | Chrome / Edge / Brave 等缓存 | 开 |
| crash-dumps | 崩溃转储、MEMORY.DMP | 开 |
| thumbnail-cache | 缩略图/图标缓存 | 开 |
| wer | Windows 错误报告 | 开 |
| dev-cache | npm / Yarn / pnpm 缓存 | 关 |
| update-cache / delivery-optimization / prefetch | 系统缓存 | 关（需管理员） |
| windows-old | 旧系统备份 | 关（高风险） |

## 接口

宿主注册（同源 HTTP，POST 需带 `x-dsh-disk-clean: 1` 头；快捷方式另带 `x-dsh-disk-clean-source: shortcut`）：

- `GET /disk-clean/state` — 磁盘、配置、类别、上次扫描/清理、任务进度
- `POST /disk-clean/scan` — 后台扫描 `{ categories?: string[] }`
- `POST /disk-clean/clean` — 后台清理 `{ categories?: string[], minAgeHours?: number }`
- `POST /disk-clean/config` — 保存配置
- `POST /disk-clean/shortcut` — 重建桌面快捷方式

宿主工具：`clean_c_disk`（`action: status | scan | clean`，`clean` 需 `confirm: true`）。
