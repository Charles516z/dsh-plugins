param(
  [Parameter(Mandatory = $true)][string]$VoiceB64,
  [Parameter(Mandatory = $true)][string]$TextB64,
  [string]$Rate = '1',
  [string]$Volume = '1'
)

# Speaks one utterance with a local Windows voice and blocks until it finishes,
# so the Node half can stop the whole process to interrupt the sound.
# Everything user-provided arrives base64 encoded: no quoting or encoding hazards.

$ErrorActionPreference = 'Stop'
$invariant = [System.Globalization.CultureInfo]::InvariantCulture
$rateValue = [double]::Parse($Rate, $invariant)
$volumeValue = [double]::Parse($Volume, $invariant)
if ($volumeValue -lt 0) { $volumeValue = 0 }
if ($volumeValue -gt 1) { $volumeValue = 1 }

$voice = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($VoiceB64))
$text = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($TextB64))

$separator = $voice.IndexOf(':')
if ($separator -gt 0) {
  $kind = $voice.Substring(0, $separator)
  $name = $voice.Substring($separator + 1)
} else {
  $kind = 'sapi'
  $name = $voice
}

if ($kind -ne 'onecore') {
  Add-Type -AssemblyName System.Speech
  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
  try {
    $installed = @($synth.GetInstalledVoices())
    $chosen = $null
    foreach ($entry in $installed) {
      if ($entry.VoiceInfo.Name -eq $name) { $chosen = $entry.VoiceInfo.Name; break }
    }
    if (-not $chosen -and $installed.Count -gt 0) { $chosen = $installed[0].VoiceInfo.Name }
    if ($chosen) { $synth.SelectVoice($chosen) }

    # System.Speech speaks on a -10..10 scale; the plugin stores a 0.5..2 multiplier.
    $sapiRate = [int][math]::Round(($rateValue - 1) * 10)
    if ($sapiRate -lt -10) { $sapiRate = -10 }
    if ($sapiRate -gt 10) { $sapiRate = 10 }
    $synth.Rate = $sapiRate
    $synth.Volume = [int][math]::Round($volumeValue * 100)
    $synth.Speak($text)
  } finally {
    $synth.Dispose()
  }
  exit 0
}

Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime] | Out-Null

$info = $null
foreach ($candidate in [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices) {
  if ($candidate.Id -eq $name) { $info = $candidate; break }
}
$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
if ($info) {
  # WinRT activation does not accept a constructor argument through New-Object;
  # the Voice property carries the selection instead.
  try { $synth.Voice = $info } catch { }
}

$speakRate = $rateValue
if ($speakRate -lt 0.5) { $speakRate = 0.5 }
if ($speakRate -gt 3) { $speakRate = 3 }
try { $synth.Options.SpeakingRate = $speakRate } catch { }
try { $synth.Options.AudioVolume = $volumeValue } catch { }

$operation = $synth.SynthesizeTextToStreamAsync($text)
$asTask = @([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and
    $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]
$task = $asTask.MakeGenericMethod([Windows.Media.SpeechSynthesis.SpeechSynthesisStream]).Invoke($null, @($operation))
if (-not $task.Wait(30000)) { throw 'speech synthesis timed out' }
$stream = $task.Result
$netStream = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream)

$path = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), ('dsh-voice-' + [guid]::NewGuid().ToString('N') + '.wav'))
$file = [System.IO.File]::Create($path)
try {
  $netStream.CopyTo($file)
} finally {
  $file.Close()
  $netStream.Close()
}

try {
  $player = New-Object System.Media.SoundPlayer $path
  $player.PlaySync()
} finally {
  Remove-Item -LiteralPath $path -ErrorAction SilentlyContinue
}
