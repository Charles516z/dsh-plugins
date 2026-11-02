$ErrorActionPreference = 'Stop'

# The Node half reads this stream as UTF-8; without this, voice names arrive in
# the console code page and non-ASCII names would be mangled.
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

# Enumerates every local speech source this machine can voice through:
#   sapi    - SAPI 5 desktop voices, played by System.Speech
#   onecore - the newer Windows OneCore voices, played by WinRT + SoundPlayer
# The Node half parses the single line starting with @@VOICES@@.

$voices = New-Object System.Collections.ArrayList

try {
  Add-Type -AssemblyName System.Speech
  $sapi = New-Object System.Speech.Synthesis.SpeechSynthesizer
  foreach ($entry in @($sapi.GetInstalledVoices())) {
    if (-not $entry.Enabled) { continue }
    $info = $entry.VoiceInfo
    [void]$voices.Add([pscustomobject]@{
        engine = 'sapi'
        id     = ('sapi:' + $info.Name)
        name   = $info.Name
        lang   = $info.Culture.Name
        gender = [string]$info.Gender
      })
  }
  $sapi.Dispose()
} catch {
  [Console]::Error.WriteLine('sapi enumeration failed: ' + $_.Exception.Message)
}

try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime] | Out-Null
  foreach ($voice in [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices) {
    [void]$voices.Add([pscustomobject]@{
        engine = 'onecore'
        id     = ('onecore:' + $voice.Id)
        name   = $voice.DisplayName
        lang   = $voice.Language
        gender = [string]$voice.Gender
      })
  }
} catch {
  [Console]::Error.WriteLine('onecore enumeration failed: ' + $_.Exception.Message)
}

$payload = [pscustomobject]@{ voices = @($voices) }
$json = ConvertTo-Json -InputObject $payload -Compress -Depth 5
Write-Output ('@@VOICES@@' + $json)
