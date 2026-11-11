'use client';

import { Hospital, MapPin, Pencil, Phone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { saveHospital } from '@/app/actions/profile';
import type { HospitalInfo } from '@/lib/hospital';

type HospitalCardProps = {
  catId: string;
  initial: HospitalInfo;
};

const INPUT_CLASS =
  'h-12 w-full rounded-2xl border border-ink/10 bg-white/60 px-4 text-[15px] text-ink outline-none transition placeholder:text-muted/60 focus:border-gold focus:ring-2 focus:ring-gold/30 dark:border-white/10 dark:bg-white/[0.04] dark:text-cream dark:placeholder:text-cream/30';

const LABEL_CLASS =
  'mb-1.5 block text-xs font-semibold text-ink dark:text-cream';

function phoneHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export default function HospitalCard({ catId, initial }: HospitalCardProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone);
  const [address, setAddress] = useState(initial.address);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setName(initial.name);
    setPhone(initial.phone);
    setAddress(initial.address);
    setError(null);
    setEditing(true);
  }

  function cancelEdit() {
    if (pending) {
      return;
    }

    setError(null);
    setEditing(false);
  }

  async function handleSubmit(formData: FormData) {
    if (pending) {
      return;
    }

    setPending(true);
    setError(null);

    try {
      const result = await saveHospital(catId, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setEditing(false);
      router.refresh();
    } catch (cause) {
      console.error('[profile] 保存医院失败', cause);
      setError('保存失败，请检查网络后重试');
    } finally {
      setPending(false);
    }
  }

  const savedPhone = initial.phone.trim();

  return (
    <section className="rounded-[20px] bg-white p-5 shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink dark:text-cream">
          <Hospital
            size={15}
            className="text-gold-deep dark:text-gold"
            aria-hidden="true"
          />
          常去医院
        </h2>

        {!editing ? (
          <button
            type="button"
            onClick={startEdit}
            className="inline-flex h-11 min-h-[44px] items-center gap-1 rounded-full px-3 text-xs font-semibold text-gold-deep transition-colors hover:bg-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold dark:text-gold"
          >
            <Pencil size={14} aria-hidden="true" />
            编辑
          </button>
        ) : null}
      </div>

      {editing ? (
        <form action={handleSubmit} className="mt-3 space-y-3">
          <label className="block">
            <span className={LABEL_CLASS}>医院名称</span>
            <input
              type="text"
              name="name"
              required
              maxLength={60}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：安心宠物医院"
              className={INPUT_CLASS}
            />
          </label>

          <label className="block">
            <span className={LABEL_CLASS}>电话</span>
            <input
              type="tel"
              name="phone"
              maxLength={30}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="例如：0769-12345678"
              className={INPUT_CLASS}
            />
          </label>

          <label className="block">
            <span className={LABEL_CLASS}>地址</span>
            <input
              type="text"
              name="address"
              maxLength={120}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="例如：东莞市南城街道…"
              className={INPUT_CLASS}
            />
          </label>

          {error ? (
            <p
              role="alert"
              className="rounded-xl bg-coral/10 px-3 py-2 text-sm font-medium text-coral"
            >
              {error}
            </p>
          ) : null}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={cancelEdit}
              disabled={pending}
              className="h-11 min-h-[44px] flex-1 rounded-xl border border-ink/10 text-sm font-semibold text-ink transition-colors hover:bg-ink/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-cream dark:hover:bg-white/[0.06]"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={pending}
              className="h-11 min-h-[44px] flex-1 rounded-xl bg-gold text-sm font-semibold text-ink transition-colors hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? '保存中…' : '保存'}
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-3 space-y-2">
          {initial.name ? (
            <p className="text-base font-semibold text-ink dark:text-cream">
              {initial.name}
            </p>
          ) : (
            <p className="text-sm text-muted">还没有填写常去医院</p>
          )}

          <p className="flex items-center gap-2 text-sm text-muted">
            <Phone size={14} aria-hidden="true" />
            {savedPhone ? (
              <a
                href={phoneHref(savedPhone)}
                className="font-medium text-gold-deep underline-offset-2 hover:underline dark:text-gold"
              >
                {savedPhone}
              </a>
            ) : (
              <span>电话未填写</span>
            )}
          </p>

          <p className="flex items-start gap-2 text-sm leading-5 text-muted">
            <MapPin size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{initial.address || '地址未填写'}</span>
          </p>
        </div>
      )}
    </section>
  );
}
