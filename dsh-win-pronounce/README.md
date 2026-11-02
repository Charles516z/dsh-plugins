# dsh-win-pronounce

**让助手真的开口说话 —— 用的是你机器上已经装好的 Windows 语音，一个字都不出网。**

DeepSeek Harness（DSH）插件。在对话框输入栏的权限控件右边加一枚喇叭键，打开后助手就能用本机语音念短句；音源、语速、音量都能在弹层里改，SAPI 桌面语音和 OneCore 语音一并列出。

> 只调用本机 TTS（`System.Speech` 与 WinRT `Windows.Media.SpeechSynthesis`），没有网络请求，没有额外的模型调用。关掉开关，宿主侧连 `speak` 工具都会注销。

## 安装

从源码目录安装：

```sh
dsh plugin add E:\path\to\dsh-win-pronounce
```

或者在桌面端：**设置 → 插件**里选择本地目录安装，然后在插件列表里开启 **语音播报 / Voice output**。装完即生效，不需要重启。

## 效果

- 输入栏工具行里、权限控件**右边紧邻**的位置多一枚喇叭图标（槽位 `conversation.input.left`，`order: 10`）。
- 开启时图标是品牌色 + 两道声波；关闭时是带叉的静音喇叭。状态一望即知。
- 点开弹层：总开关、音源下拉（按 **SAPI 桌面语音 / OneCore 语音** 分组）、语速、音量、试听 / 停止 / 刷新。
- 弹层贴着按键向上展开，点外面或按 `Esc` 关闭。

## 它做了什么

| 部件 | 行为 |
| --- | --- |
| 喇叭按键 | 纯前端按钮，状态来自宿主 `GET /dsh-win-pronounce/state` |
| 弹层 | 开关与音源改动即时 `POST`，语速/音量拖动 220ms 防抖后提交；打开期间 2.5s 轮询一次，朗读时状态行显示「正在朗读…」 |
| `speak` 工具 | **只在开关打开时注册**：助手说一句就返回，不等待播完（不阻塞回合） |
| 系统提示 | 开关打开时附带一小段 prompt，提醒「只念短句、不念代码和表格」 |
| 持久化 | 开关、音源、语速、音量写进 `<profile>/.dsh-win-pronounce.json`，重启后保持 |

`speak` 的入参只有 `text`（超过 1200 字符会被截断），返回值 `{ ok, spoken, voice, error }`。

## 音源是怎么来的

`assets/voices.ps1` 负责枚举，`assets/speak.ps1` 负责发声，两者都跑在系统自带的 `powershell.exe`（Windows PowerShell 5.1）：

| 音源 | 枚举方式 | 发声方式 |
| --- | --- | --- |
| SAPI 桌面语音 | `System.Speech.Synthesis.SpeechSynthesizer.GetInstalledVoices()` | 直接 `Speak()`，阻塞到说完 |
| OneCore 语音 | WinRT `SpeechSynthesizer.AllVoices` | 先合成到临时 WAV，再用 `SoundPlayer.PlaySync()` 播放，结束后删除 |

为什么要两个来源：OneCore 里那些「新版」语音（比如中文的 Huihui / Yaoyao / Kangkang）在 SAPI 里根本看不到，只能通过 WinRT 投影拿到；反过来，SAPI 需要完整 .NET Framework 程序集，而 OneCore 需要 `System.Runtime.WindowsRuntime` 的异步桥。两条路各自都能跑通，就都保留了。

细节：

- 用户文本以 **base64** 传给脚本，彻底避开引号、换行和代码页问题（脚本本身全 ASCII）。
- 整段朗读是**一个子进程**，「停止」直接 `kill`，声音当场停住，不会拖到下一句。
- 语速 0.6×–1.8×：SAPI 换算成 `-4..8` 的 `Rate`，OneCore 直接用倍数；音量统一 0–1。

想增加音源：**设置 → 时间和语言 → 语音 → 添加语音**，装完后点弹层里的「刷新」即可出现在下拉里。

## 路由

同源，只给本页用。POST 必须带 `x-dsh-win-pronounce: 1` 头，且 `Origin` 的 host 与 `Host` 一致，否则一律拒绝：

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/dsh-win-pronounce/state` | 开关、音源列表、语速、音量、是否正在朗读 |
| POST | `/dsh-win-pronounce/config` | 改开关 / 音源 / 语速 / 音量 |
| POST | `/dsh-win-pronounce/preview` | 用当前音源试听一句（按语音语言选中文或英文样句） |
| POST | `/dsh-win-pronounce/stop` | 立刻停止当前朗读 |
| POST | `/dsh-win-pronounce/refresh` | 重新枚举本机语音 |

## 结构

```
index.js             宿主半边：路由、状态、speak 工具、子进程控制
client.js            客户端半边：喇叭键 + 弹层（window.__ModuleLoader__.load）
lib/util.js          profile 目录、状态文件路径、数值 clamp
lib/state.js         状态读写（.tmp + rename，失败静默）
lib/tts.js           枚举语音、拼 powershell 命令行
assets/voices.ps1    枚举 SAPI + OneCore 语音，输出 JSON
assets/speak.ps1     按 id 前缀分流，SAPI 直读 / OneCore 合成后播放
locale/{zh,en}.json  插件列表里的标题与描述
icon.svg             原创图标
cordis.patch.yml     insert: dsh-win-pronounce
```

客户端半边不 require 任何 Harness 私有包，只用 `react`、`--dsw-alias-*` 主题 token 和自带的 `fetch`；弹层通过 `createPortal` 挂到 `document.body`，免得被输入区容器的 `transform` / `filter` 裁掉。

## 已知限制

- **仅 Windows**：依赖 `System.Speech`、WinRT 语音合成与 `powershell.exe`。
- 一次只播一段：新的朗读会先停掉上一段。
- 只适合短句：整段朗读会占用一个 `powershell.exe` 进程，长文本没意义也不该念。

## English

A DeepSeek Harness plugin that speaks through the Windows voices already installed on the machine. One speaker button sits beside the permission control in the composer tool row; enabling it registers a `speak` tool the agent can call with a short line of text, and disabling it removes the tool and its prompt again. Voices from both SAPI (`System.Speech`) and OneCore (WinRT `Windows.Media.SpeechSynthesis`) are listed together, with rate, volume, preview, and stop controls in the same popover. Everything stays local: no network calls, no extra model requests. Windows only.

## License

MIT © Charles516z
