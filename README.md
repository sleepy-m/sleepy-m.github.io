# 个人博客

使用 Hexo + NexT + GitHub Pages，本机配有可视化博客管理工具。文章底层仍使用 Markdown。

## 日常使用

双击 `打开博客管理.cmd`，自动打开 http://127.0.0.1:4318/ 。
选择文章修改，或点击“写新文章”，直接排版和插入图片。草稿自动保存，写完点击“发布到博客”。
复用本机 GitHub 登录，无需安装第三方 GitHub App。发布成功后等待自动构建更新网站。
管理工具只监听本机回环地址，换电脑需要安装依赖和登录 GitHub。
`.local/drafts` 是本机草稿，`.local/uploads` 是未发布图片，`.local/backups` 保存编辑前的文章副本。这些目录不会推送到 GitHub，请单独备份。
公开文章在 `source/_posts`，发布的图片在 `source/uploads`。删除文章等高级操作仍可通过源码维护。

### 可选的本地编辑方式

1. 双击 `新建文章.cmd`，填写标题，用编辑器修改生成的 Markdown 文件。
2. 双击 `本地预览.cmd`，打开 http://127.0.0.1:4000 。预览窗口保持运行，停止时按 Ctrl+C。
3. 双击 `发布博客.cmd`，核对修改并确认发布。GitHub Actions 成功后网站更新。

文章在 `source/_posts`，个人介绍在 `source/about/index.md`。
博客名称、作者和网址在 `_config.yml`，导航和主题在 `_config.next.yml`。
示例文章可以直接修改或删除。

## 网站与发布

已于 2026-10-13 发布到 https://sleepy-m.github.io/ ，仓库为 https://github.com/sleepy-m/sleepy-m.github.io 。
账号使用本机已登录的 `sleepy-m`。GitHub Pages 已设置为 GitHub Actions 自动构建。
`.github/workflows/pages.yml` 已配置自动构建发布，不需要手工上传 public。
所有推送到公开仓库的文件均可被别人查看。

## 换电脑

安装 Node.js 24 LTS、Git 和 pnpm 11，克隆源码后运行：

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm preview
```

本机快捷脚本也可以使用 Codex 自带的 Node.js，不修改全局环境。
本机使用 Windows PowerShell 5.1 时，脚本文件采用 UTF-8 BOM 编码以正确显示中文。

## 备份和迁移

保留整个源码目录（不需要 node_modules 和 public），尤其是 source、配置文件及 pnpm-lock.yaml。
更换托管平台时，重新生成 public 并上传即可。更换博客框架时，Markdown 和图片可以继续使用。
草稿可放在 source/_drafts，默认不生成网页；但推送到公开仓库后草稿源文件仍是公开的。
发布前会检查远程更新，并在本地干净时自动同步。发生并行修改会保留草稿并提示处理，避免覆盖其他修改。
