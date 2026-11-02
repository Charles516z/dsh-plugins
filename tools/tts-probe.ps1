$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech

'=== SAPI (System.Speech) voices ==='
$sapi = New-Object System.Speech.Synthesis.SpeechSynthesizer
foreach ($v in $sapi.GetInstalledVoices()) {
  $i = $v.VoiceInfo
  '  {0} | {1} | {2} | enabled={3}' -f $i.Name, $i.Culture.Name, $i.Gender, $v.Enabled
}

'=== OneCore (WinRT) voices ==='
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType=WindowsRuntime] | Out-Null
$all = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices
foreach ($v in $all) {
  '  {0} | {1} | {2} | {3}' -f $v.DisplayName, $v.Language, $v.Gender, $v.Id
}

'=== OneCore option properties ==='
$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$optionNames = @($synth.Options | Get-Member -MemberType Property | Select-Object -ExpandProperty Name)
($optionNames -join ', ')

'=== OneCore synthesis ==='
try {
  $synth.Options.SpeakingRate = 1.0
  $synth.Options.AudioVolume = 1.0
  '  rate/volume settable: yes'
} catch {
  '  rate/volume settable: no (' + $_.Exception.Message + ')'
}
$op = $synth.SynthesizeTextToStreamAsync('你好，我是本机自带的语音引擎。')
$asTask = @([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]
$task = $asTask.MakeGenericMethod([Windows.Media.SpeechSynthesis.SpeechSynthesisStream]).Invoke($null, @($op))
if (-not $task.Wait(15000)) { throw 'synthesis timed out' }
$stream = $task.Result
$netStream = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream)
$wav = Join-Path $env:TEMP 'dsh-tts-probe.wav'
$file = [System.IO.File]::Create($wav)
$netStream.CopyTo($file)
$file.Close()
$netStream.Close()
'  wav bytes: ' + (Get-Item $wav).Length

'=== play OneCore wav ==='
$player = New-Object System.Media.SoundPlayer $wav
$player.PlaySync()

'=== SAPI speak ==='
$voiceName = $null
foreach ($v in $sapi.GetInstalledVoices()) {
  if ($v.VoiceInfo.Culture.Name -like 'zh*') { $voiceName = $v.VoiceInfo.Name; break }
}
if ($voiceName) {
  $sapi.SelectVoice($voiceName)
  '  using: ' + $voiceName
  $sapi.Rate = 0
  $sapi.Volume = 100
  $sapi.Speak('你好，这是系统朗读测试。')
} else {
  '  no Chinese SAPI voice'
}
$sapi.Dispose()
'=== done ==='
