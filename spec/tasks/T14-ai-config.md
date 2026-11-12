# T14 大模型自定义接入（每用户独立 key）

## 铁律（先读三遍）

**用户没配置自己的 key，就绝对不能回落到站点环境里的 `DEEPSEEK_API_KEY`。** 站点以后可能推荐给亲友用，站长的额度不能被别人消耗。只有 `users.is_site_admin = 1` 且显式打开「使用站点默认密钥」开关的账号，才允许回落。

## 一、数据模型

`lib/schema.ts` 增加表 `ai_configs`（新迁移 `0002_ai_config`）：

- `userId` text 主键 → `users.id`（cascade）
- `provider` text 必填（`deepseek` / `zhipu` / `qwen` / `moonshot` / `openai` / `custom`）
- `baseUrl` text 必填
- `model` text 必填
- `keyCipher` text 必填（AES-256-GCM 密文，格式 `iv:tag:data`，全部 base64）
- `keyHint` text 必填（末四位，仅用于展示）
- `verifiedAt` text（最近一次测试连接成功时间）
- `useSiteKey` integer 默认 0（只有 site admin 能打开）
- `createdAt` / `updatedAt` text 必填

## 二、加密

新增 `lib/crypto.ts`：

```ts
export function encryptSecret(plain: string): string
export function decryptSecret(cipher: string): string
```

- 主密钥来自 `process.env.CAT_SECRET_KEY`（64 位 hex 或 32 字节 base64）
- 缺失或长度不对 → 抛中文错误「没有配置 CAT_SECRET_KEY，无法保存密钥」（启动时不要崩，只有用到才报错）
- AES-256-GCM，随机 12 字节 IV，输出 `iv:tag:data`
- 单元自测：roundtrip 100 次随机字符串全部还原；密文里不出现明文

## 三、服务商目录

新增 `lib/providers.ts`，只放元数据：

| provider | baseUrl | 候选模型 |
|---|---|---|
| deepseek | `https://api.deepseek.com` | deepseek-chat, deepseek-reasoner |
| zhipu | `https://open.bigmodel.cn/api/paas/v4` | glm-4.6, glm-4-flash, glm-4-air |
| qwen | `https://dashscope.aliyuncs.com/compatible-mode/v1` | qwen-plus, qwen-turbo, qwen-max |
| moonshot | `https://api.moonshot.cn/v1` | moonshot-v1-8k, kimi-k2-0905-preview |
| openai | `https://api.openai.com/v1` | gpt-4o-mini, gpt-4.1-mini |
| custom | 空（用户填） | 用户填 |

界面：选 provider 自动填 baseUrl 和模型下拉；选 `custom` 时 baseUrl 与 model 变成可输入。

## 四、设置页

新增 `app/settings/page.tsx`（需要登录），侧栏和档案页加「设置」入口：

1. **AI 解析** 卡片：
   - 已配置：显示服务商 / 模型 / `sk-****abcd` / 最近验证时间，按钮「重新配置」「删除」
   - 未配置：表单（服务商下拉、baseUrl、模型、API Key 密码框）+「测试连接」
   - 测试连接成功才能保存；失败显示具体原因（401 → 「密钥不对」；404 → 「模型名不对」；超时 → 「连接超时，检查网络或 baseUrl」）
2. **使用站点默认密钥** 开关：**只有 `is_site_admin = 1` 的用户能看到**，默认关。文案明确写「打开后会消耗站长的额度」。
3. **外观** 卡片（把档案页的 ThemeToggle 挪过来，档案页保留一行指向设置）。

## 五、测试连接接口

`app/api/ai/test/route.ts`（POST，需登录）：

- 入参：`{ provider, baseUrl, model, apiKey }`
- 服务端请求 `POST {baseUrl}/chat/completions`，body：`{ model, messages:[{role:'user',content:'ping'}], max_tokens: 8, temperature: 0 }`，`Authorization: Bearer <key>`
- 10 秒超时（AbortController）
- 返回 `{ ok:true }` 或 `{ ok:false, error:'<中文原因>' }`
- **日志里绝不能出现 key**；错误信息里也不能回显 key（`sk-****abcd` 之外）
- 限流：同一用户 10 秒内最多 3 次

## 六、解析接口改造（关键）

`app/api/parse/route.ts`：

1. 取当前用户 → 读 `ai_configs`
2. 有配置：解密 key，用它请求（baseUrl + model 用配置的）
3. 没配置：
   - 若 `is_site_admin = 1` 且 `useSiteKey = 1` 且 env 有 `DEEPSEEK_API_KEY` → 用站点 key（保持现状）
   - 否则返回 **409** `{ ok:false, code:'NO_AI_CONFIG', error:'还没有配置你的模型密钥，去设置里填一下就能用一句话记' }`
4. 前端（`QuickLogSheet`）收到 `NO_AI_CONFIG`：不弹错误，显示一张小卡片「先用你自己的模型密钥」+「去设置」按钮
5. `ai_parses` 表增加 `configId` 或 `usedSiteKey` 字段（迁移里一起加），记录这次用的是谁的 key，便于以后排查

## 边界

允许改：`lib/schema.ts`、`drizzle/**`、`lib/crypto.ts`（新）、`lib/providers.ts`（新）、`lib/ai-config.ts`（新，读取/保存配置）、`app/settings/page.tsx`（新）、`components/AiConfigForm.tsx`（新）、`app/api/ai/test/route.ts`（新）、`app/api/parse/route.ts`、`components/QuickLogSheet.tsx`（只改错误分支）、`components/SideNav.tsx` + `app/(tabs)/profile/page.tsx`（加设置入口）。
禁止改：`middleware.ts`、`lib/auth.ts`、其他业务页面、CI/Docker。
禁止新增依赖（node:crypto 够用）。

## 验收（自己跑并贴输出）

```bash
npx tsc --noEmit && npm run build
node -e "..."   # 加密 roundtrip 自测，至少 100 次
```

必须验证的四条路径（用 `data/cat.db` 副本 + 临时用户，不动正式数据）：

1. 未配置密钥的普通用户 → `POST /api/parse` 返回 409 且 `code=NO_AI_CONFIG`，**且响应时间 < 1 秒（说明没有去调外部 API）**
2. 配了假 key 的用户 → 返回可读错误（401/网络错误），而不是 500
3. 配了真 key 的用户 → 解析成功（这条委托方会用自己的 key 复验，你只需保证代码路径正确）
4. 非 admin 用户即使数据库里把 `use_site_key` 改成 1，也不能用站点 key

## 禁止

- 不允许任何形式的默认回落（除 admin 显式开关）
- 不允许把 key 明文写日志、写 CSV、写错误信息
- 不允许把 `key_cipher` 通过接口返回给前端
