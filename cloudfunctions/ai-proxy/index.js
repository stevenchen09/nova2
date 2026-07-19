/**
 * ai-proxy 云函数 — AI 代理调用
 *
 * 核心：从 ai_settings 集合读取已启用的供应商配置（含 apiKey, baseUrl, model），
 *      按 activeProvider 选择激活供应商，调外部 AI API，返回解析结果。
 *      apiKey 绝不出现在返回结果中。
 *
 * 实现 action：
 *   - parseOrder:    用 ORDER_SYSTEM_PROMPT 解析订单文本
 *   - parseCost:     用 COST_SYSTEM_PROMPT 解析成本文件
 *   - testConnection: 发简单请求验证 Key
 *
 * 权限：所有登录用户均可调用（admin/sales/factory）
 */

const { db } = require('./common/db');
const { verifyUser, sendResponse } = require('./common/auth');

/**
 * 跨版本 fetch 兼容：
 * - Node 18+ 自带 fetch
 * - Node 16 需要导入 node-fetch@2
 */
let _fetch;
function getFetch() {
  if (_fetch) return _fetch;
  if (typeof fetch !== 'undefined') {
    _fetch = fetch.bind(globalThis);
  } else {
    _fetch = require('node-fetch');
  }
  return _fetch;
}

// ─────────────────────────────────────────────────────────────────────
// Provider Metadata（迁移自 V3 aiService.ts）
// ─────────────────────────────────────────────────────────────────────

