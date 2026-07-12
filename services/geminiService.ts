
import { GoogleGenAI, Type } from "@google/genai";
import { FrameItem, SizeType } from "../types";

const extractionSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      model: { type: Type.STRING, description: "型号，如 D1822" },
      color: { type: Type.STRING, description: "颜色，如 拉丝哑黑" },
      sizeType: { type: Type.STRING, description: "尺寸类型，只能是 '外径' 或 '内径'" },
      width: { type: Type.NUMBER, description: "宽度，单位CM" },
      height: { type: Type.NUMBER, description: "高度，单位CM" },
      quantity: { type: Type.NUMBER, description: "数量，单位个" },
    },
    required: ["model", "color", "sizeType", "width", "height", "quantity"],
  },
};

export interface FilePayload {
  mimeType: string;
  data: string; // base64
}

export async function parseOrderContent(text: string, filePayload?: FilePayload): Promise<FrameItem[]> {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const parts: any[] = [
      { text: `你是一个专业的铝合金加工订单识别助手。
      请从提供的【文本】或【文件（图片/PDF/文档）】中提取订单信息。
      
      规则：
      1. 提取型号、颜色、外径/内径、宽(cm)、高(cm)、数量(个)。
      2. 尺寸解析：如 "80*60" 识别为 宽80，高60。
      3. 默认值：如果未指定数量，默认为1；如果未指定尺寸类型，默认为"外径"。
      4. 容错性：如果包含多行，请全部提取。
      5. 输出必须严格遵守JSON格式数组。` }
    ];

    if (text) {
      parts.push({ text: `手动录入文本: "${text}"` });
    }

    if (filePayload) {
      parts.push({
        inlineData: {
          mimeType: filePayload.mimeType,
          data: filePayload.data,
        },
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: extractionSchema,
      },
    });

    const results = JSON.parse(response.text || '[]');
    return results.map((r: any, index: number) => ({
      ...r,
      id: `ai-${Date.now()}-${index}`,
      sizeType: r.sizeType === '内径' ? SizeType.ID : SizeType.OD,
      quantity: r.quantity || 1
    }));
  } catch (error) {
    console.error("Gemini Parsing Error:", error);
    throw error;
  }
}
