# Run only on an ephemeral Windows CI runner. Exercise the applications installed by both unsigned deliverables.
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows') {
  throw 'Windows installer smoke requires a disposable hosted Windows runner.'
}

function Require-SingleFile($directory, $filter, $label) {
  $files = @(Get-ChildItem -LiteralPath $directory -File -Filter $filter)
  if ($files.Count -ne 1) { throw "Expected exactly one $label." }
  return $files[0]
}

function Invoke-CheckedProcess($file, $arguments, $label) {
  Write-Output "Starting $label."
  $process = Start-Process -FilePath $file -ArgumentList $arguments -PassThru
  try {
    if (-not $process.WaitForExit(180000)) {
      try { $process.Kill($true) } catch { Write-Warning "$label process termination failed." }
      throw "$label did not complete within three minutes."
    }
    if ($process.ExitCode -ne 0) { throw "$label exited with code $($process.ExitCode)." }
    Write-Output "$label completed."
  } finally {
    $process.Dispose()
  }
}

function Assert-InstalledArchive($executable, $expectedHash, $label) {
  if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) { throw "$label executable missing." }
  $archive = Join-Path (Split-Path $executable) 'resources/app.asar'
  if (-not (Test-Path -LiteralPath $archive -PathType Leaf)) { throw "$label application archive missing." }
  $actualHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
  if ($actualHash -ne $expectedHash) { throw "$label archive differs from the verified build." }
  node bin/test-tools/verify-effective-fuses.cjs $executable
  if ($LASTEXITCODE -ne 0) { throw "$label effective Electron fuses differ from the unsigned build contract." }
}

function Invoke-PackagedSmoke($executable, $label) {
  Write-Output "Starting $label packaged account smoke."
  node bin/test-tools/packaged-account-smoke.cjs $executable
  if ($LASTEXITCODE -ne 0) { throw "$label packaged account smoke failed." }
  Write-Output "$label packaged account smoke completed."
}

# Hosted Windows may already be enrolled. An absent user policy cannot prove an unmanaged device,
# so give every installed startup an owned positive policy and assert the exact managed result.
function Invoke-ManagedPackagedSmoke($executable, $label, $authenticatedProxy = $false) {
  $policy = 'HKCU:\SOFTWARE\Policies\Wire'
  $existing = Get-ItemProperty -Path $policy -Name applockOverride -ErrorAction SilentlyContinue
  if ($null -ne $existing) { throw 'Refusing to replace existing managed policy.' }
  New-Item -Path $policy -Force | Out-Null
  try {
    New-ItemProperty -Path $policy -Name applockOverride -PropertyType DWord -Value 1 | Out-Null
    $env:M3_EXPECT_APPLOCK_OVERRIDE = 'true'
    if ($authenticatedProxy) { $env:M3_AUTHENTICATED_PROXY = 'true' }
    Invoke-PackagedSmoke $executable $label
  } finally {
    Remove-ItemProperty -Path $policy -Name applockOverride -ErrorAction SilentlyContinue
    Remove-Item Env:M3_EXPECT_APPLOCK_OVERRIDE -ErrorAction SilentlyContinue
    Remove-Item Env:M3_AUTHENTICATED_PROXY -ErrorAction SilentlyContinue
  }
}

$archives = @(Get-ChildItem -Path 'wrap/build' -Recurse -File -Filter 'app.asar')
if ($archives.Count -ne 1) { throw 'Expected one verified unpacked application archive.' }
$archive = $archives[0]

