# 个人博客

使用 Hexo + Fluid + GitHub Pages，主编辑方式为 Pages CMS 在线可视化后台。文章底层仍使用 Markdown。

## 写作工作台（/studio/）

入口：https://sleepy-m.github.io/studio/ 。本地预览：双击“本地预览.cmd”后打开 http://127.0.0.1:4000/studio/ 。
采用 Vditor 3.11.2 即时渲染，依赖随博客托管，不依赖第三方编辑器 CDN。参考飞书文档、Notion、Typora 的写法：

- 卡片式排版：左侧文章列表、中间正文卡片、右侧大纲（窄屏自动收起，手机为抽屉 + 底部操作栏）。
- 选中任意文字浮出格式条：加粗、斜体、删除线、行内代码、链接，以及标题、引用、列表、待办。
- 行首输入 `/` 打开插入菜单（标题、表格、公式、图片、摘要分隔……），支持中文输入法筛选。
- 标题、日期、分类、标签、父文档、“已发布”开关常驻可见；分类和标签是胶囊，回车成块，可点 × 删除。
- 粘贴网页富文本自动转成干净 Markdown；粘贴图片自动压缩到 1600px / 2MB 以内再内嵌。
- 粘贴或拖入带 front matter 的 `.md` 会回填标题、日期、分类、标签，其它字段（如 `math: true`）原样保留。
- 外观可切换“跟随系统 / 浅色 / 深色”，另有专注写作、宽屏、打字机模式和大纲开关。
- 导出得到带完整 front matter 的 `日期-标题.md`，可直接放进 `source/_posts`。

草稿自动保存在当前浏览器的 localStorage；`Ctrl/⌘ + S` 立即保存，`?` 查看快捷键。
它不会写入仓库：正式发布仍用云端工作台或本机发布脚本。存储空间不足会提示备份，不会丢弃旧草稿。

## 云端工作台（可选）

`cloud/` 下的 Cloudflare Worker 提供 GitHub 登录、跨电脑草稿和直接发布，`/studio/` 在云端域名下会自动接管登录与发布按钮。
未部署时使用的是本机模式，和上面的写作工作台是同一套代码。

## 外观方案 A

2026-10-14 应用 Fluid、蓝灰配色、本站 SVG 山峦封面和明暗切换。中文使用思源黑体同源的 Noto Sans SC Variable，英文 Inter Variable，代码 JetBrains Mono。
字体、核心脚本、代码复制和 KaTeX 样式均随站托管。文章阅读进度条和轻量圆环光标已开启；触屏或 prefers-reduced-motion 模式不启用光标动画。
外观配置：`_config.fluid.yml`，自定义样式：`source/css/personal.css`，交互：`source/js/personal.js`，静态字体与脚本由 `scripts/fluid-assets.js` 从锁定依赖生成。
原 NexT 配置保留在 `_config.next.yml`，可通过历史版本恢复。

## 日常使用

在任何电脑打开 https://sleepy-m.github.io/admin/ ，自动进入 https://app.pagescms.org/sleepy-m/sleepy-m.github.io/main 。
使用 GitHub 账号 sleepy-m 登录。该账号已连接 Pages CMS，后台按 GitHub 仓库权限验证编辑资格。不要额外邀请协作者或授权其他账号。
进入“写文章”，点击 Add new 新建文章；正文可视化编辑，图片可以直接上传。
新文章默认“保存后发布到博客”打开：写完点一次 Save 就自动构建发布；日期自动填写，分类和标签可留空。
已有草稿不会自动公开。只保存草稿时关闭开关并 Save；已有草稿发布时打开开关并 Save。
草稿和文章都在 source/_posts，区别是 published: false/true。Hexo 不生成 published:false 的文章、索引或搜索记录。
后台还提供“关于我”“博客名称与简介”，并使用 merge 模式保留其他 Hexo 配置。
源码仓库公开，草稿只是从博客页面隐藏，原稿仍可从仓库查看。私人内容不要上传。图片保存在 source/uploads。
跨电脑在线编辑无需安装 Node.js、Git 或本机管理工具。

### 可选的本地编辑方式

本机可视化工具保留为备用：双击“打开博客管理.cmd”。它只监听回环地址，不是跨电脑访问入口。
`.local/drafts`、`.local/uploads`、`.local/backups` 是本机私有草稿和备份，不会自动迁移到线上，请单独备份。

1. 双击 `新建文章.cmd`，填写标题，用编辑器修改生成的 Markdown 文件。
2. 双击 `本地预览.cmd`，打开 http://127.0.0.1:4000 。预览窗口保持运行，停止时按 Ctrl+C。
3. 双击 `发布博客.cmd`，核对修改并确认发布。GitHub Actions 成功后网站更新。

文章在 `source/_posts`，个人介绍在 `source/about/index.md`。
博客名称、作者和网址在 `_config.yml`，导航和主题在 `_config.next.yml`。
示例文章可以直接修改或删除。

## 网站与发布

Markdown 由 hexo-renderer-markdown-it 渲染，数学公式使用 KaTeX。支持 `$...$` 行内公式和 `$$...$$` 独立公式，不需要逐篇开启。公式字体和样式随本站托管。
写法与示例：https://sleepy-m.github.io/writing/ 。在线编辑器的公式请在 Source 模式输入，数学渲染发生在生成的博客页面上，不能保证第三方编辑器实时预览。

已于 2026-10-13 发布到 https://sleepy-m.github.io/ ，仓库为 https://github.com/sleepy-m/sleepy-m.github.io 。
账号使用本机已登录的 `sleepy-m`。GitHub Pages 已设置为 GitHub Actions 自动构建。
`.github/workflows/pages.yml` 已配置自动构建发布，不需要手工上传 public。
所有推送到公开仓库的文件均可被别人查看。

## 本地开发环境恢复（在线写作不需要）

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
