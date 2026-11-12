import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  chatCompletionsUrl,
  resolveAiRuntimeConfig,
} from '@/lib/ai-config';
import { getSessionUser } from '@/lib/auth';
import { isValidDateString, todayInShanghai } from '@/lib/dates';
import { db } from '@/lib/db';
import { aiParses } from '@/lib/schema';

const PARSE_TIMEOUT_MS = 8_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

const integerRanges = {
  appetite: [1, 5],
  water: [1, 5],
  stool_score: [1, 7],
  stool_count: [0, 10],
  vomit_count: [0, 10],
  energy: [1, 5],
} as const;

const fieldLabels: Record<keyof typeof integerRanges | 'weight_g', string> = {
  appetite: '食欲',
  water: '饮水',
  stool_score: '便便评分',
  stool_count: '便便次数',
  vomit_count: '呕吐次数',
  energy: '精神',
  weight_g: '体重',
};

/** 同一用户 60 秒内最多解析 10 次（模块级内存即可，多实例下各自计数）。 */
const rateLimitBuckets = new Map<string, number[]>();

function allowRequest(userId: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const recent = (rateLimitBuckets.get(userId) ?? []).filter(
    (timestamp) => timestamp > windowStart,
  );

  if (recent.length >= RATE_LIMIT_MAX) {
    rateLimitBuckets.set(userId, recent);
    return false;
  }

  recent.push(now);
  rateLimitBuckets.set(userId, recent);

  // 顺手清理过期桶，避免 Map 无限增长。
  if (rateLimitBuckets.size > 500) {
    for (const [key, timestamps] of rateLimitBuckets) {
      if (timestamps.every((timestamp) => timestamp <= windowStart)) {
        rateLimitBuckets.delete(key);
      }
    }
  }

  return true;
}

type DangerRule = {
  /** 原文里出现这些词，才允许保留对应类别的 warning。 */
  raw: string[];
  /** warning 文案命中这些词，才算对应类别。 */
  warning: string[];
};

const dangerRules: DangerRule[] = [
  { raw: ['血'], warning: ['血'] },
  {
    raw: [
      '不吃不喝',
      '不吃',
      '不喝',
      '拒食',
      '食欲废绝',
      '食欲差',
      '食欲下降',
      '吃得少',
      '没胃口',
    ],
    warning: ['不吃', '不喝', '拒食', '食欲', '进食', '吃喝', '胃口'],
  },
  {
    raw: [
      '频繁呕吐',
      '反复呕吐',
      '多次呕吐',
      '一直吐',
      '不停吐',
      '吐了',
      '呕吐',
      '干呕',
    ],
    warning: ['呕吐', '吐'],
  },
  {
    raw: [
      '精神差',
      '精神极差',
      '精神萎靡',
      '精神不好',
      '没精神',
      '无精打采',
      '萎靡',
      '嗜睡',
      '蔫',
      '不爱动',
    ],
    warning: ['精神', '萎靡', '嗜睡', '无精打采', '蔫', '不爱动'],
  },
  {
    raw: ['尿不出', '尿不出来', '无法排尿', '排尿困难', '尿闭', '没尿'],
    warning: ['尿不出', '排尿', '尿闭', '没尿', '尿'],
  },
];

function isGroundedWarning(warning: string, rawText: string): boolean {
  return dangerRules.some(
    (rule) =>
      rule.warning.some((keyword) => warning.includes(keyword)) &&
      rule.raw.some((keyword) => rawText.includes(keyword)),
  );
}

function fail(status: number, error: string) {
  return Response.json({ ok: false, error }, { status });
}

