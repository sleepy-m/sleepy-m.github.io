# 云端写作服务

部署目标 `sleepym-blog-studio.2036681827.workers.dev`；数据库 `sleepym-blog-drafts` 通过 `DB` 绑定。配置只含公开 ID，不含凭据。

## 安全配置

唯一必需的 Secret：`GITHUB_CLIENT_SECRET`（GitHub App 的客户端密钥）。由拥有者在 GitHub 生成并直接填到 Cloudflare Worker 的 Secret 类型变量，不得放进代码、Git、聊天或普通明文变量。私钥仅作为安装 GitHub App 的前置要求，本服务采用用户 OAuth token，不需要上传私钥。

代码固定拥有者数字 ID、仓库、main 分支、安装 ID 和回调源；PKCE + 一次性 state；随机 HttpOnly/Secure/SameSite=Lax 会话 cookie。GitHub token 使用 AES-GCM 加密后保存在 D1，不向前端返回。会话最多 8 小时，过期重新登录；不存 refresh token。所有写接口要求固定 Origin 和 CSRF token，所有数据接口实时校验 GitHub 用户，防止已撤销令牌继续读草稿。

未发布草稿在 D1，不写入公开仓库；GitHub App 的内容权限在 GitHub 层面可读写整个被选仓库，但后台只允许 `source/_posts/*.md` 和新建 `source/uploads/*`。读取已有元数据后保留自定义字段；发布时不强制更新 Git 分支，防止覆盖其他提交。草稿更新采用 revision 乐观锁。发生冲突先备份，不能反复重试覆盖。

## 构建与检查

```powershell
node --test cloud/worker.test.mjs
node node_modules/esbuild/bin/esbuild cloud/entry.mjs --bundle --format=esm --platform=browser --target=es2022 --minify --outfile=.local/worker-upload.mjs
```

编译后的 `.local/worker-upload.mjs` 可放到该 Worker 的代码编辑器。不要部署到已有 `white-math-65bc`。启动时创建空白数据库表，不需要手工输入 SQL。`/api/health` 仅返回版本和配置是否齐全；缺少数据库或 Secret 时数据接口返回 503，不开放访问。

## 当前限制

为了满足 D1 单行数据限制，云端正文连同内嵌图片上限 1.5MB。图片发布时从 data URL 转成上传文件，与文章通过同一 Git tree/commit 发布。一次只有一个发布操作；失败保留草稿。部署状态只读取公开 Actions API，无需增加 Actions 权限；限流时提供进度链接，不谎报成功。

前端由此 Worker 同源代理 GitHub Pages 的 `/studio/`、`/vendor/`、`/uploads/` 静态资源，避免跨域登录 cookie。GitHub Pages 的工作台是本机模式，草稿不会跨域自动迁移，请下载后导入云端。本机缓存包含自己的草稿，公用电脑不建议使用。

线上可用性必须完成真实 GitHub 登录、云端草稿保存与恢复、图片和文章发布验证后才宣布。纯本地模拟测试不代表线上流程通过。
