/**
 * 大模型服务商目录（纯元数据，客户端可安全 import）。
 *
 * 只负责「选服务商 → 自动填 baseUrl / 候选模型」；
 * 密钥的加解密与请求逻辑都在服务端模块里。
 */

export type ProviderId =
  | 'deepseek'
  | 'zhipu'
  | 'qwen'
  | 'moonshot'
  | 'openai'
  | 'custom';

export type ProviderMeta = {
  id: ProviderId;
  label: string;
  baseUrl: string;
  models: readonly string[];
};

export const PROVIDERS: readonly ProviderMeta[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek（深度求索）',
    baseUrl: 'https://api.deepseek.com',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'zhipu',
    label: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4.6', 'glm-4-flash', 'glm-4-air'],
  },
  {
    id: 'qwen',
    label: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-plus', 'qwen-turbo', 'qwen-max'],
  },
  {
    id: 'moonshot',
    label: 'Moonshot / Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['moonshot-v1-8k', 'kimi-k2-0905-preview'],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4.1-mini'],
  },
  {
    id: 'custom',
    label: '自定义（OpenAI 兼容）',
    baseUrl: '',
    models: [],
  },
];

export function getProvider(id: string): ProviderMeta | undefined {
  return PROVIDERS.find((provider) => provider.id === id);
}
