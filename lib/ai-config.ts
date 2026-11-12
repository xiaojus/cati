/**
 * 仅服务端使用。
 *
 * 每用户大模型配置的读取、保存、删除，以及「这次请求该用谁的 key」的
 * 唯一判定入口。任何调用方都不允许自己回落到 DEEPSEEK_API_KEY。
 */
import { eq } from 'drizzle-orm';
import { decryptSecret, encryptSecret } from './crypto';
import { db } from './db';
import { getProvider } from './providers';
import { aiConfigs, users, type AiConfig } from './schema';

/** 站点默认密钥固定走 DeepSeek（与 T6 的行为一致）。 */
export const SITE_DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
export const SITE_DEEPSEEK_MODEL = 'deepseek-chat';

const TEST_TIMEOUT_MS = 10_000;

export type AiConfigSummary = {
  provider: string;
  baseUrl: string;
  model: string;
  /** 密钥末四位，只用于展示。 */
  keyHint: string;
  verifiedAt: string | null;
  useSiteKey: boolean;
  /** 是否真的保存了个人密钥（站点开关行没有个人密钥）。 */
  hasKey: boolean;
};

export type AiConfigInput = {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
};

export type SaveAiConfigResult =
  | { ok: true; config: AiConfigSummary }
  | { ok: false; error: string };

export type SimpleActionResult =
  | { ok: true }
  | { ok: false; error: string };

/** 本次解析可用的配置；`no_config` 时调用方必须返回 409，不能回落。 */
export type AiRuntimeConfig =
  | {
      status: 'ok';
      provider: string;
      apiKey: string;
      baseUrl: string;
      model: string;
      usedSiteKey: boolean;
    }
  | { status: 'no_config' }
  | { status: 'decrypt_error' };

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

/** 用户填 root baseUrl，也兼容直接粘贴完整 /chat/completions 地址。 */
export function chatCompletionsUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);
  return normalized.endsWith('/chat/completions')
    ? normalized
    : `${normalized}/chat/completions`;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function toSummary(row: AiConfig): AiConfigSummary {
  return {
    provider: row.provider,
    baseUrl: row.baseUrl,
    model: row.model,
    keyHint: row.keyHint,
    verifiedAt: row.verifiedAt,
    useSiteKey: row.useSiteKey === 1,
    hasKey: row.keyCipher !== '' && row.keyHint !== '',
  };
}

async function getAiConfigRow(userId: string): Promise<AiConfig | undefined> {
  const [row] = await db
    .select()
    .from(aiConfigs)
    .where(eq(aiConfigs.userId, userId))
    .limit(1);

  return row;
}

export async function getAiConfigSummary(
  userId: string,
): Promise<AiConfigSummary | null> {
  const row = await getAiConfigRow(userId);
  return row ? toSummary(row) : null;
}

export async function isSiteAdmin(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ isSiteAdmin: users.isSiteAdmin })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return row?.isSiteAdmin === 1;
}

/**
 * OpenAI 兼容的连通性测试。
 *
 * 错误文案里绝不带 key，也不把上游响应体写日志——很多服务商会回显请求头。
 */
export async function testProviderConnection(input: {
  baseUrl: string;
  model: string;
  apiKey: string;
}): Promise<SimpleActionResult> {
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const model = input.model.trim();
  const apiKey = input.apiKey.trim();

  if (!isValidHttpUrl(baseUrl)) {
    return { ok: false, error: '接口地址要填 http(s) 开头的完整地址' };
  }

  if (!model) {
    return { ok: false, error: '请填写或选择模型' };
  }

  if (!apiKey) {
    return { ok: false, error: '请填写 API Key' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);

  try {
    const response = await fetch(chatCompletionsUrl(baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 8,
        temperature: 0,
      }),
      signal: controller.signal,
    });

    // 丢弃响应体，避免把可能回显 key 的内容留在内存或日志里。
    await response.text().catch(() => '');

    if (response.ok) {
      return { ok: true };
    }

    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: '密钥不对' };
    }

    if (response.status === 404) {
      return { ok: false, error: '模型名不对' };
    }

    if (response.status === 429) {
      return { ok: false, error: '服务商限流，请稍后再试' };
    }

    return {
      ok: false,
      error: `测试失败（HTTP ${response.status}），请检查服务商、模型与密钥`,
    };
  } catch {
    if (controller.signal.aborted) {
      return { ok: false, error: '连接超时，检查网络或 baseUrl' };
    }

    return { ok: false, error: '连接失败，检查网络或 baseUrl' };
  } finally {
    clearTimeout(timeout);
  }
}

