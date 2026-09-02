# 部署指南

## Docker 部署（推荐）

### 1. 准备环境变量

```bash
cp .env.example .env
```

编辑 `.env`，必须修改的项：

```env
JWT_SECRET="你的随机密钥"        # 至少 32 字符
AIPING_API_KEY="你的 API Key"    # 从 aiping.cn 获取
ADMIN_EMAIL="你的管理员邮箱"
NEXT_PUBLIC_GITHUB_URL="你的 GitHub 仓库地址"
```

生成随机 JWT 密钥：

```bash
openssl rand -hex 32
```

### 2. 构建并启动

```bash
docker compose up -d --build
```

服务会在 `http://localhost:3000` 启动。

### 3. 创建管理员账号

首次部署后，需要创建管理员账号。进入容器执行：

```bash
# 进入容器
docker compose exec lifetide sh

# 创建管理员（需要 tsx，开发依赖）
# 或者直接用 API：先注册一个用户，然后在数据库中确认其邮箱匹配 ADMIN_EMAIL
```

更简单的方式：用 Prisma Studio 直接操作数据库：

```bash
# 在宿主机上
npx prisma studio --schema prisma/schema.prisma
```

在 User 表中添加一条记录，email 设为 `ADMIN_EMAIL` 的值，passwordHash 用 bcrypt 生成。

### 4. 生成邀请码

1. 用管理员账号登录
2. 访问 `/admin`
3. 切换到「邀请码」tab
4. 点击「生成」

### 5. 数据持久化

SQLite 数据库存储在 Docker volume `lifetide-data` 中。备份：

```bash
docker compose exec lifetide cat /app/data/lifetide.db > backup.db
```

恢复：

```bash
docker compose cp backup.db lifetide:/app/data/lifetide.db
docker compose restart lifetide
```

---

## 云平台部署

### 部署到 Vercel / Netlify

不建议直接部署到 Vercel/Netlify，因为：
- SQLite 需要持久化文件系统
- 上传材料需要本地存储

如需部署到云平台，建议：
1. 将 SQLite 替换为 PostgreSQL（修改 `prisma/schema.prisma`）
2. 将文件存储替换为 S3/OSS
3. 然后正常部署

### 部署到 VPS / 云服务器

```bash
# 1. 克隆仓库
git clone https://github.com/Haaaiawd/lifetide-lite.git
cd lifetide-lite

# 2. 配置环境
cp .env.example .env
vim .env

# 3. 构建启动
docker compose up -d --build

# 4. 配置反向代理（Nginx 示例）
# 将 80/443 端口转发到 localhost:3000
```

Nginx 配置示例：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

配合 Certbot 配置 HTTPS：

```bash
sudo certbot --nginx -d your-domain.com
```

---

## 升级

```bash
git pull
docker compose up -d --build
```

Prisma 会在启动时自动执行 `db push`，同步 schema 变更。

## 监控

查看日志：

```bash
docker compose logs -f lifetide
```

健康检查：

```bash
curl http://localhost:3000/api/progress
# 返回 JSON 即正常
```
