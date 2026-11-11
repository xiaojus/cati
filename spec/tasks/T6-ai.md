# T6 AI 口语录入（DeepSeek 结构化预填）

> 铁律：**AI 永不直接写库。** 只把结果填进表单，用户确认后才 saveLog。
> 相关 skill：`llm-structured-extraction`

## 服务端

`app/api/parse/route.ts`（POST，body `{ text: string }`）

1. 校验：`text` 1–300 字，否则 400
2. 调用 `https://api.deepseek.com/chat/completions`，`model: deepseek-chat`，`response_format: {type:'json_object'}`，`temperature: 0`
3. Key 从 `process.env.DEEPSEEK_API_KEY` 读；缺失时返回 503，前端降级为手填
4. **超时 8 秒**（AbortController），超时返回 504 `{ok:false,error:'解析超时，请手动填写'}`
5. system prompt 必须包含：
   - 角色：猫咪健康记录解析器，只输出 JSON
   - **注入当天日期**（`new Date()` 按 Asia/Shanghai 格式化），要求把"昨天/前天/上周三"换算成具体日期
   - 字段与范围：date、appetite 1–5、water 1–5、stool_score 1–7、stool_count 0–10、vomit_count 0–10、energy 1–5、weight_g 正整数(克，支持"3.2公斤"→3200)、note ≤30字、warnings 字符串数组
   - 没提到的一律 null，**不许猜**
   - warnings 仅在出现"血便/不吃不喝/频繁呕吐/精神极差/尿不出"等危险信号时填
6. 返回前做**服务端复核**（zod）：
   - 数值越界 → 置 null 并加入 `dropped: string[]`
   - `weight_g` 500–15000 之外 → 置 null
   - `date` 非法或未来日期 → 置为今天
   - warnings 用关键词规则二次校验（原文里没有对应词就不保留）
7. 写一条 `ai_parses`（raw_text、parsed_json、accepted=0）
8. 响应 `{ok:true, data:{...}}`

## 前端

在 `components/QuickLogSheet.tsx` 顶部加一个"说一句"输入区（AI 解析）：

1. textarea + 「解析」按钮（金瞳色，解析中显示金瞳呼吸动画）
2. 解析成功 → 把结果填进下方表单字段（不提交），字段旁标小圆点表示"AI 填的"
3. 展示 `dropped` 提示：「有 N 个值不在合理范围，已忽略」
4. `warnings` 非空 → 表单顶部琥珀色提示条：「注意：频繁呕吐 · 几乎不吃」，但仍然允许保存
5. 解析失败 → 珊瑚色一行：「没听懂，可以手动填」（不阻塞手填）
6. 用户点保存后，服务端把该条 `ai_parses.accepted` 置 1

## 安全

- Key 只在服务端；`grep -r "DEEPSEEK_API_KEY" .next/static` 必须无结果
- 不做诊断、不给用药建议；warnings 文案只陈述事实
- 限流：同一会话 1 分钟最多 10 次（内存 Map 即可）

## 验收

- 三条语料（正常描述 / 呕吐不吃 / 只报体重）解析后字段正确
- 断开 Key（临时改名）→ 返回 503，前端提示手动填写，页面不崩
- AI 解析后**不点保存**，数据库 `daily_logs` 计数不变
- 点保存后 `daily_logs` 有记录，且 `ai_parses.accepted=1`
