# T15 照片与用药明细

## 为什么先做这两件

- **照片**：便便异常、呕吐物、皮肤、就诊单据，给兽医看时文字没用，图才有用。`uploads/` 目录和 `daily_logs.photo_path` 字段早就留好了，一直空着。
- **用药明细**：现在只记「体内驱虫做过」，没记药名、剂量、当时体重。驱虫药按体重给药，这是安全问题，不能只记「做过」。

## 一、迁移 0003

`lib/schema.ts`：

1. `records` 增加：
   - `drugName: text('drug_name')`（药名）
   - `doseMg: real('dose_mg')`（剂量，毫克；滴剂按 ml 记在 note 里）
   - `weightG: integer('weight_g')`（给药时体重）
   - `photoPath: text('photo_path')`
2. `daily_logs.photo_path` 已存在，直接用。
3. 生成 `drizzle/0003_photo_med.sql`，必须是 ALTER TABLE ADD COLUMN，不得重建表。生成后自己 `cat` 一遍确认。

## 二、上传与读取

1. `app/api/upload/route.ts`（POST，需登录）：
   - `formData()` 取 `file` + `kind`（`log` / `record`）+ `id`（对应记录 id）
   - 只允许 `image/jpeg|png|webp|heic`，单文件 ≤ 8MB
   - 服务端压缩：不引入 sharp（体积大），改为**限制尺寸 + 原样存**：若宽或高 > 1600px 用 `image-size` 之类的纯 JS 库？**不要新增依赖**，因此这一版不做压缩，只做大小与类型校验，文件名用 `crypto.randomUUID()` + 原扩展名
   - 落盘：`UPLOAD_DIR`（默认 `./uploads`）/ `<catId>/<yyyy-mm>/<uuid>.<ext>`
   - 校验该记录属于当前用户可访问的猫（查 `cat_members`），否则 403
   - 更新对应行的 `photo_path`，返回 `{ ok:true, path }`
2. `app/api/media/[...path]/route.ts`（GET，需登录）：
   - 路径落到 `uploads/` 内，**必须防目录穿越**（解析后 `realpath` 必须以 `UPLOAD_DIR` 开头）
   - 校验路径第一段 `<catId>` 属于当前用户 membership
   - 返回文件流，`Cache-Control: private, max-age=31536000, immutable`
3. `docker-compose.yml` 已有 uploads 挂载，确认容器内 `UPLOAD_DIR=/app/uploads` 并写进 env。

## 三、UI

1. **快速录入抽屉**：在备注下方加「拍照/选择图片」（`<input type="file" accept="image/*" capture="environment">`），选完显示缩略图 + 可删除；保存日志后再上传（因为需要 log id），上传失败不影响日志已保存，提示「图片上传失败，可稍后在记录里补」。
2. **今日页 / 数据页**：有 `photo_path` 的当天，煤球卡下方显示一张小缩略图（96×96，圆角），点击全屏查看（`<dialog>` 或覆盖层），支持左右滑动切换同一天的图（这一版只有一张，先不做轮播）。
3. **记录页**：疫苗/驱虫/就诊表单加「药名」「剂量(mg)」「当时体重(g)」三个可选字段（只有驱虫类显示，其他类型隐藏）；每条记录卡片若有照片，缩略图显示在右侧，点击放大。
4. **驱虫记录的智能提示**：填写「当时体重」时，若与最近一次体重差 > 15%，显示一行灰色提示「与最近体重 3.25kg 相差较大，确认一下是不是填错了」。

## 边界

允许改：`lib/schema.ts`、`drizzle/**`、`app/api/upload/route.ts`（新）、`app/api/media/[...path]/route.ts`（新）、`components/QuickLogSheet.tsx`、`components/RecordsManager.tsx`、`app/(tabs)/{today,records,data}/page.tsx`、`app/actions/records.ts`、`app/actions/logs.ts`（只加 photoPath 透传）、`docker-compose.yml`（只加 UPLOAD_DIR）。
禁止改：`middleware.ts`、`lib/auth.ts`、邀请/注册逻辑、CI。
禁止新增依赖。

## 验收（自己跑并贴输出）

```bash
npx tsc --noEmit && npm run build
cat drizzle/0003_photo_med.sql
```

上传链路（用服务端 cookie，不用浏览器也行）：

```bash
# 1) 造一张 1x1 png
node -e "require('fs').writeFileSync('/tmp/t.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64'))"
# 2) 登录拿 cookie，再 POST /api/upload（自己补上 id）
# 3) 断言 uploads/<cat>/<yyyy-mm>/ 下真的出现文件，daily_logs.photo_path 被更新
# 4) GET /api/media/<path> 返回 200 且 content-type 正确
# 5) 未登录 GET 应 307/401；路径穿越 /api/media/../../etc/passwd 应 400/404
```

## 禁止

- 不要把 uploads 目录直接暴露成静态资源（必须走鉴权路由）
- 不要允许任意扩展名（只认图片）
- 不要把原图写进数据库