const PROVIDER_LABELS = {
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

const DEFAULT_BASE_URLS = {
  deepseek: 'https://api.deepseek.com/v1',
  gemini: '',
  openai: 'https://api.openai.com/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  ernie: 'https://qianfan.baidubce.com/v2',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  moonshot: 'https://api.moonshot.cn/v1',
  baichuan: 'https://api.baichuan-ai.com/v1',
  doubao: 'https://ark.cn-beijing.volces.com/api/v3',
  yi: 'https://api.lingyiwanwu.com/v1',
};

const DEFAULT_MODELS = {
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
// System Prompts（迁移自 V3 aiService.ts）
// ─────────────────────────────────────────────────────────────────────

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

const COST_SYSTEM_PROMPT = `你是一个专业的铝合金材料成本明细提取助手。
请从用户提供的报价单、账单、Excel表格、PDF、图片文字或任意文本中，智能提取每种铝合金型号和颜色的成本信息。

【重要】请进行模糊智能匹配，不要要求固定格式：
- 型号可能写作"型号"、"料号"、"品名"、"产品编号"等，都能识别
- 颜色可能写作"颜色"、"色号"、"表面处理"等
- 单价可能写作"底价"、"成本价"、"进价"、"单价"、"价格"等
- 重量可能写作"线密度"、"比重"、"每米重量"、"kg/m"等
- 数值可能带"元"、"¥"、"￥"等符号，请去掉符号只保留数字
- 如果表格列名不标准，根据上下文智能推断哪列是型号、哪列是颜色、哪列是价格

需要提取的字段：
- model: 型号（如 "D1822"，必填）
- color: 颜色（如 "黑色"，必填。如果只有型号没颜色，填"默认"）
- materialCost: 材料成本单价，单位元/米（数值，必须大于0）
- weightPerMeter: 型材每米重量，单位 kg/m（数值，通常范围 0.3~3.0，如果未指定，设为 0.85）
- notes: 备注信息（如有，可选）

不需要提取 accessoryCost 和 cuttingCost（已改为全局费率管理）。

返回格式：
请严格返回 JSON 对象，格式如下：
{
  "results": [
    {
      "model": "D1822",
      "color": "黑色",
      "materialCost": 25.0,
      "weightPerMeter": 0.85,
      "notes": "主力料"
    }
  ]
}

如果输入内容与铝合金材料完全无关，返回 {"results": []}。`;

// ─────────────────────────────────────────────────────────────────────
// Core AI Call Engine（迁移自 V3 aiService.ts）
// ─────────────────────────────────────────────────────────────────────

/**
 * 构建请求头（按供应商区分鉴权方式）
 */
function getAIHeaders(provider, apiKey) {
  const base = { 'Content-Type': 'application/json' };
  switch (provider) {
    case 'gemini':
      return { ...base, 'x-goog-api-key': apiKey };
    case 'deepseek':
    case 'openai':
    case 'qwen':
    case 'zhipu':
    case 'moonshot':
    case 'baichuan':
    case 'doubao':
    case 'yi':
    case 'ernie':
    default:
      return { ...base, Authorization: `Bearer ${apiKey}` };
  }
}

/**
 * 解析 baseUrl + model（带默认值兜底）
 */
function resolveEndpoint(provider, configBaseUrl, configModel) {
  const baseUrl = (configBaseUrl || DEFAULT_BASE_URLS[provider] || '').replace(/\/+$/, '');
  const model = configModel || DEFAULT_MODELS[provider];
  return { url: baseUrl, model };
}

/**
 * 清理 AI 返回文本中的 Markdown 代码块标记
 */
function cleanJsonResponseText(text) {
  let cleaned = (text || '').trim();
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

/**
 * Gemini 专用调用路径
 */
async function callGemini(prompt, systemPrompt, config, filePayload) {
  const { apiKey, model: configModel } = config;
  const geminiModel = configModel || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;

  const parts = [{ text: `${systemPrompt}\n\n用户输入内容:\n${prompt}` }];
  if (filePayload) {
    parts.push({
      inlineData: { mimeType: filePayload.mimeType, data: filePayload.data },
    });
  }

  const response = await getFetch()(url, {
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
  const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  return JSON.parse(cleanJsonResponseText(textResult));
}

/**
 * 统一 AI 调用引擎
 *
 * - Gemini: Google Generative Language REST API
 * - 其他:   OpenAI 兼容 /chat/completions
 */
async function callAIGeneric(prompt, systemPrompt, config, filePayload) {
  const { provider, apiKey } = config;
  if (!apiKey || !apiKey.trim()) {
    throw new Error(`[${provider}] 未配置 API Key，请联系管理员在系统设置中配置`);
  }

  if (provider === 'gemini') {
    return callGemini(prompt, systemPrompt, config, filePayload);
  }

  const { url, model } = resolveEndpoint(provider, config.baseUrl, config.model);
  const apiPath = url.endsWith('/chat/completions')
    ? url
    : `${url}/chat/completions`;

  const messages = [{ role: 'system', content: systemPrompt }];
  if (filePayload) {
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

  const bodyData = {
    model,
    messages,
    temperature: 0.3,
    max_tokens: 16384,
    response_format: { type: 'json_object' },
  };

  const response = await getFetch()(apiPath, {
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
 * 测试连接：发送最小 prompt 验证 Key 可用
 */
async function testProviderConnection(config) {
  const { provider, apiKey } = config;
  if (!apiKey || !apiKey.trim()) {
    return { success: false, msg: '未配置 API Key' };
  }

  try {
    if (provider === 'gemini') {
      const model = config.model || 'gemini-2.0-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await getFetch()(url, {
        method: 'POST',
        headers: getAIHeaders('gemini', apiKey),
        body: JSON.stringify({
          contents: [{ parts: [{ text: '请回复：OK' }] }],
        }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          msg: `连接失败 (${response.status}): ${errorText.substring(0, 100)}`,
        };
      }
      return { success: true, msg: '[Gemini] 连接成功！模型响应正常' };
    }

    const { url } = resolveEndpoint(provider, config.baseUrl, config.model);
    const apiPath = url.endsWith('/chat/completions')
      ? url
      : `${url}/chat/completions`;
    const model = config.model || DEFAULT_MODELS[provider];

    const response = await getFetch()(apiPath, {
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
      return {
        success: false,
        msg: `连接失败 (${response.status}): ${errorText.substring(0, 100)}`,
      };
    }
    return {
      success: true,
      msg: `[${PROVIDER_LABELS[provider] || provider}] 连接成功！模型响应正常`,
    };
  } catch (err) {
    return { success: false, msg: `连接异常: ${err.message || err}` };
  }
}

// ─────────────────────────────────────────────────────────────────────
// AI 配置读取（从 ai_settings 集合）
// ─────────────────────────────────────────────────────────────────────

/**
 * 从 ai_settings 集合读取已激活的供应商配置
 *
 * 选择优先级：
 *   1. activeProvider 指定且配置了 apiKey
 *   2. 任意 enabled 且有 apiKey 的供应商
 *   3. 第一个配置
 *
 * @returns {provider, apiKey, baseUrl, model} 或 null
 */
async function resolveActiveProviderConfig() {
  const doc = await db.collection('ai_settings').doc('global').get();
  const settings = doc.data && doc.data[0];
  if (!settings || !Array.isArray(settings.providers) || settings.providers.length === 0) {
    return null;
  }

  const { providers, activeProvider } = settings;

  // 优先级 1: activeProvider 且有 key
  const active = providers.find(
    (p) => p.provider === activeProvider && p.apiKey && p.apiKey.trim(),
  );
  if (active) {
    return pickConfig(active);
  }

  // 优先级 2: enabled 且有 key
  const anyEnabled = providers.find((p) => p.enabled && p.apiKey && p.apiKey.trim());
  if (anyEnabled) {
    return pickConfig(anyEnabled);
  }

  // 优先级 3: 第一个
  return pickConfig(providers[0]);
}

function pickConfig(p) {
  return {
    provider: p.provider,
    apiKey: p.apiKey,
    baseUrl: p.baseUrl,
    model: p.model,
  };
}

// ─────────────────────────────────────────────────────────────────────
// 云函数入口
// ─────────────────────────────────────────────────────────────────────

exports.main = async (event, context) => {
  // 所有登录用户均可调用
  const authResult = await verifyUser(event, context, db);
  if (authResult.code !== 0) return authResult;

  const { action, text, filePayload } = event || {};

  try {
    switch (action) {
      // ── parseOrder: 解析订单文本 ─────────────────────────────────
      case 'parseOrder': {
        const config = await resolveActiveProviderConfig();
        if (!config || !config.apiKey || !config.apiKey.trim()) {
          return sendResponse(400, null, '尚未配置 AI 供应商，请联系管理员在系统设置中配置 API Key');
        }
        const raw = await callAIGeneric(
          text || '',
          ORDER_SYSTEM_PROMPT,
          config,
          filePayload,
        );
        // 注意：返回结果中绝不包含 apiKey
        return sendResponse(0, { results: raw.results || [] });
      }

      // ── parseCost: 解析成本文件（支持分批处理大量数据）────────────
      case 'parseCost': {
        const config = await resolveActiveProviderConfig();
        if (!config || !config.apiKey || !config.apiKey.trim()) {
          return sendResponse(400, null, '尚未配置 AI 供应商，请联系管理员在系统设置中配置 API Key');
        }

        const inputText = text || '';
        // 如果是图片（有 filePayload）或文本较短，直接单次解析
        if (filePayload || inputText.length < 3000) {
          const raw = await callAIGeneric(inputText, COST_SYSTEM_PROMPT, config, filePayload);
          return sendResponse(0, { results: raw.results || [] });
        }

        // 文本较长时分批解析（每批约 25 行）
        const allLines = inputText.split(/\n/).filter(l => l.trim());
        const BATCH_SIZE = 25;
        const batches = [];
        for (let i = 0; i < allLines.length; i += BATCH_SIZE) {
          batches.push(allLines.slice(i, i + BATCH_SIZE).join('\n'));
        }

        console.log(`[parseCost] 分批解析: ${allLines.length} 行 → ${batches.length} 批`);

        let allResults = [];
        for (let i = 0; i < batches.length; i++) {
          try {
            const batchPrompt = `以下是第 ${i + 1}/${batches.length} 批数据，请提取其中的铝合金材料底价信息：\n\n${batches[i]}`;
            const raw = await callAIGeneric(batchPrompt, COST_SYSTEM_PROMPT, config, null);
            if (raw.results && Array.isArray(raw.results)) {
              allResults = allResults.concat(raw.results);
            }
          } catch (batchErr) {
            console.warn(`[parseCost] 第 ${i + 1} 批解析失败:`, batchErr.message);
          }
        }

        // 去重（按 model + color）
        const seen = new Set();
        const deduped = allResults.filter(r => {
          const key = `${r.model}_${r.color}`.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        return sendResponse(0, { results: deduped });
      }

      // ── testConnection: 验证当前激活供应商 ────────────────────────
      case 'testConnection': {
        const config = await resolveActiveProviderConfig();
        if (!config || !config.apiKey || !config.apiKey.trim()) {
          return sendResponse(0, {
            success: false,
            msg: '当前未配置任何已启用的 AI 供应商 API Key',
          });
        }
        const result = await testProviderConnection(config);
        // 返回结果中不包含 apiKey
        return sendResponse(0, result);
      }

      default:
        return sendResponse(400, null, `未知 action: ${action}`);
    }
  } catch (err) {
    return sendResponse(500, null, `AI 调用失败: ${err.message || err}`);
  }
};
