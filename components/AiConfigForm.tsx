'use client';

import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useId, useState } from 'react';
import { PROVIDERS, getProvider } from '@/lib/providers';

export type AiConfigSummary = {
  provider: string;
  baseUrl: string;
  model: string;
  /** 密钥末四位，仅用于展示。 */
  keyHint: string;
  verifiedAt: string | null;
  useSiteKey: boolean;
  /** 是否保存了个人密钥；false 表示这行只记录了站点密钥开关。 */
  hasKey: boolean;
};

export type AiConfigFormValues = {
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

type AiConfigFormProps = {
  initialConfig: AiConfigSummary | null;
  isSiteAdmin: boolean;
  siteKeyConfigured: boolean;
  saveAction: (values: AiConfigFormValues) => Promise<SaveAiConfigResult>;
  deleteAction: () => Promise<SimpleActionResult>;
  setSiteKeyAction: (enabled: boolean) => Promise<SimpleActionResult>;
};

const INPUT_CLASS =
  'h-12 w-full rounded-2xl border border-ink/10 bg-white/60 px-4 text-[15px] text-ink outline-none transition placeholder:text-muted/60 focus:border-gold focus:ring-2 focus:ring-gold/30 dark:border-white/10 dark:bg-white/[0.04] dark:text-cream dark:placeholder:text-cream/30';

const LABEL_CLASS =
  'mb-1.5 block text-xs font-semibold text-ink dark:text-cream';

const DEFAULT_PROVIDER = getProvider('deepseek') ?? PROVIDERS[0];

function formatVerifiedAt(value: string | null): string {
  if (!value) {
    return '尚未验证';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '尚未验证';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export default function AiConfigForm({
  initialConfig,
  isSiteAdmin,
  siteKeyConfigured,
  saveAction,
  deleteAction,
  setSiteKeyAction,
}: AiConfigFormProps) {
  const [config, setConfig] = useState<AiConfigSummary | null>(initialConfig);
  const hasPersonalKey = config?.hasKey === true;

  const [editing, setEditing] = useState(!hasPersonalKey);
  const [provider, setProvider] = useState(
    initialConfig?.provider ?? DEFAULT_PROVIDER.id,
  );
  const [baseUrl, setBaseUrl] = useState(
    initialConfig?.baseUrl || DEFAULT_PROVIDER.baseUrl,
  );
  const [model, setModel] = useState(
    initialConfig?.model || DEFAULT_PROVIDER.models[0] || '',
  );
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  const [testing, setTesting] = useState(false);
  const [testedFingerprint, setTestedFingerprint] = useState<string | null>(
    null,
  );
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    error?: string;
  } | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [siteKeyEnabled, setSiteKeyEnabled] = useState(
    initialConfig?.useSiteKey === true,
  );
  const [siteKeyPending, setSiteKeyPending] = useState(false);
  const [siteKeyError, setSiteKeyError] = useState<string | null>(null);

  const providerFieldId = useId();
  const baseUrlFieldId = useId();
  const modelFieldId = useId();
  const apiKeyFieldId = useId();

  const fingerprint = [provider, baseUrl, model, apiKey].join('\u0000');
  const testPassed = testedFingerprint === fingerprint && apiKey.trim() !== '';
  const providerMeta = getProvider(provider);
  const isCustom = provider === 'custom';

  function invalidateTest() {
    setTestedFingerprint(null);
    setTestResult(null);
    setSaveError(null);
  }

  function selectProvider(nextProvider: string) {
    setProvider(nextProvider);
    const meta = getProvider(nextProvider);
    if (meta) {
      setBaseUrl(meta.baseUrl);
      setModel(meta.models[0] ?? '');
    }
    invalidateTest();
  }

  async function handleTest() {
    if (testing) {
      return;
    }

    setTestResult(null);
    setTestedFingerprint(null);
    setSaveError(null);

    if (!apiKey.trim()) {
      setTestResult({ ok: false, error: '请填写 API Key' });
      return;
    }

    const snapshot = fingerprint;
    setTesting(true);

    try {
      const response = await fetch('/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, baseUrl, model, apiKey }),
      });
      const payload = (await response
        .json()
        .catch(() => null)) as { ok?: boolean; error?: string } | null;

      if (payload?.ok) {
        setTestResult({ ok: true });
        setTestedFingerprint(snapshot);
        return;
      }

      setTestResult({
        ok: false,
        error:
          payload?.error ??
          (response.status === 429
            ? '测试太频繁，请 10 秒后再试'
            : '测试失败，请检查配置'),
      });
    } catch {
      setTestResult({ ok: false, error: '网络异常，请稍后再试' });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    if (saving || !testPassed) {
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      const result = await saveAction({ provider, baseUrl, model, apiKey });
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }

      setConfig(result.config);
      setSiteKeyEnabled(result.config.useSiteKey);
      setEditing(false);
      setApiKey('');
      setShowKey(false);
      setTestedFingerprint(null);
      setTestResult(null);
    } catch {
      setSaveError('保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (deleting) {
      return;
    }

    if (
      !window.confirm(
        '删除后需要重新填写密钥才能继续使用 AI 解析，确定删除吗？',
      )
    ) {
      return;
    }

    setDeleting(true);
    setDeleteError(null);

    try {
      const result = await deleteAction();
      if (!result.ok) {
        setDeleteError(result.error);
        return;
      }

      setConfig(null);
      setSiteKeyEnabled(false);
      setProvider(DEFAULT_PROVIDER.id);
      setBaseUrl(DEFAULT_PROVIDER.baseUrl);
      setModel(DEFAULT_PROVIDER.models[0] ?? '');
      setApiKey('');
      setShowKey(false);
      setEditing(true);
      setTestedFingerprint(null);
      setTestResult(null);
      setSaveError(null);
    } catch {
      setDeleteError('删除失败，请稍后重试');
    } finally {
      setDeleting(false);
    }
  }

  async function toggleSiteKey() {
    if (siteKeyPending) {
      return;
    }

    const next = !siteKeyEnabled;
    setSiteKeyPending(true);
    setSiteKeyError(null);

    try {
      const result = await setSiteKeyAction(next);
      if (!result.ok) {
        setSiteKeyError(result.error);
        return;
      }

      setSiteKeyEnabled(next);
      setConfig((current) =>
        current ? { ...current, useSiteKey: next } : current,
      );
    } catch {
      setSiteKeyError('保存失败，请稍后重试');
    } finally {
      setSiteKeyPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {hasPersonalKey && config && !editing ? (
        <div className="rounded-2xl bg-ink/[0.035] p-4 dark:bg-white/[0.04]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-ink dark:text-cream">
                <ShieldCheck
                  size={15}
                  className="shrink-0 text-mint"
                  aria-hidden="true"
                />
                已配置
              </p>
              <dl className="mt-3 space-y-1.5 text-xs leading-5">
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0 text-muted">服务商</dt>
                  <dd className="min-w-0 truncate font-medium text-ink dark:text-cream">
                    {getProvider(config.provider)?.label ?? config.provider}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0 text-muted">模型</dt>
                  <dd className="min-w-0 truncate font-medium text-ink dark:text-cream">
                    {config.model}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0 text-muted">密钥</dt>
                  <dd className="min-w-0 truncate font-mono font-medium text-ink dark:text-cream">
                    sk-****{config.keyHint}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-16 shrink-0 text-muted">最近验证</dt>
                  <dd className="min-w-0 font-medium text-ink dark:text-cream">
                    {formatVerifiedAt(config.verifiedAt)}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="flex shrink-0 flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditing(true);
                  setProvider(config.provider);
                  setBaseUrl(config.baseUrl);
                  setModel(config.model);
                  setApiKey('');
                  setShowKey(false);
                  invalidateTest();
                }}
                className="inline-flex h-11 min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-ink/10 bg-white/60 px-3 text-xs font-semibold text-ink transition-colors hover:border-gold/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold dark:border-white/10 dark:bg-white/[0.04] dark:text-cream"
              >
                <RefreshCw size={14} aria-hidden="true" />
                重新配置
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex h-11 min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-coral/20 bg-coral/5 px-3 text-xs font-semibold text-coral transition-colors hover:bg-coral/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleting ? (
                  <Loader2
                    size={14}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Trash2 size={14} aria-hidden="true" />
                )}
                删除
              </button>
            </div>
          </div>

          {deleteError ? (
            <p role="alert" className="mt-2 text-xs font-medium text-coral">
              {deleteError}
            </p>
          ) : null}
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSave();
          }}
        >
          <div>
            <label htmlFor={providerFieldId} className={LABEL_CLASS}>
              服务商
            </label>
            <select
              id={providerFieldId}
              value={provider}
              onChange={(event) => selectProvider(event.target.value)}
              className={INPUT_CLASS}
            >
              {PROVIDERS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={baseUrlFieldId} className={LABEL_CLASS}>
              接口地址（baseUrl）
            </label>
            <input
              id={baseUrlFieldId}
              type="url"
              value={baseUrl}
              readOnly={!isCustom}
              onChange={(event) => {
                setBaseUrl(event.target.value);
                invalidateTest();
              }}
              placeholder="https://your-provider.example.com/v1"
              className={`${INPUT_CLASS} ${
                isCustom ? '' : 'cursor-not-allowed opacity-70'
              }`}
            />
            {!isCustom ? (
              <p className="mt-1 text-[11px] text-muted">
                选择服务商后自动填写；选「自定义」可手动修改。
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor={modelFieldId} className={LABEL_CLASS}>
              模型
            </label>
            {isCustom ? (
              <input
                id={modelFieldId}
                type="text"
                value={model}
                onChange={(event) => {
                  setModel(event.target.value);
                  invalidateTest();
                }}
                placeholder="例如：deepseek-chat"
                className={INPUT_CLASS}
              />
            ) : (
              <select
                id={modelFieldId}
                value={model}
                onChange={(event) => {
                  setModel(event.target.value);
                  invalidateTest();
                }}
                className={INPUT_CLASS}
              >
                {providerMeta?.models.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
                {model && !providerMeta?.models.includes(model) ? (
                  <option value={model}>{model}</option>
                ) : null}
              </select>
            )}
          </div>

          <div>
            <label htmlFor={apiKeyFieldId} className={LABEL_CLASS}>
              API Key
            </label>
            <div className="relative">
              <KeyRound
                size={16}
                aria-hidden="true"
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                id={apiKeyFieldId}
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(event) => {
                  setApiKey(event.target.value);
                  invalidateTest();
                }}
                autoComplete="off"
                spellCheck={false}
                placeholder="粘贴你的 API Key"
                className={`${INPUT_CLASS} pl-10 pr-12`}
              />
              <button
                type="button"
                onClick={() => setShowKey((current) => !current)}
                aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}
                className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted transition-colors hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold dark:hover:bg-white/10 dark:hover:text-cream"
              >
                {showKey ? (
                  <EyeOff size={16} aria-hidden="true" />
                ) : (
                  <Eye size={16} aria-hidden="true" />
                )}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-muted">
              密钥加密保存在本机数据库，不会回显，也不会写进日志。
            </p>
          </div>

          {testResult ? (
            <p
              role={testResult.ok ? 'status' : 'alert'}
              className={`flex items-start gap-1.5 rounded-xl px-3 py-2 text-xs font-medium ${
                testResult.ok
                  ? 'bg-mint/10 text-mint'
                  : 'bg-coral/10 text-coral'
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2
                  size={14}
                  className="mt-0.5 shrink-0"
                  aria-hidden="true"
                />
              ) : (
                <TriangleAlert
                  size={14}
                  className="mt-0.5 shrink-0"
                  aria-hidden="true"
                />
              )}
              {testResult.ok ? '连接成功，可以保存了' : testResult.error}
            </p>
          ) : null}

          {saveError ? (
            <p role="alert" className="rounded-xl bg-coral/10 px-3 py-2 text-xs font-medium text-coral">
              {saveError}
            </p>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void handleTest()}
              disabled={testing}
              className="inline-flex h-12 min-h-[44px] flex-1 items-center justify-center gap-2 rounded-2xl border border-gold/40 bg-gold/10 text-sm font-semibold text-gold-deep transition-colors hover:bg-gold/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-60 dark:text-gold"
            >
              {testing ? (
                <>
                  <Loader2
                    size={16}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                  测试中…
                </>
              ) : (
                '测试连接'
              )}
            </button>

            <button
              type="submit"
              disabled={!testPassed || saving}
              className="inline-flex h-12 min-h-[44px] flex-1 items-center justify-center gap-2 rounded-2xl bg-gold text-sm font-semibold text-ink transition-colors hover:bg-gold-deep active:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2
                    size={16}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                  保存中…
                </>
              ) : (
                '保存配置'
              )}
            </button>
          </div>

          <p className="text-[11px] leading-5 text-muted">
            必须先测试连接成功才能保存。保存时会再验证一次，避免密钥过期后仍被写入。
          </p>

          {hasPersonalKey && config ? (
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setApiKey('');
                setShowKey(false);
                invalidateTest();
              }}
              className="h-11 w-full rounded-xl text-xs font-semibold text-muted transition-colors hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold dark:hover:bg-white/10 dark:hover:text-cream"
            >
              取消
            </button>
          ) : null}
        </form>
      )}

      {isSiteAdmin ? (
        <div className="rounded-2xl border border-gold/25 bg-gold/10 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink dark:text-cream">
                使用站点默认密钥
              </p>
              <p className="mt-1 text-[11px] leading-5 text-gold-deep dark:text-gold">
                打开后会消耗站长的额度。仅当你没有配置自己的密钥时才会使用站点
                DEEPSEEK_API_KEY。
              </p>
              {!siteKeyConfigured ? (
                <p className="mt-1 text-[11px] font-medium text-coral">
                  站点环境没有配置 DEEPSEEK_API_KEY，这个开关暂时不会生效。
                </p>
              ) : null}
              {siteKeyError ? (
                <p role="alert" className="mt-1 text-[11px] font-medium text-coral">
                  {siteKeyError}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={siteKeyEnabled}
              aria-label="使用站点默认密钥"
              onClick={() => void toggleSiteKey()}
              disabled={siteKeyPending || !siteKeyConfigured}
              className={`relative h-8 w-14 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                siteKeyEnabled ? 'bg-gold' : 'bg-ink/20 dark:bg-white/20'
              }`}
            >
              <span
                aria-hidden="true"
                className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${
                  siteKeyEnabled ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
