/** 医院联系方式：客户端与服务端共用的纯类型与规范化函数。 */

export type HospitalInfo = {
  name: string;
  phone: string;
  address: string;
};

export const EMPTY_HOSPITAL: HospitalInfo = {
  name: '',
  phone: '',
  address: '',
};

function readText(
  source: Record<string, unknown>,
  key: keyof HospitalInfo,
): string {
  const value = source[key];
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeHospitalInfo(value: unknown): HospitalInfo {
  if (typeof value !== 'object' || value === null) {
    return { ...EMPTY_HOSPITAL };
  }

  const source = value as Record<string, unknown>;

  return {
    name: readText(source, 'name'),
    phone: readText(source, 'phone'),
    address: readText(source, 'address'),
  };
}
