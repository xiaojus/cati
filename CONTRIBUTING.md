# 整体开发流程

> 仓库：`github.com/xiaojus/cati`（私有）　生产：`https://cati.cocodemo.cloud`
> 原则：**main 永远可部署；所有改动走分支 + PR + CI 门禁；不靠自觉，靠机器拦。**

## 0. 角色分工

| 角色 | 职责 | 产出 |
|---|---|---|
| **你（产品）** | 定需求、定优先级、验收体验 | 需求描述、问题清单 |
| **小橘（统筹）** | 拆任务卡、写验收标准、跑 CI、review diff、合并、部署、汇报 | 任务卡、PR、上线版本 |
| **Claude Code** | 按任务卡写代码、自己跑测试 | 分支上的 commit |
| **GitHub Actions** | 客观门禁：类型 / 数据库 / 构建 / health 冒烟 | 绿或红 |

**铁律：Claude Code 说"做完了"不算完成。** 完成 = 我独立跑通 CI + 看过 diff + 边界没越。

## 1. 一次性准备（新机器 / 新会话）

```bash
gh repo clone xiaojus/cati && cd cati
git config core.hooksPath .githooks && chmod +x .githooks/*
cp .env.example .env        # 填 CAT_SESSION_SECRET、DEEPSEEK_API_KEY
npm ci
npm run db:reset
```

## 2. 需求 → 任务卡

每条任务卡必须四件套，缺一项不许开工：

```
【目标】一句话说清要什么效果
【边界】只许改哪些文件；明确不许动什么
【验收】可执行命令或可观察现象（不是"看起来对"）
【禁止】不许加依赖 / 不许改 CI / 不许动 spec/
```

示例：

> **目标**：今日页显示最近 7 天便便评分迷你趋势，连续 2 天 ≥5 分标黄
> **边界**：只改 `app/(tabs)/today/page.tsx`、`components/MiniTrend.tsx`
> **验收**：`npm run ci` 绿；造 3 天数据后第 3 天出现黄色提示条
> **禁止**：不新增依赖；不改 `lib/db.ts`；不碰 `spec/`

## 3. 分支与提交

```bash
git switch main && git pull --ff-only
git switch -c feat/t3-today-page        # feat | fix | chore | docs + 任务号
# ...开发...
npm run ci                               # 必须全绿
git add -A && git commit -m "feat(ui): 今日页 7 天迷你指标"
git push -u origin feat/t3-today-page
```

提交信息由 `commit-msg` hook 强制：`<type>(<scope>): <subject>`，type ∈ feat / fix / chore / docs / refactor / test / perf。

## 4. 三道 CI 门

| 门 | 时机 | 跑什么 | 拦什么 |
|---|---|---|---|
| **pre-commit** | 本地提交 | main 保护 + 敏感文件检查 + tsc | 直接在 main 提交、误提 `.env`/`data/`、类型错误 |
| **pre-push** | 本地推送 | `npm run ci` 全量 | 推半成品 |
| **GitHub Actions** | push / PR | 装依赖 → 类型 → 数据库冒烟 → 构建 → `/api/health` 冒烟 | 绕过本地 hook 的情况 |

`npm run ci` = 类型检查 → 临时库建表+种子+断言（表齐全、唯一约束、猫名） → `next build`。

## 5. PR 流程

```bash
gh pr create --fill --base main \
  --title "feat(ui): 今日页 7 天迷你指标" \
  --body "## 改了什么…\n## 怎么验…\n## 风险/回滚…"
gh pr checks --watch                     # 等 CI 绿
gh pr merge --merge --delete-branch      # 合并（不 squash，保留任务粒度）
```

**main 保护（GitHub 侧）**：禁止直接 push、CI 必须通过、禁止强推、合并后自动删 head 分支。

## 6. 部署

```bash
# 本地
git switch main && git pull --ff-only
npm run ci && git tag -a v0.x.0 -m "…" && git push --tags
# 服务器
cd ~/apps/cati && git fetch --tags && git checkout v0.x.0
docker compose up -d --build
curl -fsS http://127.0.0.1:3100/api/health      # 容器就绪
curl -fsS https://cati.cocodemo.cloud/api/health # 穿透就绪
```

**回滚**：`git checkout <上一个 tag> && docker compose up -d --build`。迁移只前进，回滚前先备份 `data/cat.db`。

## 7. 日常节奏

| 频率 | 动作 |
|---|---|
| 每个功能 | 一个分支、一个 PR、一次验收汇报 |
| 每天 | 我汇报：做完什么、卡在哪、下一步 |
| 每组合任务 | 打 tag（v0.1 / v0.2 …），部署一次 |

## 8. 不允许的操作

- ❌ 直接在 main 提交或 push
- ❌ 跳过 CI 合并（`--admin`）
- ❌ 提交 `.env`、`data/`、`uploads/`
- ❌ Claude Code 修改 CI 配置或 `spec/` 之外的流程文件
- ❌ 在健康数据链路上让 AI 直接写库
