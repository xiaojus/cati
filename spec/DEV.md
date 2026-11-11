# 煤球 App — 开发约束与任务卡

> 给 Claude Code 的施工文件。每个任务只做本任务范围内的事，不要顺带重构别的文件。
> 详细设计见 `~/Documents/cat/app-design.md`（不要在仓库里复制它）。

## 技术栈（已安装，不要替换）

- **Next.js 16.4** App Router + React 19 + TypeScript
- **Tailwind CSS v4**（CSS 配置，**没有** `tailwind.config.js`；主题写在 `app/globals.css` 的 `@theme` 里）
- **Drizzle ORM 0.45** + **better-sqlite3 13**
- framer-motion 14、lucide-react、recharts 3、zod 4、bcryptjs 3、date-fns 4

## 硬性约束（写错会直接编译失败）

1. **Next 16**：`cookies()` / `headers()` 是**异步**的 → `const c = await cookies()`；`params` / `searchParams` 是 Promise → `await params`
2. 用了 better-sqlite3 的 route / page 必须 `export const runtime = 'nodejs'`，且不能是纯静态页面
3. Drizzle 只在**服务端** import。客户端组件不要引 `lib/db.ts`
4. Tailwind v4：不要新建 `tailwind.config.js`；自定义颜色写在 `globals.css` 的 `@theme { --color-*: ... }`
5. 所有 `useState`/事件 的组件加 `'use client'`；recharts 只能在客户端组件里用
6. 数据库路径：`process.env.CAT_DB ?? './data/cat.db'`；`data/` 目录要在启动时自动创建
7. 不要引入新的 npm 依赖（需要的话先说明理由，由人工确认）
8. 不要改 `package.json` 的 scripts 结构（可以加，不要删）

## 设计 token（必须严格遵守）

```css
--color-ink:        #17151A;  /* 正文 / 深色底 */
--color-cream:      #FFF9F0;  /* 页面背景 */
--color-gold:       #F5B731;  /* 主色 金瞳 */
--color-gold-deep:  #D99A1F;  /* 按下态 */
--color-mint:       #6FC2A1;  /* 正常 / 健康 */
--color-coral:      #E86A4D;  /* 警示 / 异常 */
--color-muted:      #8B8578;  /* 次要文字 */
--color-night:      #12100E;  /* 暗色模式背景 */
```

圆角 20px（`rounded-[20px]`）；卡片阴影 `0 2px 12px rgba(23,21,26,.06)`；触控目标 ≥44px；移动优先，内容容器 `max-w-[480px] mx-auto`。

## 信息架构

4 个 Tab（底部固定）：**今日**（监控，只读+快录）/ **数据**（趋势图+导出）/ **记录**（疫苗·驱虫·就诊·用药 CRUD）/ **档案**（基础信息·医院·账号）。

**双面板铁律**
- 监控页只允许"新增"，不能编辑/删除
- 监控页只看最近 7 天；数据页可选区间
- 同一指标：监控=最新值+趋势箭头+sparkline；数据=完整曲线+表格+导出
- 红黄绿判定、24h 未录、体重下降>5% 的**判断逻辑只写在监控页**
- 疫苗/驱虫倒计时只在监控页；记录页只存 `next_due` 字段

## 数据模型（表名/字段名固定，不要改名）

```
users(id TEXT PK, email TEXT UNIQUE, password_hash TEXT, display_name TEXT, created_at TEXT)
sessions(id TEXT PK, user_id TEXT, expires_at TEXT, created_at TEXT)
cats(id TEXT PK, name TEXT, birth_est TEXT, sex TEXT, neutered INTEGER, neutered_at TEXT,
     avatar_url TEXT, note TEXT, created_at TEXT)
cat_members(cat_id TEXT, user_id TEXT, role TEXT, PRIMARY KEY(cat_id,user_id))
daily_logs(id TEXT PK, cat_id TEXT, log_date TEXT, appetite INTEGER, water INTEGER,
     stool_score INTEGER, stool_count INTEGER, vomit_count INTEGER, energy INTEGER,
     weight_g INTEGER, note TEXT, photo_path TEXT, source TEXT, created_by TEXT, created_at TEXT,
     UNIQUE(cat_id, log_date))
records(id TEXT PK, cat_id TEXT, type TEXT, name TEXT, event_date TEXT, dose TEXT,
     next_due TEXT, cost REAL, vet TEXT, note TEXT, created_by TEXT, created_at TEXT)
ai_parses(id TEXT PK, user_id TEXT, raw_text TEXT, parsed_json TEXT, accepted INTEGER, created_at TEXT)
```

- 所有 id 用 `crypto.randomUUID()`
- 所有日期字符串 `YYYY-MM-DD`，时间戳 ISO 8601
- `records.type` ∈ `vaccine | deworm_in | deworm_out | visit | med`
- `daily_logs.source` ∈ `manual | ai`
- 数值范围：appetite/water/energy 1–5；stool_score 1–7；stool_count/vomit_count ≥0；weight_g 正整数

## 任务卡格式

每个任务完成后需给：改动的文件清单、`npx tsc --noEmit` 结果、本任务验收命令的输出。**说不通过就不算完成。**

---

# T1 骨架 + 数据库

**目标**：能建表、能种数据、能读出来。

做这些：
1. `lib/schema.ts`：按上面模型写 Drizzle 表定义（sqlite-core）
2. `lib/db.ts`：单例 better-sqlite3 连接，自动 `mkdir -p` 数据目录，开启 `journal_mode=WAL`、`foreign_keys=ON`
3. `drizzle.config.ts`：dialect sqlite，schema 指向 `lib/schema.ts`，dbCredentials url 用 `CAT_DB ?? ./data/cat.db`
4. `scripts/migrate.ts`：用 drizzle 的 `migrate()` 或直接执行建表 SQL，保证幂等（重复跑不报错）
5. `scripts/seed.ts`：插入 1 个用户（email `me@local`，密码 `cati1234` 的 bcrypt hash）、1 只猫（名字"煤球"，sex `F`，neutered 0）、`cat_members` 关联、**14 天 daily_logs 假数据**（食欲 3–5、便便 3–6、体重 3100–3250 递增）、3 条 records（疫苗 1、驱虫 2）
6. `package.json` 加 scripts：`db:migrate`、`db:seed`、`db:reset`（删库后重建+seed）
7. `app/api/health/route.ts`：`export const runtime='nodejs'`，返回 `{ok:true, counts:{users,cats,daily_logs,records}}`

**验收**（我这边会跑）：
```bash
npm run db:reset && sqlite3 data/cat.db ".tables"
npm run db:seed   # 再跑一次不能炸（幂等或先清空）
npx tsc --noEmit
curl -s localhost:3000/api/health   # 需 dev 已起
```
