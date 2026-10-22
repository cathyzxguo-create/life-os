# 生活 OS

一个 Notion 风格的年度目标与生活记录系统，带 AI 录入、教练问诊和私人 AI 顾问。同一个页面支持四种运行方式，打开时自动识别：

| 打开方式 | 数据存在 |
|---|---|
| 在 Claude 里打开 | Claude 的数据库 |
| **Vercel 网址（推荐，免费）** | **你自己的 Supabase 项目** |
| 自己的服务器（`server.mjs`） | 服务器上的 SQLite 文件 |
| 直接双击 `public/index.html` | 这个浏览器 |

## 免费云端版：Supabase + Vercel

### 1. Supabase（数据库、图片、登录、AI 代理）

1. supabase.com 新建项目，Region 选 **Southeast Asia (Singapore)**。
2. **SQL Editor** → 粘贴 `supabase/setup.sql` 全文 → Run。
3. **Authentication → Users → Add user → Create new user**：填你的邮箱和密码，勾选 Auto Confirm User。
4. **Authentication → Sign In / Providers → Email**：关掉 Allow new users to sign up（防止别人注册）。
5. **Edge Functions → Deploy a new function → Via Editor**：函数名填 `ai`，把 `supabase/functions/ai/index.ts` 全文粘进去 → Deploy。
6. **Edge Functions → Secrets**：添加 `ANTHROPIC_API_KEY`（你的 Claude API Key）和 `OWNER_EMAIL`（第 3 步的邮箱）。
7. **Project Settings → API**：复制 Project URL 和 publishable（或 anon）key，填进 `public/config.json`。这两个值本来就是公开给前端用的，数据靠行级安全保护。

### 2. Vercel（放页面）

Add New Project → Import 这个仓库 → 直接 Deploy（`vercel.json` 已配好，不需要构建）。手机打开网址登录后，分享 → 添加到主屏幕。

### 3. 保持不休眠

Supabase 免费项目 7 天没有访问会暂停。`.github/workflows/keepalive.yml` 每天自动访问一次。如果项目还是被暂停了，去 Supabase 后台点 Restore 即可，数据不会丢。

### 数据和备份

数据在 Supabase 的 `docs` 表和 `blobs` 存储桶里，只有你的账号能读写。页面「设置 → 导出全部数据」随时导出一份含图片的 JSON 备份。

## 自建服务器版

## 本机试运行（需要 Node 22.5 以上）

```bash
APP_PASSWORD=你的密码 ANTHROPIC_API_KEY=sk-ant-... npm start
```

打开 http://localhost:8787 ，输入密码。

## 部署到 Railway（推荐，约 5 美元/月）

1. 用 GitHub 登录 railway.com，选 Hobby 套餐。
2. New Project → Deploy from GitHub repo → 选这个仓库。
3. 服务的 Settings → Region 选 Southeast Asia（Singapore）。
4. Variables 里加三个：`APP_PASSWORD`（至少 8 位）、`ANTHROPIC_API_KEY`、`COOKIE_SECURE=1`。
5. 右键服务（或命令面板）→ Add Volume，挂载路径填 `/data`。
6. Settings → Networking → Generate Domain，得到网址。

以后这个仓库有更新，Railway 会自动重新部署，数据在 `/data` 卷里不受影响。

## 部署到自己的服务器（Docker）

1. 准备一台云服务器（1 核 1G 就够），装好 Docker。
2. 把这个文件夹传上去，复制 `.env.example` 为 `.env`，填密码和 Key。
3. 运行：

```bash
docker compose up -d
```

4. 给它配一个域名和 HTTPS（例如用 Caddy：`caddy reverse-proxy --from 你的域名 --to localhost:8787`）。不配 HTTPS 的话，把 `.env` 里的 `COOKIE_SECURE` 改成 0，但密码会明文传输，不建议长期这样用。

注意：AI 请求是服务器发给 Anthropic 的，所以服务器要放在 Anthropic API 支持的地区。

## 从 Claude 版 / 本地版迁移

在原来的页面「设置 → 导出全部数据（含图片）」，然后在这里登录，「设置 → 导入备份」。

## 手机上像 App 一样用

手机浏览器打开网址并登录 → 分享 → 添加到主屏幕。登录一次会记住一年。

## 更新页面

页面本体是 `public/index.html`。换成新版本后刷新即可，数据不受影响（Docker 部署需要 `docker compose up -d --build`）。
