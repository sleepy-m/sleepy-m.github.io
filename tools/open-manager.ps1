$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (!(Test-Path -LiteralPath $nodePath)) { throw '未找到 Node.js，请安装 Node.js LTS。' }
if (!(Test-Path -LiteralPath 'node_modules/hexo/bin/hexo')) { throw '博客依赖缺失，请先恢复依赖。' }
$managerUrl = 'http://127.0.0.1:4318/'
try {
  $existingManager = Invoke-RestMethod ($managerUrl + 'api/bootstrap') -TimeoutSec 2
  if ($existingManager.token -and $null -ne $existingManager.entries) {
    Start-Process $managerUrl
    exit 0
  }
} catch {}
$managerPath = Join-Path (Get-Location) 'tools\manager.cjs'
$logDir = Join-Path (Get-Location) '.local'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$managerProcess = Start-Process -FilePath $nodePath -ArgumentList @('"' + $managerPath + '"') -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'manager.log') -RedirectStandardError (Join-Path $logDir 'manager-error.log') -PassThru
for ($attempt = 0; $attempt -lt 25; $attempt++) {
  try {
    $readyManager = Invoke-RestMethod ($managerUrl + 'api/bootstrap') -TimeoutSec 1
    if ($readyManager.token -and $null -ne $readyManager.entries) {
      Start-Process $managerUrl
      Write-Host '博客管理已打开，可以关闭此窗口。'
      exit 0
    }
  } catch {}
  if ($managerProcess.HasExited) { throw '启动失败，请查看 .local/manager-error.log。' }
  Start-Sleep -Milliseconds 200
}
throw '管理工具暂未启动，请查看 .local/manager-error.log。'
