# 个人博客

使用 Hexo + NexT + GitHub Pages，接入 Pages CMS 网页编辑后台。文章底层仍使用 Markdown。

## 日常使用

推荐通过 https://sleepy-m.github.io/admin/ 进入网页后台，登录 GitHub 账号 sleepy-m，选择 sleepy-m.github.io 仓库的 main 分支。
首次使用需要在 GitHub 连接 Pages CMS，仅授权这一个博客仓库。后台提供文章管理、图片管理、关于我和博客设置。
编辑器采用可视化正文编辑；保存文章会公开提交到仓库并触发自动发布，最终页面更新需要等待构建完成。
`.pages.yml` 是后台配置，网页上传的图片在 `source/uploads` 中。
博客设置采用 merge 模式保留没有在表单中显示的 Hexo 配置。后台不提供独立草稿开关。

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
网页编辑会直接更新远程仓库。再次使用本地方式前，先运行 `git pull --ff-only` 同步；如果本地已有修改，请先保存并处理冲突。