function buildSystemPrompt(today: string): string {
  const yesterdayDate = new Date(`${today}T00:00:00+08:00`);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = yesterdayDate.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });

  return `你是「煤球」猫咪健康记录 App 的口语记录解析器。你只输出一个 JSON 对象，不要输出 Markdown、解释或任何多余文字。

今天是 ${today}（Asia/Shanghai）。请把口语里的相对日期换算成具体的 YYYY-MM-DD：
- 「今天」= ${today}
- 「昨天」= 今天的前一天
- 「前天」= 今天的往前第 2 天
- 「上周三」「上周五」等 = 上一个对应的星期几（严格早于今天）
- 没说日期时 date 填 null，由服务端按今天处理
- date 不能晚于今天

只输出以下字段：
{
  "date": "YYYY-MM-DD 或 null",
  "appetite": 1–5 的整数或 null,
  "water": 1–5 的整数或 null,
  "stool_score": 1–7 的整数或 null,
  "stool_count": 0–10 的整数或 null,
  "vomit_count": 0–10 的整数或 null,
  "energy": 1–5 的整数或 null,
  "weight_g": 500–15000 的整数（单位克）或 null,
  "note": "不超过 30 字的字符串或 null",
  "warnings": ["字符串", ...]
}

规则：
1. 用户没提到的指标才填 null。**但用户用日常语言描述了状态时，必须按下面的语义映射表换算成分值**，这是理解而不是猜测；把"完全没提"和"用了口语描述"区分清楚。
2. 语义映射表（出现的口语 → 分值）：
   - appetite 食欲：吃光了/吃得很香/狼吞虎咽/大半碗以上=5；吃得正常/吃了大半=4；吃了一半/吃得一般=3；吃得少/吃了几口/剩了一半=2；几乎没吃/没吃/拒食=1
   - water 饮水：喝得多/一直喝=5；喝了正常量=4；喝了点水/正常喝=3；喝得少=2；几乎不喝/不喝=1
   - stool_score 便便：干硬/颗粒/羊屎蛋=1–2；成型条状/正常=3–4；有点软/偏软/湿软=5；糊状/泥状/不成形=6；水样/拉稀/稀水=7
   - energy 精神：疯跑/很活跃/精神很好=5；正常活动/精神不错=4；还行/一般=3；有点蔫/没精神/躲着=2；趴着不动/精神极差=1
   - stool_count：拉了一次=1，拉了两次=2；没写次数但写了"拉了"=1
   - vomit_count：没吐=0，吐了两次=2
3. weight_g 的单位是克：「3.2 公斤」= 3200，「六斤」= 3000，「3.25kg」= 3250。
4. note 只放**没有被上面字段吸收**的补充信息（比如"一直躲着""换了新猫粮""拉完就回窝"），最多 30 字，不要重复已经填进分值的描述，不要加诊断。
5. warnings 仅在原文出现「血便 / 便血 / 呕吐带血 / 不吃不喝 / 频繁呕吐 / 反复呕吐 / 精神极差 / 精神差 / 尿不出 / 排尿困难」等危险信号时填写；每条只陈述事实，不做诊断、不给用药建议；没有就填 []。
6. date 严格按上面规则换算，不能晚于今天。
7. 只输出 JSON，不要代码块标记。

示例（假设今天 ${today}，昨天 ${yesterday}）：
输入：昨天吃了大半碗，喝了点水，拉了一次有点软，精神还行，没吐
输出：{"date":"${yesterday}","appetite":4,"water":3,"stool_score":5,"stool_count":1,"vomit_count":0,"energy":3,"weight_g":null,"note":null,"warnings":[]}

输入：今早吐了两次，饭基本没吃，一直躲着
输出：{"date":"${today}","appetite":1,"water":null,"stool_score":null,"stool_count":null,"vomit_count":2,"energy":2,"weight_g":null,"note":"一直躲着","warnings":["频繁呕吐","几乎不吃"]}

输入：刚称了，3.2 公斤
输出：{"date":"${today}","appetite":null,"water":null,"stool_score":null,"stool_count":null,"vomit_count":null,"energy":null,"weight_g":3200,"note":null,"warnings":[]}`;
}

function readInteger(
  value: unknown,
  min: number,
  max: number,
  label: string,
  dropped: string[],
): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const normalized =
    typeof value === 'string' && value.trim() !== ''
      ? Number(value.trim())
      : value;
  const parsed = z.number().int().min(min).max(max).safeParse(normalized);

  if (!parsed.success) {
    dropped.push(label);
    return null;
  }

  return parsed.data;
}

type NormalizedParse = {
  date: string;
  appetite: number | null;
  water: number | null;
  stool_score: number | null;
  stool_count: number | null;
  vomit_count: number | null;
  energy: number | null;
  weight_g: number | null;
  note: string | null;
  warnings: string[];
  dropped: string[];
};

