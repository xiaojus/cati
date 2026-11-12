# T12 多用户：注册 + 邀请码 + 数据模型

目标：陌生人不能碰到煤球的数据；家人拿一次性邀请码才能加入同一只宠物。同时修掉「两人同一天记录互相覆盖且无感知」的缺陷。

## 一、数据模型（先做，务必非破坏性）

改 `lib/schema.ts` 并生成迁移：

1. `users` 增加 `isSiteAdmin: integer('is_site_admin').default(0)`（v0.6 站点密钥开关要用，现在先埋）
2. `daily_logs` 增加：
   - `updatedBy: text('updated_by').references(() => users.id)`
   - `updatedAt: text('updated_at')`
3. 新表 `invites`：
   - `code` text 主键（8 位）
   - `catId` → `cats.id`（cascade）
   - `createdBy` → `users.id`
   - `role` text 默认 `'member'`
   - `expiresAt` text 必填
   - `usedBy` → `users.id`（可空）
   - `usedAt` text（可空）
   - `createdAt` text 必填

生成迁移：`npx drizzle-kit generate --name multi_user`

**硬性要求**：迁移必须是 `ALTER TABLE ... ADD COLUMN` 和 `CREATE TABLE invites`，**不得出现 drop/重建 daily_logs**（那会丢数据）。生成后自己打开 `drizzle/0001_*.sql` 逐行确认，把内容贴出来。若 drizzle-kit 生成的是重建表，改为手写迁移文件，并手动补 `drizzle/meta/_journal.json` 的条目（参考 0000 的格式）。

## 二、注册

1. 新页面 `app/register/page.tsx`：邮箱、密码（≥8 位）、昵称（1–12 字），复用登录页的视觉（黑猫、金瞳、卡片）。底部「已有账号？去登录」。
2. 新文件 `app/actions/auth.ts`，`'use server'`：
   - `register(input)`：zod 校验 → 邮箱小写去空格 → 查重（已存在返回 `{ ok:false, error:'这个邮箱已经注册过了' }`）→ `bcrypt.hash(password, 12)` → 插入 users（`displayName` 一起写）→ `createSession(user.id)` → `redirect('/welcome')`
   - 邮箱格式错误：「邮箱格式不对」；密码太短：「密码至少 8 位」；昵称空：「给你的昵称起个名字吧」
   - 所有错误中文、就地显示，不抛异常给用户
3. 登录页底部加「还没账号？注册一个」链接。

## 三、欢迎页（注册后选择怎么开始）

`app/welcome/page.tsx`（需登录）：

- 当前用户已经有 `cat_members` 记录 → `redirect('/today')`
- 否则显示两个选择卡：
  - **「我是新家长」**：输入宠物名字 + 出生日期（可空）→ 创建 cat（`created_at` 现在），插入 `cat_members(role='owner')` → `/today`
  - **「我有邀请码」**：输入 8 位码 → 校验存在/未使用/未过期 → 插入 `cat_members(role='member')` → 标记 `invites.used_by`/`used_at` → `/today`
- 错误：码不存在「邀请码不对」；已用「这个邀请码已经被用过了」；过期「邀请码过期了，让对方重新生成」

## 四、邀请家人（档案页）

1. 档案页新增「家庭成员」卡：列出该猫所有成员（昵称或邮箱 + 角色徽章 创建者/家人）。
2. 只有 owner 能看到「邀请家人」按钮：点击生成 8 位码（字符集 `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`，排除易混字符），有效期 24 小时，单次使用；生成后展示「复制邀请码」和到期时间。
3. 已生成未使用的邀请码列在下方，显示剩余时间；点击可作废（删除该 invite）。
4. `app/actions/family.ts`：`createInvite()`、`revokeInvite(code)`、`redeemInvite(code)`、`removeMember(userId)`（owner 才能移除，且不能移除自己、不能移除最后一个 owner）。
5. 所有 action 服务端重新取 `requireUser()`，不信任客户端传的 userId 权限。

## 五、写入记录人

1. `app/actions/logs.ts` 的 `saveLog`：upsert 时写 `updatedBy = 当前用户 id`、`updatedAt = 现在`；新建时 `createdBy` 也写当前用户。
2. 不改其他逻辑（仍然只更新本次填写的字段）。

## 边界

允许改：`lib/schema.ts`、`drizzle/**`、`app/register/page.tsx`（新）、`app/login/page.tsx`（只加注册链接）、`app/welcome/page.tsx`（新）、`app/actions/auth.ts`（新）、`app/actions/family.ts`（新）、`app/actions/cat.ts`（加 createCat）、`app/actions/logs.ts`（只加 updatedBy/updatedAt）、`app/(tabs)/profile/page.tsx`（加家庭成员卡）、`components/FamilyMembers.tsx`（新）。
禁止改：`middleware.ts`、`lib/auth.ts` 的会话逻辑、`app/api/**`、CI/Docker、其他页面布局。
禁止新增依赖（bcryptjs、zod 已有）。

## 验收（自己跑并贴输出）

```bash
npx tsc --noEmit && npm run build
cat drizzle/0001_*.sql
```

迁移非破坏性验证（必须做，用副本，绝不动 `data/cat.db`）：

```bash
cp data/cat.db /tmp/mig-test.db
CAT_DB=/tmp/mig-test.db node scripts/migrate.cjs
node -e "
const D=require('better-sqlite3'); const db=new D('/tmp/mig-test.db',{readonly:true});
console.log('cats', db.prepare('select count(*) c from cats').get().c,
            'logs', db.prepare('select count(*) c from daily_logs').get().c,
            'cols', db.prepare('select name from pragma_table_info(\"daily_logs\")').all().map(r=>r.name).join(','));
console.log('invites', db.prepare(\"select name from sqlite_master where name='invites'\").all());
"
```

期望：迁移后 cats/logs 计数与迁移前一致（开发库应为 cats=1、logs=14），`daily_logs` 列里出现 `updated_by`、`updated_at`，`invites` 表存在。

再跑一遍迁移（幂等性）：`CAT_DB=/tmp/mig-test.db node scripts/migrate.cjs` 不应报错、不应重复改表。

## 禁止

- 不允许把注册做成"任何人注册就能看到煤球"——没有邀请码只能创建自己的宠物
- 不要在邀请码里用可预测的自增数字
- 不要把 `is_site_admin` 暴露到前端（v0.6 才用）
