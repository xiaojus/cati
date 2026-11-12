import { Palette, Sparkles } from 'lucide-react';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import {
  deleteAiConfig,
  getAiConfigSummary,
  isSiteAdmin,
  saveAiConfig,
  setUseSiteKey,
} from '@/lib/ai-config';
import { requireUser } from '@/lib/auth';
import AppShell from '@/components/AppShell';
import AiConfigForm, {
  type AiConfigFormValues,
  type SaveAiConfigResult,
  type SimpleActionResult,
} from '@/components/AiConfigForm';
import ThemeToggle, { type Theme } from '@/components/ThemeToggle';

// cacheComponents 下页面读取 cookies / session，显式允许阻塞预渲染。
export const instant = false;

async function saveAiConfigAction(
  values: AiConfigFormValues,
): Promise<SaveAiConfigResult> {
  'use server';

  const user = await requireUser();

  try {
    const result = await saveAiConfig(user.id, values);
    if (result.ok) {
      revalidatePath('/settings');
    }
    return result;
  } catch (error) {
    console.error('[settings] 保存 AI 配置失败', error);
    return { ok: false, error: '保存失败，请稍后再试' };
  }
}

async function deleteAiConfigAction(): Promise<SimpleActionResult> {
  'use server';

  const user = await requireUser();

  try {
    await deleteAiConfig(user.id);
    revalidatePath('/settings');
    return { ok: true };
  } catch (error) {
    console.error('[settings] 删除 AI 配置失败', error);
    return { ok: false, error: '删除失败，请稍后再试' };
  }
}

async function setSiteKeyAction(
  enabled: boolean,
): Promise<SimpleActionResult> {
  'use server';

  const user = await requireUser();
  const result = await setUseSiteKey(user.id, enabled);
  if (result.ok) {
    revalidatePath('/settings');
  }
  return result;
}

export default async function SettingsPage() {
  const user = await requireUser();
  const [config, admin] = await Promise.all([
    getAiConfigSummary(user.id),
    isSiteAdmin(user.id),
  ]);

  const savedTheme = (await cookies()).get('cati_theme')?.value;
  const initialTheme: Theme =
    savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : 'system';

  const siteKeyConfigured = Boolean(
    process.env.DEEPSEEK_API_KEY?.trim(),
  );

  return (
    <AppShell>
      <div className="pb-6">
        <header className="mb-5">
          <p className="text-sm text-muted">账号与模型</p>
          <h1 className="mt-1 text-[28px] font-bold tracking-tight">设置</h1>
        </header>

        <div className="grid gap-4 md:grid-cols-2 md:items-start">
          <section className="rounded-[20px] bg-white p-5 shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06]">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink dark:text-cream">
              <Sparkles
                size={15}
                className="text-gold-deep dark:text-gold"
                aria-hidden="true"
              />
              AI 解析
            </h2>
            <p className="mt-1 text-xs leading-5 text-muted">
              用一句话记状态时，会消耗你自己的模型额度。没有配置自己的密钥时不会自动使用站点密钥。
            </p>

            <div className="mt-4">
              <AiConfigForm
                initialConfig={config}
                isSiteAdmin={admin}
                siteKeyConfigured={siteKeyConfigured}
                saveAction={saveAiConfigAction}
                deleteAction={deleteAiConfigAction}
                setSiteKeyAction={setSiteKeyAction}
              />
            </div>
          </section>

          <div className="space-y-4">
            <section className="rounded-[20px] bg-white p-5 shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06]">
              <div className="flex items-center justify-between gap-3">
                <h2 className="flex shrink-0 items-center gap-2 text-sm font-semibold text-ink dark:text-cream">
                  <Palette
                    size={15}
                    className="text-gold-deep dark:text-gold"
                    aria-hidden="true"
                  />
                  外观
                </h2>
                <ThemeToggle initial={initialTheme} />
              </div>
              <p className="mt-2 text-[11px] leading-5 text-muted">
                主题偏好保存在当前浏览器。
              </p>
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