function normalizeParse(raw: Record<string, unknown>, rawText: string): NormalizedParse {
  const today = todayInShanghai();
  const dropped: string[] = [];

  const rawDate = typeof raw.date === 'string' ? raw.date.trim() : '';
  const date =
    isValidDateString(rawDate) && rawDate <= today ? rawDate : today;

  const normalized: NormalizedParse = {
    date,
    appetite: null,
    water: null,
    stool_score: null,
    stool_count: null,
    vomit_count: null,
    energy: null,
    weight_g: null,
    note: null,
    warnings: [],
    dropped,
  };

  for (const [field, range] of Object.entries(integerRanges)) {
    const key = field as keyof typeof integerRanges;
    normalized[key] = readInteger(
      raw[key],
      range[0],
      range[1],
      fieldLabels[key],
      dropped,
    );
  }

  normalized.weight_g = readInteger(
    raw.weight_g,
    500,
    15_000,
    fieldLabels.weight_g,
    dropped,
  );

  const rawNote = typeof raw.note === 'string' ? raw.note.trim() : '';
  normalized.note = rawNote === '' ? null : rawNote.slice(0, 30);

  const rawWarnings = Array.isArray(raw.warnings)
    ? raw.warnings
        .filter((warning): warning is string => typeof warning === 'string')
        .map((warning) => warning.trim())
        .filter(Boolean)
    : [];

  normalized.warnings = [
    ...new Set(
      rawWarnings.filter((warning) => isGroundedWarning(warning, rawText)),
    ),
  ].slice(0, 5);

  return normalized;
}

function stripJsonFence(content: string): string {
  return content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return fail(401, '登录已过期，请重新登录后再试');
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return fail(400, '请说一句 1–300 字的记录');
  }

  const rawText =
    typeof payload === 'object' &&
    payload !== null &&
    typeof (payload as { text?: unknown }).text === 'string'
      ? (payload as { text: string }).text
      : '';

  const textResult = z.string().trim().min(1).max(300).safeParse(rawText);
  if (!textResult.success) {
    return fail(400, '请说一句 1–300 字的记录');
  }

  const text = textResult.data;

  /*
   * 取 key 的唯一入口：个人配置 → 仅管理员显式打开的站点 key → 无配置。
   * 这里绝不能自己读 DEEPSEEK_API_KEY 做默认回落。
   */
  const runtime = await resolveAiRuntimeConfig(user.id);

  if (runtime.status === 'no_config') {
    return Response.json(
      {
        ok: false,
        code: 'NO_AI_CONFIG',
        error: '还没有配置你的模型密钥，去设置里填一下就能用一句话记',
      },
      { status: 409 },
    );
  }

  if (runtime.status === 'decrypt_error') {
    return fail(503, '模型密钥无法解密，请到设置里重新配置');
  }

  if (!allowRequest(user.id)) {
    return fail(429, '解析太频繁，请稍后再试');
  }

  const today = todayInShanghai();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PARSE_TIMEOUT_MS);

  let content: string;
  try {
    const response = await fetch(chatCompletionsUrl(runtime.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${runtime.apiKey}`,
      },
      body: JSON.stringify({
        model: runtime.model,
        messages: [
          { role: 'system', content: buildSystemPrompt(today) },
          { role: 'user', content: text },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error('[api/parse] 模型服务返回异常', response.status);

      if (response.status === 401 || response.status === 403) {
        return fail(502, '模型密钥不对，请到设置里检查');
      }

      if (response.status === 404) {
        return fail(502, '模型名或接口地址不对，请到设置里检查');
      }

      if (response.status === 429) {
        return fail(502, '模型服务限流，请稍后再试');
      }

      return fail(502, '解析失败，请手动填写');
    }

    const completion = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const messageContent = completion.choices?.[0]?.message?.content;

    if (typeof messageContent !== 'string' || messageContent.trim() === '') {
      console.error('[api/parse] 模型返回内容为空');
      return fail(502, '解析失败，请手动填写');
    }

    content = messageContent;
  } catch (error) {
    if (controller.signal.aborted) {
      return fail(504, '解析超时，请手动填写');
    }

    console.error(
      '[api/parse] 请求模型服务失败',
      error instanceof Error ? error.message : 'unknown',
    );
    return fail(502, '连接模型服务失败，请检查网络或设置里的 baseUrl');
  } finally {
    clearTimeout(timeout);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(content));
  } catch (error) {
    console.error('[api/parse] 模型输出不是合法 JSON', error);
    return fail(502, '解析失败，请手动填写');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return fail(502, '解析失败，请手动填写');
  }

  const data = normalizeParse(parsed as Record<string, unknown>, text);
  const parseId = randomUUID();

  try {
    await db.insert(aiParses).values({
      id: parseId,
      userId: user.id,
      rawText: text,
      parsedJson: JSON.stringify(data),
      accepted: 0,
      usedSiteKey: runtime.usedSiteKey ? 1 : 0,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[api/parse] 写入 ai_parses 失败', error);
    return fail(500, '解析结果保存失败，请手动填写');
  }

  return Response.json({ ok: true, data, aiParseId: parseId });
}
