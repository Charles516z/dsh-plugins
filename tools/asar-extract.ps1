param(
  [Parameter(Mandatory = $true)][string]$Path,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [string]$Asar = 'D:\Deepseek Harness\resources\app.asar'
)
$ErrorActionPreference = 'Stop'
$fs = [System.IO.File]::OpenRead($Asar)
try {
  $br = New-Object System.IO.BinaryReader($fs)
  $fs.Position = 4; $headerSize = $br.ReadUInt32()
  $fs.Position = 8; $headerBytes = $br.ReadBytes($headerSize)
  $jsonLen = [BitConverter]::ToUInt32($headerBytes, 4)
  $json = [System.Text.Encoding]::UTF8.GetString($headerBytes, 8, $jsonLen)
  $index = $json | ConvertFrom-Json
  $dataStart = 8 + $headerSize
  $script:files = @{}
  function Walk($node, $prefix) {
    foreach ($p in $node.files.PSObject.Properties) {
      $child = $p.Value
      if ($null -ne $child.files) { Walk $child ($prefix + '/' + $p.Name) }
      elseif ($null -ne $child.size) { $script:files[$prefix + '/' + $p.Name] = $child }
    }
  }
  Walk $index ''
  $key = if ($script:files.ContainsKey($Path)) { $Path } else { $null }
  if (-not $key) {
    $candidates = @($script:files.Keys | Where-Object { $_ -like "*$Path*" })
    if ($candidates.Count -ne 1) {
      Write-Output "NO UNIQUE MATCH for '$Path'. Candidates:"
      $candidates | Select-Object -First 30
      exit 2
    }
    $key = $candidates[0]
  }
  $entry = $script:files[$key]
  $bytes = New-Object byte[] ([int64]$entry.size)
  $fs.Position = [int64]$dataStart + [int64]$entry.offset
  $read = 0
  while ($read -lt $bytes.Length) {
    $n = $fs.Read($bytes, $read, $bytes.Length - $read)
    if ($n -le 0) { break }
    $read += $n
  }
  $null = New-Item -ItemType Directory -Force -Path $OutDir
  $name = [System.IO.Path]::GetFileName($key)
  $out = Join-Path $OutDir $name
  [System.IO.File]::WriteAllBytes($out, $bytes)
  Write-Output ("EXTRACTED $key -> $out (" + $bytes.Length + " bytes)")
} finally {
  $fs.Close()
}
