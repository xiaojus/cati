# T7 数据页 / 记录页 / 档案页

> 数据面板 = 历史的、可编辑的、可导出的。与今日页（监控）职责严格分离。

## 数据页 `app/(tabs)/data/page.tsx`

- 区间切换 pill：7 天 / 30 天 / 90 天（默认 30）
- 四张图（recharts，客户端组件，`ResponsiveContainer`）：
  1. **体重曲线**：LineChart，null 值断开（`connectNulls={false}`），金色线 + 圆点
  2. **便便评分**：按天散点/柱状，1–7 纵轴；≥5 的点用珊瑚色，≤3 用薄荷色
  3. **食欲热图**：最近 30 天 7 列网格，颜色深浅代表 1–5
  4. **呕吐次数**：BarChart，>0 的柱子珊瑚色
- 空数据状态：黑猫轮廓 + 「这段时间还没有记录」
- 顶部一行导出按钮 → 下载 CSV（见下）

## CSV 导出 `app/api/export/route.ts`（GET）

`?type=daily|records&from=YYYY-MM-DD&to=YYYY-MM-DD`

- `daily`：表头与 `~/Documents/cat/data/` 对齐：`日期,食欲,饮水,便便评分,排便次数,呕吐次数,精神,体重g,备注,记录人,来源`
- `records`：`类型,名称,日期,剂量,下次到期,费用,医院,备注`
- UTF-8 **带 BOM**（`\uFEFF`），`Content-Disposition: attachment; filename="cati-daily-YYYYMMDD.csv"`
- 数值 null 输出空字符串，不要写 "null"

## 记录页 `app/(tabs)/records/page.tsx`

- 四个分组：疫苗 / 体内驱虫 / 体外驱虫 / 就诊（用药并入就诊的备注）
- 每个分组：列表（名称、日期、下次到期、费用）+ 新增按钮
- 表单（Server Action `app/actions/records.ts`）：
  - `saveRecord`（新增/编辑，upsert by id）、`deleteRecord`（软删除不要求，直接删）
  - zod 校验：type 枚举、name 非空 ≤40 字、event_date 合法、cost ≥0、next_due 可空
  - **疫苗**：next_due 默认 = event_date + 21 天（猫三联第二针间隔），可改
  - **驱虫**：体内 next_due 默认 +90 天，体外 +30 天
- 疫苗条目在到期前 7 天标黄、过期标珊瑚（列表内状态点，不做推送）

## 档案页 `app/(tabs)/profile/page.tsx`

- 煤球信息卡：名字、性别、约年龄、绝育状态（待手术/已绝育+日期）、隔离起始日、当前隔离第几天
- 常去医院：名称/电话/地址（可编辑，电话用 `tel:` 链接）
- 账号区：当前登录人（display_name + email）、退出登录按钮
- 数据区：显示 `data/cat.db` 大小、最近备份时间（读文件 stat，读不到显示"—"）
- 危险信号速查（折叠）：不吃饭超 24h / 尿不出 / 呼吸急促 / 抽搐 → 立即就医

## 验收

- `npm run ci` 通过
- 造 30 天数据后四张图都能渲染，切换区间数值变化正确
- 导出 daily CSV 用 `python3 -c "import csv;"` 能正常解析，表头与本地档案一致
- 新增一条疫苗记录 → 记录页出现，今日页倒计时同步更新
- 删除一条记录 → 今日页不再显示它
- 375px 宽无横向滚动，图表不溢出
