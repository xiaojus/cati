/**
 * 纯日期工具：服务端与客户端都可以引用。
 * 这里不能 import lib/db，也不能包含任何写库逻辑。
 */

export const SHANGHAI_TIME_ZONE = 'Asia/Shanghai';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function dateParts(date: string): [number, number, number] {
  const [year, month, day] = date.split('-').map(Number);
  return [year, month, day];
}

/** 把 YYYY-MM-DD 当作 UTC 日历日，避免本地时区把日期推前/推后。 */
function utcMs(date: string): number {
  const [year, month, day] = dateParts(date);
  return Date.UTC(year, month - 1, day);
}

/** 校验字符串既是 YYYY-MM-DD 格式，又是真实存在的日历日。 */
export function isValidDateString(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = dateParts(value);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/** 上海本地日历日，格式固定为 YYYY-MM-DD。 */
export function todayInShanghai(now: Date = new Date()): string {
  return now.toLocaleDateString('sv-SE', { timeZone: SHANGHAI_TIME_ZONE });
}

/** 在日历日上加减天数，结果仍是 YYYY-MM-DD。 */
export function addDays(date: string, amount: number): string {
  const next = new Date(utcMs(date) + amount * MS_PER_DAY);
  return next.toISOString().slice(0, 10);
}

/** to - from 的日历天数差；to 在 from 之前时为负数。 */
export function daysBetween(from: string, to: string): number {
  return Math.round((utcMs(to) - utcMs(from)) / MS_PER_DAY);
}

/** 以 endDate 结尾、连续 count 天的日期数组（升序）。 */
export function lastNDates(endDate: string, count: number): string[] {
  if (count <= 0) {
    return [];
  }

  return Array.from({ length: count }, (_, index) =>
    addDays(endDate, index - count + 1),
  );
}

/** 包含起始日在内是第几天：起始日当天为第 1 天。 */
export function inclusiveDayNumber(startDate: string, today: string): number {
  return daysBetween(startDate, today) + 1;
}

/** 「11月12日」这种中文短日期。 */
export function formatDateCn(date: string): string {
  if (!isValidDateString(date)) {
    return date;
  }

  const [year, month, day] = dateParts(date);
  // 取上海中午，避免任何时区转换把日期推过零点。
  const value = new Date(Date.UTC(year, month - 1, day, 4));

  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: SHANGHAI_TIME_ZONE,
    month: 'long',
    day: 'numeric',
  }).format(value);
}

/** 「周四」这种中文星期。 */
export function formatWeekdayCn(date: string): string {
  if (!isValidDateString(date)) {
    return '';
  }

  const [year, month, day] = dateParts(date);
  const value = new Date(Date.UTC(year, month - 1, day, 4));

  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: SHANGHAI_TIME_ZONE,
    weekday: 'short',
  }).format(value);
}

/** 把 ISO 时间戳显示成上海时区的 HH:mm。 */
export function formatTimeCn(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: SHANGHAI_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(value);
}

function monthsBetween(from: string, to: string): number {
  const [fromYear, fromMonth, fromDay] = dateParts(from);
  const [toYear, toMonth, toDay] = dateParts(to);

  let months = (toYear - fromYear) * 12 + (toMonth - fromMonth);
  if (toDay < fromDay) {
    months -= 1;
  }

  return months;
}

/** 由出生日期估算年龄，例如「约 3 岁 7 个月」。 */
export function formatAgeLabel(
  birthDate: string | null,
  today: string,
): string | null {
  if (
    !birthDate ||
    !isValidDateString(birthDate) ||
    !isValidDateString(today)
  ) {
    return null;
  }

  const months = monthsBetween(birthDate, today);
  if (months < 0) {
    return null;
  }

  if (months < 12) {
    return `约 ${months} 个月`;
  }

  const years = Math.floor(months / 12);
  const remainder = months % 12;

  return remainder === 0
    ? `约 ${years} 岁`
    : `约 ${years} 岁 ${remainder} 个月`;
}
