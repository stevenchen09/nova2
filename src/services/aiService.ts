import {
  FrameItem,
  SizeType,
  CostRecord,
  AIProvider,
  AISettings,
  AIProviderConfig,
} from '../types';

export interface FilePayload {
  mimeType: string;
  data: string; // base64
}

// ─────────────────────────────────────────────────────────────────────
// Provider Metadata & Constants
// ─────────────────────────────────────────────────────────────────────

/** Human-readable label for each AI provider */
export const PROVIDER_LABELS: Record<AIProvider, string> = {
  deepseek: 'DeepSeek',
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  qwen: '通义千问',
  ernie: '文心一言',
  zhipu: '智谱 GLM',
  moonshot: '月之暗面 Kimi',
  baichuan: '百川智能',
  doubao: '豆包 (字节)',
  yi: '零一万物',
};

/** API Key registration URL for each provider */
export const PROVIDER_KEY_URLS: Record<AIProvider, string> = {
  deepseek: 'https://platform.deepseek.com',
  gemini: 'https://aistudio.google.com/apikey',
  openai: 'https://platform.openai.com/api-keys',
  qwen: 'https://dashscope.console.aliyun.com/apiKey',
  ernie: 'https://console.bce.baidu.com/qianfan/ais/console/applicationConsole/application',
  zhipu: 'https://open.bigmodel.cn/usercenter/apikeys',
  moonshot: 'https://platform.moonshot.cn/console/api-keys',
  baichuan: 'https://platform.baichuan-ai.com/home/developer/access',
  doubao: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
  yi: 'https://platform.lingyiwanwu.com/apiKeys',
};

/** Available models per provider (for Settings dropdown) */
export const PROVIDER_MODELS: Record<AIProvider, readonly string[]> = {
  deepseek: ['deepseek-chat', 'deepseek-reasoner'] as const,
  gemini: ['gemini-2.0-flash', 'gemini-2.5-pro', 'gemini-1.5-flash'] as const,
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo'] as const,
  qwen: ['qwen-turbo', 'qwen-plus', 'qwen-max'] as const,
  ernie: ['ernie-4.0-8k', 'ernie-4.0-turbo', 'ernie-speed'] as const,
  zhipu: ['glm-4-plus', 'glm-4-air', 'glm-4-flash'] as const,
  moonshot: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'] as const,
  baichuan: ['Baichuan4', 'Baichuan3-Turbo'] as const,
  doubao: ['doubao-pro-32k', 'doubao-lite-32k'] as const,
  yi: ['yi-large', 'yi-medium', 'yi-spark'] as const,
};

/** Default base URLs per provider */
const DEFAULT_BASE_URLS: Record<AIProvider, string> = {
  deepseek: 'https://api.deepseek.com/v1',
  gemini: '', // Gemini uses Google SDK endpoint, no base URL needed
  openai: 'https://api.openai.com/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  ernie: 'https://qianfan.baidubce.com/v2',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  moonshot: 'https://api.moonshot.cn/v1',
  baichuan: 'https://api.baichuan-ai.com/v1',
  doubao: 'https://ark.cn-beijing.volces.com/api/v3',
  yi: 'https://api.lingyiwanwu.com/v1',
};

/** Default model names per provider */
const DEFAULT_MODELS: Record<AIProvider, string> = {
  deepseek: 'deepseek-chat',
  gemini: 'gemini-2.0-flash',
  openai: 'gpt-4o-mini',
  qwen: 'qwen-plus',
  ernie: 'ernie-4.0-8k',
  zhipu: 'glm-4-plus',
  moonshot: 'moonshot-v1-8k',
  baichuan: 'Baichuan4',
  doubao: 'doubao-pro-32k',
  yi: 'yi-large',
};

// ─────────────────────────────────────────────────────────────────────
// System Prompts (unchanged)
// ─────────────────────────────────────────────────────────────────────

/** 订单提取系统提示词 */
const ORDER_SYSTEM_PROMPT = `你是一个专业的铝合金加工订单提取助手。
请从用户提供的文本中，精准提取铝合金框料规格。
需要提取的字段：
- model: 型号（如 "D1822"，如果未指定，设为 "未指定型号"）
- color: 颜色（如 "拉丝哑黑"，如果未指定，设为 "未指定颜色"）
- sizeType: 尺寸类型，值只能是 "外径" 或 "内径" (默认为 "外径")
- width: 宽度，单位CM（数值，不带单位）
- height: 高度，单位CM（数值，不带单位）
- quantity: 数量，单位个（数值，不带单位，默认为 1）

【重要规则】同一型号的不同颜色（如银色/金色/黑色/白色）属于相同材料，单价一致。你只需要：
1. 正确识别 model（型号名称）
2. 正确识别 color（颜色名称）
3. 不要因为颜色不同就编造不同的型号名称

示例：
- "30x40 银色画框2个 + 金色画框1个" → 两条记录，相同的 model，不同的 color
- "D1822黑色3个 + D1822白色2个" → 两条记录，model都是 "D1822"

返回格式：
请严格返回 JSON 对象，格式如下：
{
  "results": [
    {
      "model": "D1822",
      "color": "黑色",
      "sizeType": "外径",
      "width": 80.0,
      "height": 60.0,
      "quantity": 10
    }
  ]
}`;

