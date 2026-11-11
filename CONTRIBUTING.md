# 开发流程（标准 Git Flow，单人 + CI 强制）

> 目标：main 永远可部署；所有功能走分支 + PR + CI 门禁；不靠自觉，靠 hook 和 CI 拦。

## 1. 分支模型

| 分支 | 用途 | 谁能直接推 |
|---|---|---|
| `main` | 生产分支，**永远可部署** | ❌ 禁止直接提交/推送（hook 拦截） |
| `feat/<ticket>-<slug>` | 新功能，如 `feat/t2-auth` | ✅ |
| `fix/<slug>` | 缺陷修复，如 `fix/weight-chart-oob` | ✅ |
| `chore/<slug>` | 依赖升级、脚本、CI 等 | ✅ |
| `docs/<slug>` | 纯文档 | ✅ |

分支从 `main` 切出，生命周期 ≤ 3 天；超过就拆小。

## 2. 提交信息（Conventional Commits）

```
<type>(<scope>): <subject>

type = feat | fix | chore | docs | refactor | test | perf
scope = db | auth | ui | api | ci | deploy（可选）
```

例：`feat(ui): 今日页 7 天迷你指标`、`fix(api): 同日记录合并时覆盖了 source 字段`

`commit-msg` hook 会校验格式，不合格直接拒绝。

## 3. 一次改动的完整流程

```bash
git switch main && git pull --ff-only           # 1. 同步（有远程后）
git switch -c feat/t3-today-page                # 2. 切分支
# ...开发...
npm run ci                                      # 3. 本地跑 CI（pre-push 也会自动跑）
git add -A && git commit -m "feat(ui): 今日页骨架"  # 4. 提交
git switch main
git merge --no-ff feat/t3-today-page            # 5. 合并（保留分支信息）
git branch -d feat/t3-today-page
git tag -a v0.x.0 -m "..."                      # 6. 可部署版本打 tag
```

有远程后（Forgejo/GitHub）第 5 步改为 **开 PR**：CI 绿 + 自查清单勾完才可合并，合并方式 `--no-ff`（不要 squash，保留任务粒度）。

## 4. CI 门禁（`scripts/ci.sh`）

顺序执行，任何一步失败即阻断：

| 步骤 | 命令 | 失败含义 |
|---|---|---|
| 类型检查 | `npx tsc --noEmit` | 类型错误 |
| 数据库冒烟 | 临时库 `db:reset` + 计数断言 | schema/迁移/种子坏了 |
| 构建 | `npm run build` | 服务端/客户端边界、RSC 错误 |

远程 CI：`.forgejo/workflows/ci.yml`（未来推到 Forgejo 时生效）、`.github/workflows/ci.yml`（备用）。

## 5. main 保护（本地 hook 版）

`.githooks/pre-commit` 会拒绝**在 main 上直接提交业务改动**（merge commit 除外）。
`.githooks/pre-push` 在推送前跑完整 CI。
将来接 Forgejo 时，在仓库设置里开启：禁止直接 push main、必须 PR、CI 通过才可合并、至少 1 个 review。

启用方式（新 clone 后必须执行一次）：

```bash
git config core.hooksPath .githooks
chmod +x .githooks/*
```

## 6. 合并前自查清单

- [ ] `npm run ci` 全绿
- [ ] 改动只在本任务范围内（没有顺手重构别的模块）
- [ ] 没有提交 `.env`、`data/`、`uploads/`、`node_modules`
- [ ] 新增/变更的接口有对应类型定义
- [ ] 移动端 375px 宽无横向滚动（UI 任务）
- [ ] 健康数据相关改动：AI 仍不直接写库，数值仍做范围校验

## 7. 版本与发布

- `v0.x.0`：每完成一组任务（T1–T3、T4–T6…）
- 部署前必须 `git tag` + `npm run ci` 绿 + `main` 干净
- 部署动作：构建镜像 → 起容器 → 刷新 OpenResty → 冒烟 `/api/health`

## 8. Claude Code 的接入纪律

- 每个任务卡一个分支，一次只做一件事
- Claude Code 不许直接提交到 main、不许改 CI 配置、不许动 `spec/` 之外的流程文件
- 提交前由**委托方（我）**跑 `npm run ci` 并 review diff，再合并
