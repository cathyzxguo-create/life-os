# 生活 OS · 后端

一个密码、一个 SQLite 数据库文件、一个图片文件夹。手机和电脑打开同一个网址就能同步，AI 的 Key 放在服务器上，前端不用填。

## 数据在哪

全部在 `data/` 文件夹：

- `data/life-os.db`：所有板块、记录、目标、档案（SQLite，任何 SQLite 工具都能打开）
- `data/blobs/`：封面、愿景图等图片

**备份 = 复制整个 `data/` 文件夹。** 页面「设置 → 导出全部数据」也能导出一份 JSON（含图片）。

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
