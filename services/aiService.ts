import { FrameItem, SizeType, CostRecord, AiSettings } from '../types';

export interface FilePayload {
  mimeType: string;
  data: string; // base64
}

// 订单提取系统提示词
const ORDER_SYSTEM_PROMPT = `你是一个专业的铝合金加工订单提取助手。
请从用户提供的文本中，精准提取铝合金框料规格。
需要提取的字段：
- model: 型号（如 "D1822"，如果未指定，设为 "未指定型号"）
- color: 颜色（如 "拉丝哑黑"，如果未指定，设为 "未指定颜色"）
- sizeType: 尺寸类型，值只能是 "外径" 或 "内径" (默认为 "外径")
- width: 宽度，单位CM（数值，不带单位）
- height: 高度，单位CM（数值，不带单位）
- quantity: 数量，单位个（数值，不带单位，默认为 1）

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

// 成本提取系统提示词
const COST_SYSTEM_PROMPT = `你是一个专业的铝合金材料成本明细提取助手。
请从用户提供的报价单、账单或文本中提取每种铝合金型号和颜色的成本信息。
需要提取的字段：
- model: 型号（如 "D1822"）
- color: 颜色（如 "黑色"）
- materialCost: 材料成本单价，单位元/米（数值，必须大于0）
- accessoryCost: 配件成本单价，单位元/套（数值，如果未指定，设为 12）
- cuttingCost: 切割成本单价，单位元/个（数值，如果未指定，设为 10）
- notes: 备注信息（如有，可选）

返回格式：
请严格返回 JSON 对象，格式如下：
{
  "results": [
    {
      "model": "D1822",
      "color": "黑色",
      "materialCost": 25.0,
      "accessoryCost": 12.0,
      "cuttingCost": 8.0,
      "notes": "主力料"
    }
  ]
}`;

/**
 * 统一的 AI 接口调用服务
 */
export async function callAiApi(
  prompt: string,
  systemPrompt: string,
  settings: AiSettings,
  filePayload?: FilePayload
): Promise<any> {
  const { provider, apiKey, baseUrl, model } = settings;

  if (!apiKey) {
    throw new Error('未配置 AI API Key，请在系统设置中进行配置');
  }

  // 1. 针对 Google Gemini
  if (provider === 'gemini') {
    const geminiModel = model || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;

    // 将图片/文件 payload 转换为 Gemini 兼容的 parts
    const parts: any[] = [{ text: systemPrompt + "\n\n用户输入内容:\n" + prompt }];
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API 错误: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    return JSON.parse(cleanJsonResponseText(textResult));
  }

  // 2. 针对 DeepSeek 或 OpenAI 兼容格式
  else {
    const activeBaseUrl = baseUrl ? baseUrl.replace(/\/+$/, '') : (provider === 'deepseek' ? 'https://api.deepseek.com' : 'https://api.openai.com/v1');
    const url = `${activeBaseUrl}/chat/completions`;
    const activeModel = model || (provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o-mini');

    const messages: any[] = [
      { role: 'system', content: systemPrompt },
    ];

    if (filePayload) {
      // 包含多模态文件上传
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: prompt || "请分析这张图中的数据并提取明细。" },
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

    const requestBody: any = {
      model: activeModel,
      messages,
      response_format: { type: 'json_object' },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${provider.toUpperCase()} API 错误: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const textResult = data.choices?.[0]?.message?.content || '{}';
    return JSON.parse(cleanJsonResponseText(textResult));
  }
}

/**
 * 辅助方法：清洗 AI 返回的多余 Markdown 标记
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

/**
 * 智能解析订单文本
 */
export async function parseOrderWithAi(
  text: string,
  settings: AiSettings,
  filePayload?: FilePayload
): Promise<FrameItem[]> {
  try {
    const rawResult = await callAiApi(text, ORDER_SYSTEM_PROMPT, settings, filePayload);
    const results = rawResult.results || [];

    return results.map((r: any, idx: number) => ({
      id: `ai-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
      model: r.model || "未指定型号",
      color: r.color || "未指定颜色",
      sizeType: r.sizeType === '内径' ? SizeType.ID : SizeType.OD,
      width: Number(r.width) || 0,
      height: Number(r.height) || 0,
      quantity: Number(r.quantity) || 1,
    }));
  } catch (error) {
    console.error("AI Order Parsing Error:", error);
    throw error;
  }
}

/**
 * 智能解析成本表格
 */
export async function parseCostWithAi(
  text: string,
  settings: AiSettings,
  filePayload?: FilePayload
): Promise<Array<Partial<CostRecord>>> {
  try {
    const rawResult = await callAiApi(text, COST_SYSTEM_PROMPT, settings, filePayload);
    const results = rawResult.results || [];

    return results.map((r: any, idx: number) => ({
      id: `ai-cost-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
      model: r.model || "未指定型号",
      color: r.color || "未指定颜色",
      materialCost: Number(r.materialCost) || 0,
      accessoryCost: Number(r.accessoryCost) || 0,
      cuttingCost: Number(r.cuttingCost) || 0,
      notes: r.notes || "",
      updatedAt: new Date().toISOString(),
    }));
  } catch (error) {
    console.error("AI Cost Parsing Error:", error);
    throw error;
  }
}
