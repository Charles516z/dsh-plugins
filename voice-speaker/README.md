# 语音播报 · Voice output

在对话框的工具行里、权限控件右边多一个喇叭按键。打开以后，助手就可以用这台电脑上安装的 Windows 语音朗读简短内容；关掉就完全静音。

## 它做什么

- **按键**：`conversation.input.left` 槽位里的一枚喇叭图标，紧跟在权限控件之后。开启时图标变成品牌色并带声波，关闭时是带叉的静音喇叭。
- **弹层**：开关、音源下拉（按 SAPI / OneCore 分组）、语速、音量、「试听 / 停止 / 刷新」。弹层贴着按键向上展开，点外面或按 Esc 关闭。
- **`speak` 工具**：只在开关打开时注册。助手调它说一句话就返回，不等待播完；同时注册一小段系统提示，提醒它只说短句、不念代码和表格。
- **持久化**：开关、音源、语速、音量保存在 `<profile>/.voice-speaker.json`，重启后保持原样。

## 音源是怎么来的

`assets/voices.ps1` 枚举两类本机语音，`assets/speak.ps1` 负责发声：

| 音源 | 枚举方式 | 发声方式 |
| --- | --- | --- |
| SAPI 桌面语音 | `System.Speech.Synthesis.SpeechSynthesizer.GetInstalledVoices()` | 直接 `Speak()`，阻塞到说完 |
| OneCore 语音 | WinRT `SpeechSynthesizer.AllVoices` | 先合成到临时 WAV，再用 `SoundPlayer.PlaySync()` 播放，结束后删除 |

两者都跑在 `powershell.exe`（Windows PowerShell 5.1）里，因为 OneCore 语音只能通过 WinRT 投影拿到，SAPI 需要完整 .NET Framework 程序集。用户文本以 base64 传给脚本，避开引号和代码页问题；整段朗读是一个子进程，「停止」直接杀掉这个进程，声音会在当下停住。

## 路由

同源、只给本页用，POST 都要求 `x-dsh-voice-speaker: 1` 头并且来源主机与 `Host` 一致：

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/voice-speaker/state` | 开关、音源列表、语速、音量、是否正在朗读 |
| POST | `/voice-speaker/config` | 改开关 / 音源 / 语速 / 音量 |
| POST | `/voice-speaker/preview` | 用当前音源试听一句 |
| POST | `/voice-speaker/stop` | 立刻停止当前朗读 |
| POST | `/voice-speaker/refresh` | 重新枚举本机语音 |

## 说明

- 只调用本机语音，不出网。
- 语速范围 0.6×–1.8×；SAPI 会换算成 -4..8 的 `Rate`，OneCore 直接用倍数。
- 关掉开关时正在朗读的内容会立即停止，`speak` 工具也会注销。
