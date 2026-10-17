# Starts this Expo app on an Android emulator only after the emulator console
# and Metro are actually reachable. Avoids the two recurring failures:
#   - TCP 5554 connection refused (Expo talks to the emulator before it is up)
#   - "No apps connected" (reload is sent before Expo Go has attached)
$ErrorActionPreference = "Stop"

$sdk = $env:ANDROID_HOME
if (-not $sdk) { $sdk = $env:ANDROID_SDK_ROOT }
if (-not $sdk) { $sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk" }

$adb = Join-Path $sdk "platform-tools\adb.exe"
$emulator = Join-Path $sdk "emulator\emulator.exe"
if (-not (Test-Path $adb)) {
  throw "adb.exe was not found at $adb. Install Android Studio and set ANDROID_HOME."
}

function Get-BootedEmulator {
  $lines = & $adb devices
  foreach ($line in $lines) {
    if ($line -match "^(emulator-\d+)\s+device\s*$") {
      return $Matches[1]
    }
  }
  return $null
}

function Wait-BootCompleted([string]$serial) {
  for ($i = 0; $i -lt 90; $i++) {
    $boot = (& $adb -s $serial shell getprop sys.boot_completed 2>$null)
    if ($boot -and $boot.Trim() -eq "1") {
      $portOpen = $false
      try {
        $client = New-Object System.Net.Sockets.TcpClient
        $iar = $client.BeginConnect("127.0.0.1", 5554, $null, $null)
        $portOpen = $iar.AsyncWaitHandle.WaitOne(500, $false) -and $client.Connected
        $client.Close()
      } catch {
        $portOpen = $false
      }
      if ($portOpen) { return }
    }
    Start-Sleep -Seconds 2
  }
  throw "Emulator $serial did not finish booting (port 5554 never opened)."
}

& $adb start-server | Out-Null

$serial = Get-BootedEmulator
if (-not $serial) {
  if (-not (Test-Path $emulator)) {
    throw "No emulator is running and emulator.exe was not found at $emulator. Start Medium_Phone from Android Studio, then run this again."
  }
  Write-Host "Starting Medium_Phone. Wait until the Android home screen appears."
  Start-Process -FilePath $emulator -ArgumentList @("-avd", "Medium_Phone") | Out-Null
  for ($i = 0; $i -lt 90; $i++) {
    $serial = Get-BootedEmulator
    if ($serial) { break }
    Start-Sleep -Seconds 2
  }
  if (-not $serial) {
    throw "Medium_Phone did not show up in 'adb devices'. Start it from Android Studio Device Manager."
  }
}

Write-Host "Waiting for $serial to finish booting..."
Wait-BootCompleted $serial
& $adb -s $serial reverse tcp:8081 tcp:8081 | Out-Null
Write-Host "adb reverse is set. Metro will open the app once. Do not press r until the UI is on screen."

$env:NODE_OPTIONS = "--dns-result-order=ipv4first"
npx expo start --localhost --android
