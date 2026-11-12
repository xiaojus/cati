'use client';

import {
  Bug,
  CalendarDays,
  ImagePlus,
  Pencil,
  Pill,
  Plus,
  Stethoscope,
  Syringe,
  Trash2,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { deleteRecord, saveRecord } from '@/app/actions/records';
import CatEmpty from '@/components/CatEmpty';
import { PhotoThumb } from '@/components/QuickLogSheet';
import { daysBetween, formatDateCn, isValidDateString } from '@/lib/dates';
import {
  RECORD_GROUP_KEYS,
  RECORD_GROUP_LABELS,
  RECORD_TYPE_LABELS,
  defaultNextDue,
  groupKeyForType,
  isRecordType,
  nextDueOffsetLabel,
  type RecordGroupKey,
  type RecordType,
} from '@/lib/record-meta';

export type RecordListItem = {
  id: string;
  type: string;
  name: string | null;
  eventDate: string;
  dose: string | null;
  drugName: string | null;
  doseMg: number | null;
  weightG: number | null;
  photoPath: string | null;
  nextDue: string | null;
  cost: number | null;
  vet: string | null;
  note: string | null;
  /** 记录人昵称（无昵称时为邮箱前缀）；老数据可能为 null。 */
  recorderName?: string | null;
};

type RecordsManagerProps = {
  records: RecordListItem[];
  today: string;
  catName: string;
  /** 最近一次 daily_logs 体重，用于驱虫给药体重的偏差提示。 */
  latestWeightG: number | null;
};

type GroupMeta = {
  hint: string;
  Icon: typeof Syringe;
};

const GROUP_META: Record<RecordGroupKey, GroupMeta> = {
  vaccine: { hint: '猫三联、狂犬等', Icon: Syringe },
  deworm_in: { hint: '按体重口服', Icon: Pill },
  deworm_out: { hint: '滴剂 / 喷剂', Icon: Bug },
  visit: { hint: '体检、复诊与用药', Icon: Stethoscope },
};

const INPUT_CLASS =
  'h-12 w-full rounded-2xl border border-ink/10 bg-white/60 px-4 text-[15px] text-ink outline-none transition placeholder:text-muted/60 focus:border-gold focus:ring-2 focus:ring-gold/30 dark:border-white/10 dark:bg-white/[0.04] dark:text-cream dark:placeholder:text-cream/30';

const LABEL_CLASS =
  'mb-2 block text-sm font-semibold text-ink dark:text-cream';

const STATUS_CLASS = {
  coral: { dot: 'bg-coral', text: 'text-coral' },
  gold: {
    dot: 'bg-gold',
    text: 'text-gold-deep dark:text-gold',
  },
} as const;

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const PHOTO_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
]);

function formatCost(cost: number): string {
  return Number.isInteger(cost) ? String(cost) : cost.toFixed(2);
}

function formatDoseMg(doseMg: number): string {
  return Number.isInteger(doseMg) ? String(doseMg) : doseMg.toFixed(2);
}

function formatWeightKg(weightG: number): string {
  return (weightG / 1000).toFixed(2);
}

function vaccineStatus(record: RecordListItem, today: string) {
  if (
    record.type !== 'vaccine' ||
    !record.nextDue ||
    !isValidDateString(record.nextDue)
  ) {
    return null;
  }

  const days = daysBetween(today, record.nextDue);

  if (days < 0) {
    return {
      tone: 'coral' as const,
      label: `已过期 ${Math.abs(days)} 天`,
    };
  }

  if (days <= 7) {
    return {
      tone: 'gold' as const,
      label: days === 0 ? '今天到期' : `${days} 天后到期`,
    };
  }

  return null;
}