/** 成本提取系统提示词 */
const COST_SYSTEM_PROMPT = `你是一个专业的铝合金材料成本明细提取助手。
请从用户提供的报价单、账单或文本中提取每种铝合金型号和颜色的成本信息。
需要提取的字段：
- model: 型号（如 "D1822"）
- color: 颜色（如 "黑色"）
- materialCost: 材料成本单价，单位元/米（数值，必须大于0）
- accessoryCost: 配件成本单价，单位元/套（数值，如果未指定，设为 12）
- cuttingCost: 切割成本单价，单位元/个（数值，如果未指定，设为 10）
- weightPerMeter: 型材每米重量，单位 kg/m（数值，通常范围 0.5~2.0，如果未指定，设为 0.85）
- notes: 备注信息（如有，可选）

返回格式：
请严格返回 JSON 对象，格式如下：
{
  "results": [
    {
      "model": "D1822",
      "color": "黑色",
      "materialCost": 25.0,
      "accessoryCost": 12,
      "cuttingCost": 8.0,
      "weightPerMeter": 0.85,
      "notes": "主力料"
    }
  ]
}`;

// ─────────────────────────────────────────────────────────────────────
// Header & Auth Helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Build HTTP request headers for a given AI provider.
 *
 * Most Chinese LLM providers follow the OpenAI-compatible format (Bearer token).
 * Gemini uses Google's x-goog-api-key header.
 *
 * @param provider - The AI provider identifier
 * @param apiKey   - The user's API key for this provider
 * @returns A record of header key-value pairs
 */
export function getAIHeaders(
  provider: AIProvider,
  apiKey: string,
): Record<string, string> {
  const base: Record<string, string> = { 'Content-Type': 'application/json' };

  switch (provider) {
    // OpenAI-compatible: Bearer token authorization
    case 'deepseek':
    case 'openai':
    case 'qwen':       // 通义千问 DashScope 兼容 OpenAI 格式
    case 'zhipu':      // 智谱 GLM 兼容
    case 'moonshot':   // 月之暗面 兼容
    case 'baichuan':   // 百川 兼容
    case 'doubao':     // 豆包 Volcengine 兼容
    case 'yi':         // 零一万物 兼容
      return { ...base, Authorization: `Bearer ${apiKey}` };

    case 'ernie':
      // 文心一言：用户填 Access Token 直接用 Bearer 方式传递
      // 后续可优化为从百度 IAM 获取 access_token 的完整流程
      return { ...base, Authorization: `Bearer ${apiKey}` };

    case 'gemini':
      // Gemini 使用 Google API key，通过 x-goog-api-key header 传递
      return { ...base, 'x-goog-api-key': apiKey };

    default:
      return { ...base, Authorization: `Bearer ${apiKey}` };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Core AI Call Engine
// ─────────────────────────────────────────────────────────────────────

/**
 * Resolve effective values for baseUrl and model, falling back to defaults.
 */
function resolveEndpoint(
  provider: AIProvider,
  configBaseUrl?: string,
  configModel?: string,
): { url: string; model: string } {
  const baseUrl = (configBaseUrl || DEFAULT_BASE_URLS[provider]).replace(/\/+$/, '');
  const model = configModel || DEFAULT_MODELS[provider];
  return { url: baseUrl, model };
}

/**
 * Unified AI API call engine supporting all 10 providers.
 *
 * Routing logic:
 * - **Gemini**: Uses Google Generative Language REST API (x-goog-api-key auth)
 * - **All others**: OpenAI-compatible /chat/completions endpoint (Bearer auth)
 *
 * @param prompt        - User prompt text
 * @param systemPrompt  - System instruction text
 * @param config        - Single provider configuration (provider, apiKey, baseUrl, model)
 * @param filePayload   - Optional image/file data for multimodal input
 * @returns Parsed JSON response from the AI model
 */
export async function callAIGeneric(
  prompt: string,
  systemPrompt: string,
  config: Pick<AIProviderConfig, 'provider' | 'apiKey' | 'baseUrl' | 'model'>,
  filePayload?: FilePayload,
): Promise<any> {
  const { provider, apiKey } = config;

  if (!apiKey?.trim()) {
    throw new Error(`[${provider}] 未配置 API Key，请在设置中填写`);
  }

  // ── Gemini 特殊路径：Google Generative Language REST API ──
  if (provider === 'gemini') {
    return callGemini(prompt, systemPrompt, config, filePayload);
  }

  // ── 所有 OpenAI 兼容格式的供应商 ──
  const { url, model } = resolveEndpoint(provider, config.baseUrl, config.model);
  const apiPath = url.endsWith('/chat/completions') ? url : `${url}/chat/completions`;

  const messages: any[] = [
    { role: 'system', content: systemPrompt },
  ];

  if (filePayload) {
    // 多模态输入：图片+文字
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: prompt || '请分析这张图中的数据并提取明细。' },
        {
          type: 'image_url',
          image_url: {
            url: `data:${filePayload.mimeType};base64,${filePayload.data}`,
          },
        },
      ],
    });
  } else {
    messages.push({ role: 'user', content: prompt });
  }

  const bodyData: Record<string, unknown> = {
    model,
    messages,
    temperature: 0.3,
    max_tokens: 4096,
    response_format: { type: 'json_object' },
  };

  const response = await fetch(apiPath, {
    method: 'POST',
    headers: getAIHeaders(provider, apiKey),
    body: JSON.stringify(bodyData),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `${provider.toUpperCase()} API 错误 (${response.status}): ${errorText}`,
    );
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  if (!content.trim()) {
    throw new Error(`${provider.toUpperCase()} 返回空内容`);
  }

  return JSON.parse(cleanJsonResponseText(content));
}

