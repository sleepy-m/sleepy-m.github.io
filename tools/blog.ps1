param([ValidateSet('preview','new','publish','build')][string]$Action = 'preview')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (!(Test-Path -LiteralPath $nodePath)) { throw '未找到 Node.js，请安装 Node.js LTS 后重试。' }
$hexoPath = Join-Path (Get-Location) 'node_modules\hexo\bin\hexo'
if (!(Test-Path -LiteralPath $hexoPath)) { throw '依赖尚未安装，请查看 README.md。' }
function Invoke-Hexo([string[]]$HexoArgs) {
  & $nodePath $hexoPath @HexoArgs
  if ($LASTEXITCODE -ne 0) { throw '博客命令执行失败。' }
}
switch ($Action) {
  'preview' {
    Write-Host '预览地址：http://127.0.0.1:4000 ，按 Ctrl+C 停止。'
    Invoke-Hexo @('server','--ip','127.0.0.1')
  }
  'new' {
    $postTitle = Read-Host '文章标题'
    if ([string]::IsNullOrWhiteSpace($postTitle)) { throw '标题不能为空。' }
    if ($postTitle.IndexOfAny([IO.Path]::GetInvalidFileNameChars()) -ge 0) { throw '标题不能包含斜线、冒号等文件名特殊字符。' }
    if (Test-Path -LiteralPath "source/_posts/$postTitle.md") { throw '同名文章已经存在，请更换标题。' }
    Invoke-Hexo @('new',$postTitle)
    Invoke-Item "source/_posts/$postTitle.md"
  }
  'build' { Invoke-Hexo @('generate') }
  'publish' {
    & git remote get-url origin
    if ($LASTEXITCODE -ne 0) { throw '尚未关联 GitHub 仓库，请先完成首次发布设置。' }
    Invoke-Hexo @('generate')
    Write-Host '即将公开发布以下修改：'
    & git status --short
    $answer = Read-Host '确认内容适合公开？输入 y 继续'
    if ($answer -ne 'y') { Write-Host '已取消发布。'; exit 0 }
    & git add --all
    if ($LASTEXITCODE -ne 0) { throw '保存修改失败。' }
    & git diff --cached --quiet
    if ($LASTEXITCODE -eq 1) {
      & git commit -m 'Update blog'
      if ($LASTEXITCODE -ne 0) { throw '提交失败，请检查 Git 身份配置。' }
    } elseif ($LASTEXITCODE -ne 0) { throw '检查修改失败。' }
    & git push origin main
    if ($LASTEXITCODE -ne 0) { throw '推送失败，请检查网络和 GitHub 登录。' }
    Write-Host '已推送。GitHub Actions 正在构建，请在仓库 Actions 页面检查发布结果。'
  }
}