$metadataJson = node -e 'const asar=require("@electron/asar");const wire=JSON.parse(asar.extractFile(process.argv[1],"electron/wire.json").toString("utf8"));process.stdout.write(JSON.stringify({name:wire.name,nameShort:wire.nameShort}));' $archive.FullName
if ($LASTEXITCODE -ne 0) { throw 'Packaged identity could not be read.' }
$metadata = $metadataJson | ConvertFrom-Json
if ($metadata.name -cnotmatch '^[A-Za-z0-9._-]+$' -or $metadata.nameShort -cnotmatch '^[A-Za-z0-9._-]+$') {
  throw 'Packaged Windows product name must be a safe path component.'
}
$expectedHash = (Get-FileHash -LiteralPath $archive.FullName -Algorithm SHA256).Hash
$setup = Require-SingleFile 'wrap/dist' '*-Setup.exe' 'Squirrel setup'
$msi = Require-SingleFile 'wrap/dist' '*.msi' 'MSI'
New-Item -ItemType Directory -Path test-results -Force | Out-Null

# Squirrel owns a per-user directory. Its installed updater must exist alongside the app version.
$squirrelRoot = Join-Path $env:LOCALAPPDATA $metadata.nameShort
if (Test-Path -LiteralPath $squirrelRoot) { throw 'Refusing to replace an existing Squirrel installation.' }
$squirrelFailure = $null
try {
  Invoke-CheckedProcess $setup.FullName @('--silent') 'Squirrel setup'
  $updater = Join-Path $squirrelRoot 'Update.exe'
  if (-not (Test-Path -LiteralPath $updater -PathType Leaf)) { throw 'Squirrel installed updater missing.' }
  $versions = @(Get-ChildItem -LiteralPath $squirrelRoot -Directory -Filter 'app-*')
  $applications = @($versions | ForEach-Object { Join-Path $_.FullName ($metadata.name + '.exe') } | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf })
  if ($applications.Count -ne 1) { throw 'Expected one installed Squirrel application version.' }
  Assert-InstalledArchive $applications[0] $expectedHash 'Squirrel installed'
  Invoke-ManagedPackagedSmoke $applications[0] 'Squirrel installed'
} catch { $squirrelFailure = $_ }
try {
  $updater = Join-Path $squirrelRoot 'Update.exe'
  if (Test-Path -LiteralPath $updater -PathType Leaf) {
    Invoke-CheckedProcess $updater @('--uninstall', '--silent') 'Squirrel uninstall'
  }
} catch {
  if ($squirrelFailure) { Write-Warning "Squirrel cleanup also failed: $($_.Exception.Message)" }
  else { $squirrelFailure = $_ }
}
if ($squirrelFailure) { throw $squirrelFailure }

# The managed MSI installs per machine. Inspect its own executable, then remove it by package.
$msiRoot = Join-Path $env:ProgramFiles $metadata.name
if (Test-Path -LiteralPath $msiRoot) { throw 'Refusing to replace an existing MSI installation.' }
$msiLog = Join-Path (Resolve-Path test-results) 'windows-msi-install.log'
$msiFailure = $null
try {
  $installArgs = @('/i', ('"' + $msi.FullName + '"'), '/qn', '/norestart', '/l*v', ('"' + $msiLog + '"'))
  Invoke-CheckedProcess 'msiexec.exe' $installArgs 'MSI install'
  $application = Join-Path $msiRoot ($metadata.name + '.exe')
  Assert-InstalledArchive $application $expectedHash 'MSI installed'
  Invoke-ManagedPackagedSmoke $application 'MSI installed'
  Invoke-ManagedPackagedSmoke $application 'MSI installed managed/proxy' $true
} catch { $msiFailure = $_ }
try {
  if (Test-Path -LiteralPath $msiRoot) {
    $uninstallArgs = @('/x', ('"' + $msi.FullName + '"'), '/qn', '/norestart', '/l*v', ('"' + $msiLog + '"'))
    Invoke-CheckedProcess 'msiexec.exe' $uninstallArgs 'MSI uninstall'
  }
} catch {
  if ($msiFailure) { Write-Warning "MSI cleanup also failed: $($_.Exception.Message)" }
  else { $msiFailure = $_ }
}
if ($msiFailure) { throw $msiFailure }
Write-Output 'Installed Squirrel and MSI packaged-account smoke passed.'
