
import { createWorker } from 'tesseract.js';
import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

// 配置 PDF.js Worker（仅浏览器环境）
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
  ).toString();
}

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
        id: `local-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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

/**
 * 从 PDF 文件中提取文本内容
 * 使用 pdf.js 逐页提取文字层
 * @param file - PDF File 对象
 * @returns 提取的完整文本内容
 * @throws 当 PDF 加载或解析失败时抛出错误
 */
export async function extractPdfText(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map((item: any) => item.str).join(' ') + '\n';
    }
    return fullText.trim();
  } catch (error) {
    console.error('PDF 解析失败:', error);
    throw new Error('PDF 文件解析失败，请确认文件未加密且格式正确');
  }
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
      extractedText = await extractPdfText(file);
    }
  } catch (e) {
    console.error(e);
  }
  return parseTextToItems(extractedText);
}

export { parseTextToItems };