/**
 * Gemini-specific call path using Google Generative Language REST API.
 *
 * Note: Does NOT use the @google/generative-ai SDK — pure fetch implementation
 * to avoid adding heavy dependencies and keep the bundle small.
 */
async function callGemini(
  prompt: string,
  systemPrompt: string,
  config: Pick<AIProviderConfig, 'apiKey' | 'model'>,
  filePayload?: FilePayload,
): Promise<any> {
  const { apiKey, model: configModel } = config;
  const geminiModel = configModel || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;

  const parts: any[] = [{ text: `${systemPrompt}\n\n用户输入内容:\n${prompt}` }];

  if (filePayload) {
    parts.push({
      inlineData: {
        mimeType: filePayload.mimeType,
        data: filePayload.data,
      },
    });
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: getAIHeaders('gemini', apiKey),
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API 错误 (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const textResult =
    data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

  return JSON.parse(cleanJsonResponseText(textResult));
}

// ─────────────────────────────────────────────────────────────────────
// Convenience Methods using full AISettings
// ─────────────────────────────────────────────────────────────────────

/**
 * Extract the active provider config from AISettings.
 *
 * Selection priority:
 * 1. Provider matching activeProvider AND has an apiKey
 * 2. Any enabled provider with an apiKey
 * 3. The first provider in the list (fallback)
 *
 * @param settings - Full multi-provider AI settings
 * @returns The resolved provider config, or null if nothing usable found
 */
export function resolveActiveProviderConfig(
  settings: AISettings,
): Pick<AIProviderConfig, 'provider' | 'apiKey' | 'baseUrl' | 'model'> | null {
  const { providers, activeProvider } = settings;

  // Priority 1: Active provider (if configured)
  const active = providers.find(
    (p) => p.provider === activeProvider && p.apiKey?.trim(),
  );
  if (active) {
    return { provider: active.provider, apiKey: active.apiKey, baseUrl: active.baseUrl, model: active.model };
  }

  // Priority 2: Any enabled provider with a key
  const anyEnabled = providers.find((p) => p.enabled && p.apiKey?.trim());
  if (anyEnabled) {
    return { provider: anyEnabled.provider, apiKey: anyEnabled.apiKey, baseUrl: anyEnabled.baseUrl, model: anyEnabled.model };
  }

  // Priority 3: First provider (may not have key — caller should check)
  if (providers.length > 0) {
    const first = providers[0];
    return { provider: first.provider, apiKey: first.apiKey, baseUrl: first.baseUrl, model: first.model };
  }

  return null;
}

/**
 * Convenience wrapper: call AI using full AISettings object.
 *
 * Automatically resolves the active provider from the settings,
 * then delegates to callAIGeneric().
 *
 * @param prompt       - User prompt text
 * @param systemPrompt - System instruction text
 * @param settings     - Full multi-provider AI settings
 * @param filePayload  - Optional multimodal file data
 * @returns Parsed JSON response
 */
export async function callAIWithSettings(
  prompt: string,
  systemPrompt: string,
  settings: AISettings,
  filePayload?: FilePayload,
): Promise<any> {
  const config = resolveActiveProviderConfig(settings);

  if (!config?.apiKey?.trim()) {
    throw new Error('请先在设置中配置 AI API Key');
  }

  return callAIGeneric(prompt, systemPrompt, config, filePayload);
}

// ─────────────────────────────────────────────────────────────────────
// Public Business Functions (order parsing & cost parsing)
// ─────────────────────────────────────────────────────────────────────

/**
 * 智能解析订单文本
 *
 * V3 变更：参数类型从旧版 AiSettings 升级为 AISettings（多供应商架构）
 */
export async function parseOrderWithAi(
  text: string,
  settings: AISettings,
  filePayload?: FilePayload,
): Promise<FrameItem[]> {
  try {
    const rawResult = await callAIWithSettings(text, ORDER_SYSTEM_PROMPT, settings, filePayload);
    const results = rawResult.results || [];

    return results.map((r: any, idx: number) => ({
      id: `ai-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
      model: r.model || '未指定型号',
      color: r.color || '未指定颜色',
      sizeType: r.sizeType === '内径' ? SizeType.ID : SizeType.OD,
      width: Number(r.width) || 0,
      height: Number(r.height) || 0,
      quantity: Number(r.quantity) || 1,
    }));
  } catch (error) {
    console.error('AI Order Parsing Error:', error);
    throw error;
  }
}

/**
 * 智能解析成本表格
 *
 * V3 变更：参数类型从旧版 AiSettings 升级为 AISettings（多供应商架构）
 */
export async function parseCostWithAi(
  text: string,
  settings: AISettings,
  filePayload?: FilePayload,
): Promise<Array<Partial<CostRecord>>> {
  try {
    const rawResult = await callAIWithSettings(text, COST_SYSTEM_PROMPT, settings, filePayload);
    const results = rawResult.results || [];

    return results.map((r: any, idx: number) => ({
      id: `ai-cost-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
      model: r.model || '未指定型号',
      color: r.color || '未指定颜色',
      materialCost: Number(r.materialCost) || 0,
      accessoryCost: Number(r.accessoryCost) || 0,
      cuttingCost: Number(r.cuttingCost) || 0,
      weightPerMeter: Number(r.weightPerMeter) || 0.85,
      notes: r.notes || '',
      updatedAt: new Date().toISOString(),
    }));
  } catch (error) {
    console.error('AI Cost Parsing Error:', error);
    throw error;
  }
}

/**
 * Test connection to a specific AI provider by sending a minimal prompt.
 *
 * This is a lightweight version used by the Settings panel "Test Connection"
 * button. It tests a single specific provider config rather than resolving
 * from the full AISettings object.
 *
 * @param config - Single provider config to test
 * @returns Success/failure result with message
 */
export async function testProviderConnection(
  config: Pick<AIProviderConfig, 'provider' | 'apiKey' | 'baseUrl' | 'model'>,
): Promise<{ success: boolean; msg: string }> {
  const { provider, apiKey } = config;

  if (!apiKey?.trim()) {
    return { success: false, msg: '请先输入 API Key 再测试连接。' };
  }

  try {
    // For Gemini, use its native format; otherwise use OpenAI-compatible
    if (provider === 'gemini') {
      const model = config.model || 'gemini-2.0-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: getAIHeaders('gemini', apiKey),
        body: JSON.stringify({
          contents: [{ parts: [{ text: '请回复：OK' }] }],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, msg: `连接失败 (${response.status}): ${errorText.substring(0, 100)}` };
      }
      return { success: true, msg: `[Gemini] 连接成功！模型响应正常` };
    }

    // All other providers: OpenAI-compatible chat/completions
    const { url } = resolveEndpoint(provider, config.baseUrl, config.model);
    const apiPath = url.endsWith('/chat/completions') ? url : `${url}/chat/completions`;
    const model = config.model || DEFAULT_MODELS[provider];

    const response = await fetch(apiPath, {
      method: 'POST',
      headers: getAIHeaders(provider, apiKey),
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: '请回复：OK' }],
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, msg: `连接失败 (${response.status}): ${errorText.substring(0, 100)}` };
    }

    return { success: true, msg: `[${PROVIDER_LABELS[provider]}] 连接成功！模型响应正常` };
  } catch (err: any) {
    return { success: false, msg: `连接异常: ${err.message || err}` };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Internal Utilities
// ─────────────────────────────────────────────────────────────────────

/**
 * Clean AI response text by removing Markdown code-fence markers.
 */
function cleanJsonResponseText(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  return cleaned.trim();
}
