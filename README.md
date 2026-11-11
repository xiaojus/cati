# 煤球 · Cati

给煤球（黑猫）做的轻量健康记录 PWA。两个人共用，手机优先，30 秒记完一条。

**线上**：https://cati.cocodemo.cloud

## 它解决什么

- 记录每天的食欲 / 饮水 / 便便评分 / 精神状态 / 体重
- 看得懂趋势：体重曲线、便便分布、食欲热图
- 不漏疫苗和驱虫：下一次到期倒计时
- 一句话录入：「昨晚吃了大半碗，拉了一次有点软」→ AI 解析成结构化字段，**人工确认后才入库**

## 技术栈

Next.js 16（App Router）+ React 19 + Tailwind v4 + Drizzle + SQLite（better-sqlite3）+ framer-motion + recharts

## 本地跑起来

```bash
git clone git@github.com:xiaojus/cati.git && cd cati
git config core.hooksPath .githooks && chmod +x .githooks/*
cp .env.example .env          # 填 CAT_SESSION_SECRET、DEEPSEEK_API_KEY
npm ci
npm run db:reset              # 建表 + 种子（me@local / cati1234）
npm run dev                   # http://localhost:3000
```

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发服务器 |
| `npm run ci` | 类型检查 + 数据库冒烟 + 构建（提交前必跑） |
| `npm run db:reset` | 删库重建 + 种子数据 |
| `npm run build` | 生产构建 |
| `docker compose up -d --build` | 生产容器（127.0.0.1:3100） |

## 目录

```
app/(tabs)/today      今日（监控面板：只读 + 快速录入）
app/(tabs)/data       数据（趋势图、导出）
app/(tabs)/records    记录（疫苗/驱虫/就诊 CRUD）
app/(tabs)/profile    档案（猫信息、医院、账号）
app/api/auth          登录 / 登出
app/api/parse         AI 口语解析（DeepSeek）
app/api/export        CSV 导出
lib/schema.ts         数据模型
lib/auth.ts           会话与鉴权
spec/DEV.md           开发约束（给编码 agent 的施工文件）
spec/tasks/           任务卡
```

## 两条不能破的规矩

1. **AI 不直接写库**：只预填表单，用户确认后才是记录。健康数据错一条比少一条糟糕。
2. **监控与数据分离**：今日页只看最近 7 天、只新增；编辑/删除/长区间/导出全在数据与记录页。

## 开发流程

见 [CONTRIBUTING.md](./CONTRIBUTING.md)：main 禁止直接提交 → 功能分支 → `npm run ci` → PR → 合并 → 打 tag → 部署。