/** 测试成功后才加密写入；站点开关不会被这里的 upsert 覆盖。 */
export async function saveAiConfig(
  userId: string,
  input: AiConfigInput,
): Promise<SaveAiConfigResult> {
  const provider = getProvider(input.provider);
  if (!provider) {
    return { ok: false, error: '请选择服务商' };
  }

  const baseUrl = normalizeBaseUrl(input.baseUrl);
  if (!isValidHttpUrl(baseUrl)) {
    return { ok: false, error: '接口地址要填 http(s) 开头的完整地址' };
  }

  const model = input.model.trim();
  if (!model) {
    return { ok: false, error: '请填写或选择模型' };
  }

  const apiKey = input.apiKey.trim();
  if (!apiKey) {
    return { ok: false, error: '请填写 API Key' };
  }

  let keyCipher: string;
  try {
    keyCipher = encryptSecret(apiKey);
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : '没有配置 CAT_SECRET_KEY，无法保存密钥',
    };
  }

  const tested = await testProviderConnection({ baseUrl, model, apiKey });
  if (!tested.ok) {
    return tested;
  }

  const now = new Date().toISOString();
  const keyHint = apiKey.slice(-4);

  try {
    await db
      .insert(aiConfigs)
      .values({
        userId,
        provider: provider.id,
        baseUrl,
        model,
        keyCipher,
        keyHint,
        verifiedAt: now,
        useSiteKey: 0,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: aiConfigs.userId,
        set: {
          provider: provider.id,
          baseUrl,
          model,
          keyCipher,
          keyHint,
          verifiedAt: now,
          updatedAt: now,
        },
      });
  } catch (error) {
    console.error('[ai-config] 保存配置失败', error);
    return { ok: false, error: '保存失败，请稍后再试' };
  }

  const row = await getAiConfigRow(userId);
  if (!row) {
    return { ok: false, error: '保存失败，请稍后再试' };
  }

  return { ok: true, config: toSummary(row) };
}

export async function deleteAiConfig(userId: string): Promise<void> {
  await db.delete(aiConfigs).where(eq(aiConfigs.userId, userId));
}

/**
 * 站点默认密钥开关。
 *
 * 没有个人配置的管理员也需要一个落点，因此这里用一条 key_cipher 为空的
 * 配置行来记住 use_site_key；关闭且没有个人密钥时把这条空行删掉。
 */
export async function setUseSiteKey(
  userId: string,
  enabled: boolean,
): Promise<SimpleActionResult> {
  if (!(await isSiteAdmin(userId))) {
    return { ok: false, error: '只有站点管理员可以打开这个开关' };
  }

  const existing = await getAiConfigRow(userId);
  const now = new Date().toISOString();

  try {
    if (!existing) {
      if (enabled) {
        await db.insert(aiConfigs).values({
          userId,
          provider: 'deepseek',
          baseUrl: SITE_DEEPSEEK_BASE_URL,
          model: SITE_DEEPSEEK_MODEL,
          keyCipher: '',
          keyHint: '',
          verifiedAt: null,
          useSiteKey: 1,
          createdAt: now,
          updatedAt: now,
        });
      }
    } else if (enabled) {
      await db
        .update(aiConfigs)
        .set({ useSiteKey: 1, updatedAt: now })
        .where(eq(aiConfigs.userId, userId));
    } else if (existing.keyCipher === '') {
      await db.delete(aiConfigs).where(eq(aiConfigs.userId, userId));
    } else {
      await db
        .update(aiConfigs)
        .set({ useSiteKey: 0, updatedAt: now })
        .where(eq(aiConfigs.userId, userId));
    }
  } catch (error) {
    console.error('[ai-config] 保存站点密钥开关失败', error);
    return { ok: false, error: '保存失败，请稍后再试' };
  }

  return { ok: true };
}

/**
 * 解析接口的唯一取 key 入口。
 *
 * 顺序：个人配置 → （仅 site admin 且显式打开开关）站点 key → 无配置。
 * 非管理员即使数据库里的 use_site_key 被改成 1，也走不到站点 key。
 */
export async function resolveAiRuntimeConfig(
  userId: string,
): Promise<AiRuntimeConfig> {
  const config = await getAiConfigRow(userId);
  const hasPersonalKey = Boolean(
    config && config.keyCipher !== '' && config.keyHint !== '',
  );

  if (config && hasPersonalKey) {
    try {
      const apiKey = decryptSecret(config.keyCipher);
      if (apiKey.trim() === '') {
        return { status: 'no_config' };
      }

      return {
        status: 'ok',
        provider: config.provider,
        apiKey,
        baseUrl: config.baseUrl,
        model: config.model,
        usedSiteKey: false,
      };
    } catch (error) {
      console.error(
        '[ai-config] 解密用户密钥失败',
        error instanceof Error ? error.message : 'unknown',
      );
      return { status: 'decrypt_error' };
    }
  }

  const siteKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (
    (await isSiteAdmin(userId)) &&
    config?.useSiteKey === 1 &&
    siteKey
  ) {
    return {
      status: 'ok',
      provider: 'deepseek',
      apiKey: siteKey,
      baseUrl: SITE_DEEPSEEK_BASE_URL,
      model: SITE_DEEPSEEK_MODEL,
      usedSiteKey: true,
    };
  }

  return { status: 'no_config' };
}