export default function RecordsManager({
  records,
  today,
  catName,
  latestWeightG,
}: RecordsManagerProps) {
  const router = useRouter();
  const dialogTitleId = useId();
  const photoUrlRef = useRef<string | null>(null);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RecordListItem | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [formType, setFormType] = useState<RecordType>('vaccine');
  const [formDate, setFormDate] = useState(today);
  const [formNextDue, setFormNextDue] = useState('');
  const [formWeight, setFormWeight] = useState('');
  const [nextDueTouched, setNextDueTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoInputKey, setPhotoInputKey] = useState(0);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) {
        setOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, pending]);

  useEffect(() => {
    return () => {
      if (photoUrlRef.current) {
        URL.revokeObjectURL(photoUrlRef.current);
      }
    };
  }, []);

  function clearPhoto() {
    if (photoUrlRef.current) {
      URL.revokeObjectURL(photoUrlRef.current);
      photoUrlRef.current = null;
    }

    setPhotoFile(null);
    setPhotoPreviewUrl(null);
    setPhotoInputKey((value) => value + 1);
  }

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;

    if (!file) {
      clearPhoto();
      return;
    }

    if (!PHOTO_MIME_TYPES.has(file.type.toLowerCase())) {
      setFormError('只支持 JPG / PNG / WebP / HEIC 图片');
      event.target.value = '';
      return;
    }

    if (file.size > MAX_PHOTO_BYTES) {
      setFormError('图片不能超过 8MB');
      event.target.value = '';
      return;
    }

    if (photoUrlRef.current) {
      URL.revokeObjectURL(photoUrlRef.current);
    }

    const previewUrl = URL.createObjectURL(file);
    photoUrlRef.current = previewUrl;
    setPhotoFile(file);
    setPhotoPreviewUrl(previewUrl);
    setFormError(null);
  }

  const isDeworm = formType === 'deworm_in' || formType === 'deworm_out';

  const parsedFormWeight = Number(formWeight);
  const weightHint =
    isDeworm &&
    formWeight.trim() !== '' &&
    Number.isFinite(parsedFormWeight) &&
    parsedFormWeight > 0 &&
    latestWeightG !== null &&
    latestWeightG > 0 &&
    Math.abs(parsedFormWeight - latestWeightG) / latestWeightG > 0.15
      ? `与最近体重 ${formatWeightKg(latestWeightG)}kg 相差较大，确认一下是不是填错了`
      : null;

  const grouped = RECORD_GROUP_KEYS.map((key) => ({
    key,
    items: records
      .filter((record) => groupKeyForType(record.type) === key)
      .sort((left, right) => right.eventDate.localeCompare(left.eventDate)),
  }));

  const showMedOption = editing?.type === 'med' || formType === 'med';
  const typeOptions: RecordType[] = [
    ...RECORD_GROUP_KEYS,
    ...(showMedOption ? (['med'] as const) : []),
  ];

  function openAdd(key: RecordGroupKey) {
    setEditing(null);
    setFormType(key);
    setFormDate(today);
    setFormNextDue(defaultNextDue(key, today) ?? '');
    setFormWeight('');
    setNextDueTouched(false);
    setFormError(null);
    clearPhoto();
    setFormKey((value) => value + 1);
    setOpen(true);
  }

  function openEdit(record: RecordListItem) {
    const type = isRecordType(record.type) ? record.type : 'visit';

    setEditing(record);
    setFormType(type);
    setFormDate(record.eventDate);
    setFormNextDue(record.nextDue ?? '');
    setFormWeight(record.weightG === null ? '' : String(record.weightG));
    setNextDueTouched(true);
    setFormError(null);
    clearPhoto();
    setFormKey((value) => value + 1);
    setOpen(true);
  }

  function closeForm() {
    if (pending) {
      return;
    }

    setOpen(false);
    setEditing(null);
    setFormError(null);
    clearPhoto();
  }

  function changeType(type: RecordType) {
    setFormType(type);
    if (!nextDueTouched) {
      setFormNextDue(defaultNextDue(type, formDate) ?? '');
    }
  }

  function changeDate(value: string) {
    setFormDate(value);
    if (!nextDueTouched) {
      setFormNextDue(defaultNextDue(formType, value) ?? '');
    }
  }

  function restoreDefaultNextDue() {
    setNextDueTouched(false);
    setFormNextDue(defaultNextDue(formType, formDate) ?? '');
  }

  async function handleSubmit(formData: FormData) {
    if (pending) {
      return;
    }

    setPending(true);
    setFormError(null);

    try {
      const result = await saveRecord(formData);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      const fileToUpload = photoFile;
      setOpen(false);
      setEditing(null);
      setFormError(null);
      setListError(null);
      clearPhoto();

      // 记录已保存；照片上传失败不回滚，只提示稍后补传。
      if (fileToUpload) {
        try {
          const body = new FormData();
          body.append('file', fileToUpload);
          body.append('kind', 'record');
          body.append('id', result.id);

          const response = await fetch('/api/upload', {
            method: 'POST',
            body,
          });

          if (!response.ok) {
            setListError('记录已保存，但照片上传失败，可稍后编辑记录补传');
          }
        } catch {
          setListError('记录已保存，但照片上传失败，可稍后编辑记录补传');
        }
      }

      router.refresh();
    } catch (error) {
      console.error('[records] 保存失败', error);
      setFormError('保存失败，请检查网络后重试');
    } finally {
      setPending(false);
    }
  }

  async function handleDelete(record: RecordListItem) {
    if (deletingId) {
      return;
    }

    const name = record.name ?? RECORD_TYPE_LABELS[
      isRecordType(record.type) ? record.type : 'visit'
    ];
    const confirmed = window.confirm(
      `确定删除「${name}」吗？删除后无法恢复。`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingId(record.id);
    setListError(null);

    try {
      const result = await deleteRecord(record.id);
      if (!result.ok) {
        setListError(result.error);
        return;
      }

      router.refresh();
    } catch (error) {
      console.error('[records] 删除失败', error);
      setListError('删除失败，请稍后再试');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      {listError ? (
        <p
          role="alert"
          className="mb-3 rounded-xl bg-coral/10 px-3 py-2 text-sm font-medium text-coral"
        >
          {listError}
        </p>
      ) : null}

      {records.length === 0 ? (
        <section className="mb-4 rounded-[20px] bg-white shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06]">
          <CatEmpty
            title="这段时间还没有记录"
            hint={`从疫苗或驱虫开始，给${catName}建一份健康档案。`}
          />
        </section>
      ) : null}

      <div className="space-y-5 md:grid md:grid-cols-2 md:items-start md:gap-5 md:space-y-0">
        {grouped.map(({ key, items }) => {
          const meta = GROUP_META[key];
          const Icon = meta.Icon;

          return (
            <section key={key}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink dark:text-cream">
                    <Icon
                      size={15}
                      className="text-gold-deep dark:text-gold"
                      aria-hidden="true"
                    />
                    {RECORD_GROUP_LABELS[key]}
                    {items.length > 0 ? (
                      <span className="text-[11px] font-normal text-muted">
                        {items.length}
                      </span>
                    ) : null}
                  </h2>
                  <p className="mt-0.5 pl-[21px] text-[10px] text-muted">
                    {meta.hint}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => openAdd(key)}
                  className="inline-flex h-11 min-h-[44px] shrink-0 items-center gap-1 rounded-full bg-gold/15 px-3 text-xs font-semibold text-gold-deep transition-colors hover:bg-gold/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold dark:text-gold"
                >
                  <Plus size={15} aria-hidden="true" />
                  新增
                </button>
              </div>

              {items.length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-ink/10 px-4 py-5 text-center text-xs text-muted dark:border-white/10">
                  还没有记录
                </div>
              ) : (
                <ul className="space-y-2">
                  {items.map((record) => {
                    const type = isRecordType(record.type)
                      ? record.type
                      : 'visit';
                    const name = record.name ?? RECORD_TYPE_LABELS[type];
                    const status = vaccineStatus(record, today);
                    const deleting = deletingId === record.id;

                    return (
                      <li
                        key={record.id}
                        className="rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(23,21,26,0.06)] dark:bg-white/[0.06]"
                      >
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <h3 className="min-w-0 truncate text-sm font-semibold text-ink dark:text-cream">
                                {name}
                              </h3>
                              {record.type === 'med' ? (
                                <span className="rounded-full bg-gold/15 px-1.5 py-0.5 text-[10px] font-semibold text-gold-deep dark:text-gold">
                                  用药
                                </span>
                              ) : null}
                              {status ? (
                                <span
                                  className={`inline-flex items-center gap-1 text-[11px] font-medium ${STATUS_CLASS[status.tone].text}`}
                                >
                                  <span
                                    aria-hidden="true"
                                    className={`h-1.5 w-1.5 rounded-full ${STATUS_CLASS[status.tone].dot}`}
                                  />
                                  {status.label}
                                </span>
                              ) : null}
                            </div>

                            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
                              <span className="inline-flex items-center gap-1">
                                <CalendarDays size={11} aria-hidden="true" />
                                {formatDateCn(record.eventDate)}
                              </span>
                              {record.nextDue ? (
                                <span>
                                  下次 {formatDateCn(record.nextDue)}
                                </span>
                              ) : null}
                              {record.cost !== null ? (
                                <span>¥{formatCost(record.cost)}</span>
                              ) : null}
                              {record.dose ? (
                                <span>{record.dose}</span>
                              ) : null}
                              {record.drugName ? (
                                <span>药 {record.drugName}</span>
                              ) : null}
                              {record.doseMg !== null ? (
                                <span>{formatDoseMg(record.doseMg)} mg</span>
                              ) : null}
                              {record.weightG !== null ? (
                                <span>
                                  给药 {formatWeightKg(record.weightG)} kg
                                </span>
                              ) : null}
                            </p>

                            {record.note ? (
                              <p className="mt-1.5 line-clamp-2 whitespace-pre-wrap text-xs leading-5 text-muted">
                                {record.note}
                              </p>
                            ) : null}

                            <p className="mt-1.5 text-right text-[10px] text-muted">
                              {record.recorderName ?? '家人'} 添加
                            </p>
                          </div>

                          <div className="flex shrink-0 flex-col items-end gap-1">
                            {record.photoPath ? (
                              <PhotoThumb
                                path={record.photoPath}
                                alt={`${name}的照片`}
                                size="sm"
                              />
                            ) : null}

                            <div className="flex items-center">
                              <button
                                type="button"
                                onClick={() => openEdit(record)}
                                aria-label={`编辑${name}`}
                                title="编辑"
                                className="flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-muted transition-colors hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold dark:hover:bg-white/10 dark:hover:text-cream"
                              >
                                <Pencil size={16} aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(record)}
                                disabled={deleting}
                                aria-label={`删除${name}`}
                                title="删除"
                                className="flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-muted transition-colors hover:bg-coral/10 hover:text-coral focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <Trash2 size={16} aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {open ? (
        <div className="fixed inset-0 z-[60]">
          <div
            aria-hidden="true"
            onClick={closeForm}
            className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[92dvh] w-full max-w-[480px] flex-col overflow-hidden rounded-t-[24px] border-t border-ink/10 bg-cream shadow-[0_-12px_40px_rgba(23,21,26,0.18)] dark:border-white/10 dark:bg-night"
          >
            <div className="flex items-start justify-between gap-4 px-5 pb-4 pt-5">
              <div className="min-w-0">
                <h2
                  id={dialogTitleId}
                  className="text-lg font-bold text-ink dark:text-cream"
                >
                  {editing ? '编辑记录' : `新增${RECORD_GROUP_LABELS[groupKeyForType(formType)]}`}
                </h2>
                <p className="mt-1 text-xs text-muted">
                  疫苗和驱虫的下次到期日会自动按间隔计算，可手动修改。
                </p>
              </div>
              <button
                type="button"
                onClick={closeForm}
                disabled={pending}
                aria-label="关闭表单"
                className="flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/10 dark:hover:text-cream"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <form
              key={formKey}
              action={handleSubmit}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-5">
                {editing ? (
                  <input type="hidden" name="id" value={editing.id} />
                ) : null}
                <input type="hidden" name="type" value={formType} />

                <fieldset>
                  <legend className={LABEL_CLASS}>类型</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {typeOptions.map((type) => {
                      const selected = formType === type;

                      return (
                        <button
                          key={type}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => changeType(type)}
                          className={`h-11 min-h-[44px] rounded-xl border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                            selected
                              ? 'border-gold bg-gold text-ink shadow-[0_2px_8px_rgba(245,183,49,0.35)]'
                              : 'border-ink/10 bg-white/60 text-ink hover:border-gold/50 dark:border-white/10 dark:bg-white/[0.04] dark:text-cream'
                          }`}
                        >
                          {RECORD_TYPE_LABELS[type]}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <label className="block">
                  <span className={LABEL_CLASS}>名称</span>
                  <input
                    type="text"
                    name="name"
                    required
                    maxLength={40}
                    defaultValue={editing?.name ?? ''}
                    placeholder="例如：猫三联疫苗"
                    className={INPUT_CLASS}
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className={LABEL_CLASS}>日期</span>
                    <input
                      type="date"
                      name="event_date"
                      required
                      value={formDate}
                      onChange={(event) => changeDate(event.target.value)}
                      className={INPUT_CLASS}
                    />
                  </label>

                  <label className="block">
                    <span className={LABEL_CLASS}>费用（元）</span>
                    <input
                      type="number"
                      name="cost"
                      min={0}
                      max={1_000_000}
                      step="0.01"
                      inputMode="decimal"
                      defaultValue={
                        editing?.cost === null || editing?.cost === undefined
                          ? ''
                          : String(editing.cost)
                      }
                      placeholder="可选"
                      className={INPUT_CLASS}
                    />
                  </label>
                </div>

                <div>
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <label
                      htmlFor={`${dialogTitleId}-next-due`}
                      className="text-sm font-semibold text-ink dark:text-cream"
                    >
                      下次到期
                    </label>
                    {nextDueOffsetLabel(formType) !== '可留空' ? (
                      <button
                        type="button"
                        onClick={restoreDefaultNextDue}
                        className="text-[11px] font-medium text-gold-deep hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold dark:text-gold"
                      >
                        用默认日期
                      </button>
                    ) : null}
                  </div>
                  <input
                    id={`${dialogTitleId}-next-due`}
                    type="date"
                    name="next_due"
                    value={formNextDue}
                    onChange={(event) => {
                      setFormNextDue(event.target.value);
                      setNextDueTouched(true);
                    }}
                    className={INPUT_CLASS}
                  />
                  <p className="mt-1.5 text-[11px] text-muted">
                    {nextDueOffsetLabel(formType)}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className={LABEL_CLASS}>
                      {isDeworm ? '剂量说明' : '剂量'}
                    </span>
                    <input
                      type="text"
                      name="dose"
                      maxLength={40}
                      defaultValue={editing?.dose ?? ''}
                      placeholder={isDeworm ? '例如：半粒 / 0.5ml' : '例如：1 针'}
                      className={INPUT_CLASS}
                    />
                  </label>

                  <label className="block">
                    <span className={LABEL_CLASS}>医院</span>
                    <input
                      type="text"
                      name="vet"
                      maxLength={60}
                      defaultValue={editing?.vet ?? ''}
                      placeholder="例如：安心宠物医院"
                      className={INPUT_CLASS}
                    />
                  </label>
                </div>

                {isDeworm ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className={LABEL_CLASS}>药名</span>
                        <input
                          type="text"
                          name="drug_name"
                          maxLength={60}
                          defaultValue={editing?.drugName ?? ''}
                          placeholder="例如：海乐妙"
                          className={INPUT_CLASS}
                        />
                      </label>

                      <label className="block">
                        <span className={LABEL_CLASS}>剂量（mg）</span>
                        <input
                          type="number"
                          name="dose_mg"
                          min={0}
                          max={100_000}
                          step="0.01"
                          inputMode="decimal"
                          defaultValue={
                            editing?.doseMg === null ||
                            editing?.doseMg === undefined
                              ? ''
                              : String(editing.doseMg)
                          }
                          placeholder="可选"
                          className={INPUT_CLASS}
                        />
                      </label>
                    </div>

                    <label className="block">
                      <span className="mb-2 flex items-baseline justify-between gap-2 text-sm font-semibold text-ink dark:text-cream">
                        <span>当时体重（g）</span>
                        <span className="text-[11px] font-normal text-muted">
                          可选
                        </span>
                      </span>
                      <input
                        type="number"
                        name="weight_g"
                        value={formWeight}
                        onChange={(event) => setFormWeight(event.target.value)}
                        min={500}
                        max={15_000}
                        step={1}
                        inputMode="numeric"
                        placeholder="例如：3250"
                        className={INPUT_CLASS}
                      />
                      {weightHint ? (
                        <p className="mt-1.5 text-[11px] leading-5 text-muted">
                          {weightHint}
                        </p>
                      ) : null}
                    </label>
                  </>
                ) : null}

                <div className="rounded-2xl border border-dashed border-ink/15 bg-white/40 p-3.5 dark:border-white/15 dark:bg-white/[0.03]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink dark:text-cream">
                        照片
                      </p>
                      <p className="mt-0.5 text-[11px] leading-5 text-muted">
                        就诊单据、皮肤或用药包装，点击缩略图可放大
                      </p>
                    </div>
                    <label className="inline-flex h-11 min-h-[44px] shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-gold/15 px-3.5 text-xs font-semibold text-gold-deep transition-colors hover:bg-gold/25 focus-within:ring-2 focus-within:ring-gold dark:text-gold">
                      <ImagePlus size={15} aria-hidden="true" />
                      {photoPreviewUrl
                        ? '换一张'
                        : editing?.photoPath
                          ? '更换照片'
                          : '选择图片'}
                      <input
                        key={photoInputKey}
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoChange}
                        className="sr-only"
                      />
                    </label>
                  </div>

                  {photoPreviewUrl ? (
                    <div className="mt-3 flex items-center gap-3">
                      <img
                        src={photoPreviewUrl}
                        alt="待上传的照片预览"
                        className="h-24 w-24 rounded-[16px] object-cover"
                      />
                      <button
                        type="button"
                        onClick={clearPhoto}
                        className="inline-flex h-11 min-h-[44px] items-center rounded-xl px-3 text-xs font-semibold text-coral transition-colors hover:bg-coral/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                      >
                        移除新照片
                      </button>
                    </div>
                  ) : editing?.photoPath ? (
                    <div className="mt-3 flex items-center gap-3">
                      <PhotoThumb
                        path={editing.photoPath}
                        alt={`${editing.name ?? '这条记录'}的当前照片`}
                      />
                      <span className="text-[11px] leading-5 text-muted">
                        保存时会保留这张照片
                      </span>
                    </div>
                  ) : null}
                </div>

                <label className="block">
                  <span className={LABEL_CLASS}>
                    {formType === 'visit' || formType === 'med'
                      ? '诊断 / 用药 / 注意事项'
                      : '备注'}
                  </span>
                  <textarea
                    name="note"
                    rows={3}
                    maxLength={200}
                    defaultValue={editing?.note ?? ''}
                    placeholder={
                      formType === 'visit' || formType === 'med'
                        ? '例如：首诊体检，医生开了体内驱虫'
                        : '可选，最多 200 字'
                    }
                    className="w-full resize-none rounded-2xl border border-ink/10 bg-white/60 px-4 py-3 text-[15px] leading-6 text-ink outline-none transition placeholder:text-muted/60 focus:border-gold focus:ring-2 focus:ring-gold/30 dark:border-white/10 dark:bg-white/[0.04] dark:text-cream dark:placeholder:text-cream/30"
                  />
                </label>
              </div>

              <div
                className="border-t border-ink/[0.06] bg-cream px-5 pt-3 dark:border-white/10 dark:bg-night"
                style={{
                  paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
                }}
              >
                {formError ? (
                  <p
                    role="alert"
                    className="mb-2 rounded-xl bg-coral/10 px-3 py-2 text-sm font-medium text-coral"
                  >
                    {formError}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={pending}
                  className="flex h-12 min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl bg-gold text-[15px] font-semibold text-ink transition-colors hover:bg-gold-deep active:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pending ? (
                    <>
                      <span
                        aria-hidden="true"
                        className="h-4 w-4 animate-spin rounded-full border-2 border-ink/30 border-t-ink"
                      />
                      保存中…
                    </>
                  ) : (
                    '保存记录'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
