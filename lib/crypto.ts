/**
 * 仅服务端使用。
 *
 * 用户的大模型 API Key 以 AES-256-GCM 加密后存入 ai_configs.key_cipher，
 * 格式固定为 `iv:tag:data`，三段都是 base64。
 *
 * 主密钥来自 CAT_SECRET_KEY（64 位 hex 或 32 字节 base64）。
 * 未配置时不在模块加载阶段报错，只有真正加解密时才抛中文错误。
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

const MISSING_KEY_MESSAGE = '没有配置 CAT_SECRET_KEY，无法保存密钥';

function readMasterKey(): Buffer {
  const raw = process.env.CAT_SECRET_KEY?.trim();

  if (!raw) {
    throw new Error(MISSING_KEY_MESSAGE);
  }

  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, 'hex');
  } else {
    key = Buffer.from(raw, 'base64');
  }

  if (key.length !== KEY_BYTES) {
    throw new Error(MISSING_KEY_MESSAGE);
  }

  return key;
}

/** 加密任意字符串；每次调用都生成新的 12 字节随机 IV。 */
export function encryptSecret(plain: string): string {
  const key = readMasterKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    iv.toString('base64'),
    tag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

/** 解密 `encryptSecret` 的输出；密文被篡改或主密钥不对时抛错。 */
export function decryptSecret(cipherText: string): string {
  const key = readMasterKey();
  const parts = cipherText.split(':');

  if (parts.length !== 3) {
    throw new Error('密钥数据损坏，请重新配置');
  }

  const [ivPart, tagPart, dataPart] = parts;
  const iv = Buffer.from(ivPart, 'base64');
  const tag = Buffer.from(tagPart, 'base64');
  const data = Buffer.from(dataPart, 'base64');

  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error('密钥数据损坏，请重新配置');
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([
      decipher.update(data),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // 不把底层错误（可能包含密文片段）带到界面上。
    throw new Error('密钥无法解密，请重新配置');
  }
}
