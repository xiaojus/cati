/**
 * 健康记录的纯元数据与日期默认值。
 * 服务端 action、记录页和导出接口共用；这里不能 import 数据库。
 */
import { addDays } from './dates';

export const RECORD_TYPES = [
  'vaccine',
  'deworm_in',
  'deworm_out',
  'visit',
  'med',
] as const;

export type RecordType = (typeof RECORD_TYPES)[number];

/** 记录页的四个分组；用药（med）并入就诊。 */
export const RECORD_GROUP_KEYS = [
  'vaccine',
  'deworm_in',
  'deworm_out',
  'visit',
] as const;

export type RecordGroupKey = (typeof RECORD_GROUP_KEYS)[number];

export const RECORD_TYPE_LABELS: Record<RecordType, string> = {
  vaccine: '疫苗',
  deworm_in: '体内驱虫',
  deworm_out: '体外驱虫',
  visit: '就诊',
  med: '用药',
};

export const RECORD_GROUP_LABELS: Record<RecordGroupKey, string> = {
  vaccine: '疫苗',
  deworm_in: '体内驱虫',
  deworm_out: '体外驱虫',
  visit: '就诊',
};

export function isRecordType(value: string): value is RecordType {
  return (RECORD_TYPES as readonly string[]).includes(value);
}

export function groupKeyForType(type: string): RecordGroupKey {
  if (type === 'vaccine' || type === 'deworm_in' || type === 'deworm_out') {
    return type;
  }

  return 'visit';
}

/**
 * 下次到期日的默认值：
 * - 疫苗：+21 天（猫三联第二针间隔）
 * - 体内驱虫：+90 天
 * - 体外驱虫：+30 天
 * - 就诊 / 用药：不默认
 */
export function defaultNextDue(
  type: RecordType,
  eventDate: string,
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    return null;
  }

  switch (type) {
    case 'vaccine':
      return addDays(eventDate, 21);
    case 'deworm_in':
      return addDays(eventDate, 90);
    case 'deworm_out':
      return addDays(eventDate, 30);
    default:
      return null;
  }
}

/** 表单里「下次到期」的默认值说明。 */
export function nextDueOffsetLabel(type: RecordType): string | null {
  switch (type) {
    case 'vaccine':
      return '默认 21 天后（猫三联第二针间隔），可修改';
    case 'deworm_in':
      return '默认 90 天后，可修改';
    case 'deworm_out':
      return '默认 30 天后，可修改';
    default:
      return '可留空';
  }
}
