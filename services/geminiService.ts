
import { GoogleGenAI, Type } from "@google/genai";
import { FrameItem, SizeType } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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

export async function parseOrderContent(text: string, base64Image?: string): Promise<FrameItem[]> {
  try {
    const parts: any[] = [
      { text: `从以下内容中提取铝合金切框订单信息。
      规则：
      1. 提取型号、颜色、外径/内径、宽(cm)、高(cm)、数量(个)。
      2. 如果尺寸为 "80*60" 则宽80，高60。
      3. 如果未指定数量，默认为1。
      4. 输出必须严格遵守JSON格式。` }
    ];

    if (text) parts.push({ text: `文本内容: "${text}"` });
    if (base64Image) {
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: base64Image.split(',')[1] || base64Image,
        },
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ parts }],
      config: {
        responseMimeType: "application/json",
        responseSchema: extractionSchema,
      },
    });

    const results = JSON.parse(response.text);
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
