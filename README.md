# 人生试运行 · Lifetide Lite

> 通过几轮短问答，看见三种未来，并试玩其中三天。

[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://github.com/Haaaiawd/lifetide-lite)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

---

## 这是什么

**人生试运行**是一个对话式人生设计工具。它不是心理测评，也不是决策树——它是一个让你在不确定中看见更多可能性的空间。

### 核心流程

```
邀请码注册 → 几轮短问答（每轮 3-5 题）→ 即时理解反馈
  → 生成个人画像 → 三条三年平行人生 → 选择一条 → 三天可逆试玩
```

**设计原则：**

- **短波次**：每轮只问 3-5 题，答完立刻给出带依据的理解，你可以纠正
- **地位平等**：三条路线没有排名，它们是同一个你的不同展开
- **可逆**：选一条不是为了决定终身，而是先试玩三天
- **隐私优先**：数据在你自己的数据库里，不上传第三方
- **证据可追溯**：每条路线的判断都链接回你说过的话

### 双 Agent 架构

- **Interviewer**：负责提问，根据你的回答和反馈动态调整下一轮方向
- **Sensemaker**：负责理解，每轮结束给出带证据的 insight，并记录不确定性

## 快速开始

### 方式一：Docker（推荐生产部署）

```bash
# 1. 克隆仓库
git clone https://github.com/Haaaiawd/lifetide-lite.git
cd lifetide-lite

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入 AIPING_API_KEY 和 JWT_SECRET

# 3. 启动
docker compose up -d

# 4. 访问
# http://localhost:3000
```

首次启动时，你需要创建管理员账号并生成邀请码：

```bash
# 1. 启动容器
docker compose up -d

# 2. 创建管理员账号 + 初始邀请码
docker compose cp scripts/seed-admin.cjs lifetide:/app/seed-admin.cjs
docker compose exec lifetide node /app/seed-admin.cjs

# 输出示例：
# Admin user ready: admin@lifetide.ai
# Invite code: MK67RJCQ
# Password: admin123

# 3. 用管理员账号登录，访问 /admin 生成更多邀请码
```

### 部署到云服务器

#### 1. 准备服务器

需要一台安装了 Docker 和 Git 的服务器（任何 Linux 发行版均可）：

```bash
# 安装 Docker（如果还没有）
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# 重新登录使 docker 组生效
```

#### 2. 拉取代码并配置

```bash
git clone https://github.com/Haaaiawd/lifetide-lite.git
cd lifetide-lite
cp .env.example .env
```

编辑 `.env`，**必须修改**以下项：

```env
# 生成随机密钥：openssl rand -hex 32
JWT_SECRET="你的随机密钥"

# 你的 Aiping API Key
AIPING_API_KEY="你的-key"

# 管理员邮箱
ADMIN_EMAIL="your-admin@example.com"
NEXT_PUBLIC_ADMIN_EMAIL="your-admin@example.com"

# GitHub 仓库地址（Star 按钮用）
NEXT_PUBLIC_GITHUB_URL="https://github.com/Haaaiawd/lifetide-lite"
```

#### 3. 构建并启动

```bash
docker compose up -d --build
```

服务会在 `http://localhost:3000` 启动。

#### 4. 创建管理员账号

```bash
docker compose cp scripts/seed-admin.cjs lifetide:/app/seed-admin.cjs
docker compose exec lifetide node /app/seed-admin.cjs
```

脚本会输出管理员邮箱、密码和初始邀请码。**登录后请立即修改密码。**

#### 5. 配置反向代理和 HTTPS

使用 Nginx 将 80/443 端口转发到 localhost:3000：

```bash
sudo apt install nginx -y
```

创建 `/etc/nginx/sites-available/lifetide`：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    client_max_body_size 10M;  # 上传材料限制

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

启用并配置 HTTPS：

```bash
sudo ln -s /etc/nginx/sites-available/lifetide /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 配置 SSL 证书
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your-domain.com
```

#### 6. 验证

```bash
# 健康检查
curl https://your-domain.com/api/progress
# 返回 JSON 即正常

# 查看日志
docker compose logs -f lifetide
```

#### 升级

```bash
git pull
docker compose up -d --build
```

Prisma 会在启动时自动执行 `db push`，同步 schema 变更。数据不会丢失。

#### 数据备份

```bash
# 备份
docker compose exec lifetide cat /app/data/lifetide.db > backup-$(date +%Y%m%d).db

# 恢复
docker compose cp backup-20250101.db lifetide:/app/data/lifetide.db
docker compose restart lifetide
```

> 更详细的部署说明见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

### 方式三：本地开发

```bash
# 前置：Node.js 22+，pnpm 10+

# 1. 安装依赖
pnpm install

# 2. 配置环境
cp .env.example .env
# 编辑 .env

# 3. 初始化数据库
pnpm db:generate
npx prisma db push

# 4. 启动开发服务器
pnpm dev

# 5. 访问 http://localhost:3000
```

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `DATABASE_URL` | 是 | SQLite 路径，如 `file:./prisma/dev.db` |
| `JWT_SECRET` | 是 | JWT 签名密钥，生产环境务必修改 |
| `ADMIN_EMAIL` | 是 | 管理员邮箱，该用户可访问 `/admin` |
| `AI_PROVIDER` | 是 | AI 提供商，目前支持 `aiping` |
| `AIPING_API_KEY` | 是 | Aiping API Key |
| `AIPING_BASE_URL` | 否 | 默认 `https://aiping.cn/api/v1` |
| `AIPING_MODEL` | 否 | 默认 `Qwen3.7-Plus` |
| `MULTIMODAL_MODEL` | 否 | 默认 `Qwen3.5-Flash`，用于 PDF/图片提取 |
| `NEXT_PUBLIC_GITHUB_URL` | 否 | GitHub 仓库地址，用于 Star 按钮 |

## 技术栈

| 层 | 技术 |
|----|------|
| 框架 | Next.js 16 (App Router) |
| 语言 | TypeScript 5.8 |
| 样式 | Tailwind CSS v4 |
| 动画 | Motion (`motion/react`) |
| 图标 | Phosphor Icons + Pixelart Icons |
| 数据库 | Prisma + SQLite |
| 认证 | JWT (`jose`) + bcrypt |
| AI | Aiping (OpenAI-compatible) |
| 测试 | Vitest (契约/单元) + Playwright (E2E) |

## 视觉方向

**Soft Editorial Neo-Brutalism**：off-white 方格纸底、ink 墨色、cobalt 强调色、2px 边框、硬偏移阴影、克制的圆角。关键陈述用编辑感中文衬线体，UI 用清晰无衬线体。

## 项目结构

```
app/              Next.js App Router 页面和 API
  api/            API 路由（auth, wave, portrait, final, admin...）
  play/           核心产品页面（访谈 → 画像 → 路线 → 试玩）
  admin/          管理员后台
  account/        个人中心
  login/          登录/注册
components/       React 组件
  routes/         路线相关（RouteCarousel, ScenePlayer, DayProgressAnimation...）
  portrait/       画像卡片
  play/           访谈对话组件
  art/            像素艺术装饰
lib/              核心逻辑
  ai/             AI provider 抽象 + Interviewer/Sensemaker
  auth/           认证、session、邀请码
  working-memory/ 工作记忆（答案、证据、不确定性、路线意图）
  prisma/         数据库 schema 和 client
  privacy/        Consent 管理
  state/          XState 状态机 + 事件提交
public/           静态资源（logo, sprites, portraits）
prisma/           Prisma schema
tests/            契约测试 + 单元测试
```

## 开发命令

```bash
pnpm dev              # 启动开发服务器
pnpm build            # 生产构建
pnpm start            # 启动生产服务器
pnpm typecheck        # TypeScript 类型检查
pnpm lint             # ESLint
pnpm test:contracts   # 运行契约和单元测试
pnpm test:e2e         # 运行 Playwright E2E 测试
pnpm db:generate      # 生成 Prisma Client
```

## 管理员后台

访问 `/admin`，需要 `ADMIN_EMAIL` 匹配的账号登录。

功能：
- **数据分析**：用户数、会话数、画像/路线生成数、Wave 进度分布
- **邀请码**：生成、查看、删除邀请码，查看使用情况
- **用户**：查看最近注册的用户
- **会话**：查看最近会话及其进度

## 许可证

MIT
