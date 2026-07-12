
import { createWorker } from 'tesseract.js';
import * as mammoth from 'mammoth';
import { FrameItem, SizeType } from '../types';

/**
 * 强化版解析引擎：支持合并逻辑
 */
function parseTextToItems(text: string): FrameItem[] {
  const items: FrameItem[] = [];
  
  // 默认值常量，用于确保合并
  const DEFAULT_MODEL = "未指定型号";
  const DEFAULT_COLOR = "未指定颜色";

  // 匹配逻辑：(型号) (颜色) (宽) * (高) (数量)
  const globalRegex = /(?:([a-zA-Z0-9-]{3,})\s+)?(?:([\u4e00-\u9fa5]{1,})\s+)?(\d+(?:\.\d+)?)\s*[x*×X]\s*(\d+(?:\.\d+)?)(?:\s*[*xX×]\s*(\d+))?(?:\s*(\d+)\s*(?:个|支|件|套)?)?/g;

  let match;
  let lastModel = DEFAULT_MODEL;
  let lastColor = DEFAULT_COLOR;

  const cleanText = text.replace(/[:：]/g, ' ');

  while ((match = globalRegex.exec(cleanText)) !== null) {
    const [full, model, color, width, height, qtySuffix, qtyStandalone] = match;
    
    // 如果匹配到了新型号/颜色，则更新后续项的默认值
    if (model) lastModel = model;
    if (color) lastColor = color;
    
    const w = parseFloat(width);
    const h = parseFloat(height);
    const q = parseInt(qtySuffix || qtyStandalone || "1");

    if (!isNaN(w) && !isNaN(h)) {
      items.push({
        id: `local-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        model: lastModel,
        color: lastColor,
        sizeType: full.includes('内径') ? SizeType.ID : SizeType.OD,
        width: w,
        height: h,
        quantity: q
      });
    }
  }

  // 兜底简单解析
  if (items.length === 0) {
    const lines = text.split(/[\n\r,，;；]/);
    lines.forEach((line, index) => {
      const parts = line.trim().split(/\s+/);
      const sizePart = parts.find(p => p.includes('*') || p.toLowerCase().includes('x'));
      if (sizePart) {
        const dims = sizePart.split(/[*xX×]/);
        if (dims.length >= 2) {
          items.push({
            id: `fallback-${Date.now()}-${index}`,
            model: parts.find(p => /^[a-zA-Z0-9-]{3,}$/.test(p)) || DEFAULT_MODEL,
            color: parts.find(p => /^[\u4e00-\u9fa5]{2,}$/.test(p)) || DEFAULT_COLOR,
            sizeType: line.includes('内径') ? SizeType.ID : SizeType.OD,
            width: parseFloat(dims[0]),
            height: parseFloat(dims[1]),
            quantity: parseInt(parts[parts.length - 1]) || 1
          });
        }
      }
    });
  }
  
  return items;
}

export async function processLocalFile(file: File): Promise<FrameItem[]> {
  let extractedText = '';
  try {
    if (file.type.includes('image')) {
      const worker = await createWorker('chi_sim');
      const { data: { text } } = await worker.recognize(file);
      extractedText = text;
      await worker.terminate();
    } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      extractedText = result.value;
    } else if (file.type === 'text/plain' || file.type === 'text/csv') {
      extractedText = await file.text();
    } else if (file.type === 'application/pdf') {
      extractedText = "建议截图PDF页面后上传进行识别。";
    }
  } catch (e) {
    console.error(e);
  }
  return parseTextToItems(extractedText);
}

export { parseTextToItems };
