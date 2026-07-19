import { useState, useCallback, useRef } from 'react';
import {
  FrameItem,
  GroupResult,
  PriceConfig,
  CostRecord,
  BarPlan,
  HistoryRecord,
  CostOverride,
} from '../types';
import { calculateGroupedResults } from '../utils/calculation';
import { processLocalFile } from '../services/parsingService';
import { cloudService, FilePayload } from '../services/cloudService';

/** V3 默认 PriceConfig（与 useLocalStorage 中 DEFAULT_PRICE_CONFIG 保持一致，使用 quote* 字段名） */
const FALLBACK_PRICE_CONFIG: PriceConfig = {
  materialPrice: 45,
  mode: '批量单(按整料)' as any,
  quoteAccessoryPrice: 15,      // 🆕 V3: 原 globalAccessoryPrice
  quoteCuttingFee: 3,           // 🆕 V3: 原 globalCuttingFee (单位: 元/米)
  quoteTaxRate: 0.13,           // 🆕 V3: 纯税率（替代旧的 taxRate=1.13 乘数）
  costAccessoryPrice: 10.5,     // 🆕 V3: 成本配件单价
  costCuttingFee: 2.1,          // 🆕 V3: 成本切割单价
  costTaxRate: 0.13,            // 🆕 V3: 成本税率
  defaultWeightPerMeter: 0.85,
  defaultWeightPerAccessorySet: 0.12,
};

export interface UseCalculationReturn {
  /* ---- Core calculation state ---- */
  inputText: string;
  setInputText: React.Dispatch<React.SetStateAction<string>>;
  items: FrameItem[];
  setItems: React.Dispatch<React.SetStateAction<FrameItem[]>>;
  results: GroupResult[];
  setResults: React.Dispatch<React.SetStateAction<GroupResult[]>>;
  isLoading: boolean;
  statusMsg: string;
  showWeight: boolean;
  setShowWeight: React.Dispatch<React.SetStateAction<boolean>>;

  /* ---- File refs ---- */
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  costFileInputRef: React.RefObject<HTMLInputElement | null>;

  /* ---- AI parser toggle ---- */
  useAiParser: boolean;
  setUseAiParser: React.Dispatch<React.SetStateAction<boolean>>;

  /* ---- Drag state ---- */
  isDragging: boolean;

  /* ---- Validation error message ---- */
  validationError: string;
  setValidationError: React.Dispatch<React.SetStateAction<string>>;

  /* ---- Current editing history record id (null = new record) ---- */
  currentHistoryId: string | null;
  setCurrentHistoryId: React.Dispatch<React.SetStateAction<string | null>>;

  /* ---- Actions ---- */
  addItemByText: (text: string) => Promise<void>;
  processSingleUploadedFile: (file: File) => Promise<void>;
  handleFileUpload: (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => Promise<void>;
  handlePaste: (
    e: React.ClipboardEvent<HTMLTextAreaElement>,
  ) => Promise<void>;
  handleDragOver: (e: React.DragEvent) => void;
  handleDragLeave: () => void;
  handleDrop: (e: React.DragEvent) => Promise<void>;
  removeItem: (id: string) => void;
  clearAll: () => void;
  copyQuotation: () => Promise<void>;
  exportCSV: () => void;
  saveCurrentToHistory: (costOverride?: CostOverride | null) => Promise<void>;
  getGroupedUniquePlans: (
    plans: BarPlan[],
  ) => Array<{ plan: BarPlan; count: number }>;

  /* Cost DB helpers */
  handleCostFileUpload: (
    e: React.ChangeEvent<HTMLInputElement>,
    currentCostDb: CostRecord[],
    setCostDb?: React.Dispatch<React.SetStateAction<CostRecord[]>>,
    batchImport?: (records: CostRecord[]) => Promise<number>,
  ) => Promise<void>;

  /* AI connection test — V4: 无参数，走 cloudService.ai.testConnection */
  testAiConnection: (
    onResult: (result: { success: boolean; msg: string } | null) => void,
    onLoading: (v: boolean) => void,
  ) => Promise<void>;
}

/**
 * Custom hook encapsulating the core quotation-calculation engine.
 *
 * V4 变更：
 * - 移除 aiSettings 依赖（AI Key 后端化，所有 AI 调用走 cloudService.ai 云函数）
 * - parseOrderWithAi / parseCostWithAi / testProviderConnection 替换为 cloudService.ai.*
 */
export function useCalculation(
  deps?: {
    priceConfig: PriceConfig;
    costDatabase: CostRecord[];
    showCosts: boolean;
    clientName: string;
    orderName: string;
    /** V4: 保存算料记录到云端的回调（由 useCloudData.saveHistoryRecord 提供） */
    saveHistoryRecord?: (record: HistoryRecord) => Promise<HistoryRecord>;
    /** V4: 更新已有算料记录的回调（由 useCloudData.updateHistoryRecord 提供） */
    updateHistoryRecord?: (id: string, record: HistoryRecord) => Promise<HistoryRecord>;
  },
): UseCalculationReturn {
  const [inputText, setInputText] = useState('');
  const [items, setItems] = useState<FrameItem[]>([]);
  const [results, setResults] = useState<GroupResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [showWeight, setShowWeight] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [useAiParser, setUseAiParser] = useState(false);
  const [validationError, setValidationError] = useState<string>('');
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const costFileInputRef = useRef<HTMLInputElement>(null);

  /** Convert a File object to a base64 string (data URL without prefix) */
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = reader.result as string;
        const commaIdx = base64String.indexOf(',');
        resolve(
          commaIdx !== -1 ? base64String.substring(commaIdx + 1) : base64String,
        );
      };
      reader.onerror = (error) => reject(error);
    });
  };

  /** 从 Excel/CSV 文件中提取文本内容（行列格式） */
  const extractExcelText = async (file: File): Promise<string> => {
    try {
      const XLSX = await import('xlsx');
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      let allText = '';
      workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        const csvText = XLSX.utils.sheet_to_csv(sheet);
        allText += `=== Sheet: ${sheetName} ===\n${csvText}\n`;
      });
      return allText;
    } catch (e) {
      // 如果 xlsx 库解析失败，尝试用纯文本读取（CSV）
      console.warn('Excel 解析失败，回退到纯文本:', e);
      return await file.text();
    }
  };

  /**
   * V4 步骤1：从文件提取文本/图片（不调 AI），用于先预览再解析的流程
   */
  const extractCostFileContent = async (
    file: File,
  ): Promise<{ textContent: string; filePayload?: FilePayload; fileName: string; fileType: string }> => {
    const fileName = file.name;
    const fileType = file.type || fileName.split('.').pop() || 'unknown';
    let textContent = '';
    let filePayload: FilePayload | undefined = undefined;

    const lowerName = fileName.toLowerCase();
    const isImage = file.type.includes('image') || /\.(jpg|jpeg|png|gif|bmp|webp)$/.test(lowerName);
    const isExcel = file.type.includes('spreadsheet') || /\.(xlsx|xls|csv)$/.test(lowerName);
    const isPdf = file.type === 'application/pdf' || lowerName.endsWith('.pdf');
    const isWord = file.type.includes('word') || /\.(docx|doc)$/.test(lowerName);

    if (isImage) {
      const b64 = await fileToBase64(file);
      filePayload = { mimeType: file.type, data: b64 };
      textContent = `[图片文件，将通过视觉模型识别: ${fileName}]`;
    } else if (isExcel) {
      textContent = await extractExcelText(file);
    } else if (isPdf) {
      const { extractPdfText } = await import('../services/parsingService');
      textContent = await extractPdfText(file);
    } else if (isWord) {
      const mammoth = await import('mammoth');
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      textContent = result.value;
    } else {
      textContent = await file.text();
    }

    return { textContent, filePayload, fileName, fileType };
  };

  /**
   * V4 步骤2：调用 AI 解析文本/图片，返回 Partial<CostRecord>[]
   * 与 extractCostFileContent 配合使用
   */
  const parseCostWithAI = async (
    textContent: string,
    filePayload?: FilePayload,
  ): Promise<Partial<CostRecord>[]> => {
    try {
      return await cloudService.ai.parseCost(textContent, filePayload);
    } catch (aiErr: any) {
      console.warn('AI 解析失败，回退到规则提取:', aiErr);
      // 兜底：按空格/制表/逗号分行提取
      const lines = textContent.split(/[\n\r]+/);
      const records: Partial<CostRecord>[] = [];
      lines.forEach((line) => {
        const parts = line.trim().split(/[\s,，;；\t]+/);
        if (parts.length >= 3) {
          const model = parts[0];
          const color = parts[1];
          const materialCost = parseFloat(parts[2]);
          const weightPerMeter = parseFloat(parts[3]) || 0.85;
          if (model && color && !isNaN(materialCost)) {
            records.push({
              model,
              color,
              materialCost,
              weightPerMeter,
              notes: parts[4] || '规则批量导入',
            });
          }
        }
      });
      return records;
    }
  };

  /**
   * Core engine: process one uploaded file through AI-only pipeline.
   * Flow: extract text (OCR/PDF) → AI parse as FrameItem.
   *
   * V4: AI 调用走 cloudService.ai.parseOrder 云函数，前端零接触 API Key
   */
  const processSingleUploadedFile = useCallback(
    async (file: File) => {
      setIsLoading(true);
      setStatusMsg(`正在解析 ${file.name}...`);
      try {
        let textContent = '';
        let filePayload: FilePayload | undefined = undefined;

        // Step 1: Extract raw content from the file
        if (file.type.includes('image')) {
          const b64 = await fileToBase64(file);
          filePayload = { mimeType: file.type, data: b64 };
        } else {
          // For non-image files (PDF, TXT, CSV, DOCX), use parsingService to extract text
          const rawItems = await processLocalFile(file);
          textContent = rawItems
            .map(
              (i) =>
                `${i.model} ${i.color} ${i.width}x${i.height} * ${i.quantity}`,
            )
            .join('\n');
        }

        // Step 2: AI 智能识别（走云函数）
        setStatusMsg(`正在通过 AI 智能识别 ${file.name}...`);
        const parsed = await cloudService.ai.parseOrder(
          textContent ||
            `从上传文件【${file.name}】中提取框料明细`,
          filePayload,
        );

        if (parsed.length === 0) {
          alert(`AI 未能从文件【${file.name}】中提取到有效项目，请检查文件内容或换个说法重试。`);
        } else {
          const validParsed = parsed.filter((item: any) => !validateFrameItem(item));
          setItems((prev) => [...prev, ...validParsed]);
          alert(
            `【${file.name}】AI 智能识别成功，导入了 ${validParsed.length} 条算料项目！`,
          );
        }
      } catch (err: any) {
        alert(`解析文件失败: ${err.message || err}`);
      } finally {
        setIsLoading(false);
        setStatusMsg('');
      }
    },
    [],
  );

  /**
   * Parse raw text input via AI-only parsing and add resulting items to the pool
   *
   * V4: 走 cloudService.ai.parseOrder
   */
  const addItemByText = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      setIsLoading(true);
      setStatusMsg('正在通过 AI 模型识别订单...');
      try {
        const parsed = await cloudService.ai.parseOrder(text);

        if (parsed.length === 0) {
          alert('AI 未能提取到有效项目，请检查输入格式或换个说法重试。');
        } else {
          const validItems = parsed.filter((item: any) => !validateFrameItem(item));
          setItems((prev) => [...prev, ...validItems]);
          setInputText('');
        }
      } catch (err: any) {
        alert(`AI 识别出错: ${err.message || err}`);
      } finally {
        setIsLoading(false);
        setStatusMsg('');
      }
    },
    [],
  );

  /** Handle <input type="file"> change event for quotation files */
  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      for (let i = 0; i < files.length; i++) {
        await processSingleUploadedFile(files[i]);
      }
      e.target.value = '';
    },
    [processSingleUploadedFile],
  );

  /** Handle paste events on the textarea (clipboard images) */
  const handlePaste = useCallback(
    async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const clipItems = e.clipboardData.items;
      let hasImage = false;

      for (let i = 0; i < clipItems.length; i++) {
        const item = clipItems[i];
        if (item.type.indexOf('image') !== -1) {
          hasImage = true;
          const file = item.getAsFile();
          if (file) {
            await processSingleUploadedFile(file);
          }
          break;
        }
      }

      if (hasImage) {
        e.preventDefault();
      }
    },
    [processSingleUploadedFile],
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          await processSingleUploadedFile(files[i]);
        }
      }
    },
    [processSingleUploadedFile],
  );

  /** Remove a single item from the pool by id */
  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  /** Clear the entire workspace */
  const clearAll = useCallback(() => {
    if (confirm('确认清空当前的所有算料尺寸数据吗？')) {
      setItems([]);
      setResults([]);
      setShowWeight(false);
      setCurrentHistoryId(null);
    }
  }, []);

  /** Copy formatted quotation text to clipboard */
  const copyQuotation = useCallback(async () => {
    const res = results;
    const pc = deps?.priceConfig ?? FALLBACK_PRICE_CONFIG;
    const cn = deps?.clientName ?? '';
    const on = deps?.orderName ?? '';
    const sw = deps?.showCosts ?? true;

    if (res.length === 0) return;
    let text = `铝合金切框报价清单\n`;
    if (cn) text += `客户: ${cn}  |  `;
    if (on) text += `订单项目: ${on}\n`;
    text += `计费模式: ${pc.mode}\n\n`;

    res.forEach((group) => {
      text += `【${group.model} | ${group.color}】(合并算料)\n`;
      group.lineItems.forEach((line) => {
        text += `- ${line.size}: ${line.quantity}个 x ¥${line.unitPrice} = ¥${line.totalPrice}\n`;
      });
      text += `小组小计: ¥${group.totalPrice} (共${group.totalBars}支料)\n`;
      if (sw) text += `小组重量: ${group.totalWeight}kg\n`;
      text += `----------------------------\n`;
    });

    const grandTotal = res.reduce((acc, g) => acc + g.totalPrice, 0);
    text += `合计总金额: ¥${grandTotal.toLocaleString()}`;

    await navigator.clipboard.writeText(text);
    alert('报价已复制到剪贴板');
  }, [results, deps]);

  /** Export results as CSV file download */
  const exportCSV = useCallback(() => {
    const res = results;
    const cn = deps?.clientName ?? '';

    if (res.length === 0) return;
    let csv = '\uFEFF型号,颜色,规格,数量,单价,总价,支数\n';
    res.forEach((group) => {
      group.lineItems.forEach((line) => {
        csv += `"${group.model}","${group.color}","${line.size}",${line.quantity},${line.unitPrice},${line.totalPrice},${group.totalBars}\n`;
      });
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `报价单_${cn || '算料'}_${new Date().getTime()}.csv`;
    link.click();
  }, [results, deps]);

  /**
   * Save current quote snapshot into the cloud history records.
   *
   * V4 变更：
   * - 调 cloudService.calculation.save 云函数替代本地 localStorage
   * - 通过 deps.saveHistoryRecord 回调统一与 useCloudData 交互
   * - 保存成功后由 useCloudData 更新本地缓存
   */
  const saveCurrentToHistory = useCallback(async (costOverride?: CostOverride | null) => {
    const currentItems = items;
    const currentResults = results;
    const currentClientName = deps?.clientName ?? '';
    const currentOrderName = deps?.orderName ?? '';
    const globalPriceConfig =
      deps?.priceConfig ?? FALLBACK_PRICE_CONFIG;

    if (currentItems.length === 0) {
      alert('当前算料池为空，无法保存！');
      return;
    }

    // 构造 effectiveConfig 作为快照：costOverride 覆盖全局 cost* 字段
    const effectiveConfig: PriceConfig = costOverride
      ? { ...globalPriceConfig, ...costOverride }
      : { ...globalPriceConfig };

    const finalQuotePrice = currentResults.reduce(
      (acc, g) => acc + g.totalPrice,
      0,
    );
    const finalCostPrice = currentResults.reduce(
      (acc, g) => acc + (g.totalCost || 0),
      0,
    );
    const finalProfit = finalQuotePrice - finalCostPrice;
    const finalMargin =
      finalQuotePrice > 0 ? (finalProfit / finalQuotePrice) * 100 : 0;

    const newRecord: HistoryRecord = {
      id: `history-${Date.now()}`,
      clientName: currentClientName.trim() || '散客',
      orderName:
        currentOrderName.trim() ||
        `切框订单-${new Date().toLocaleDateString()}`,
      createdAt: new Date().toISOString(),
      items: [...currentItems],
      priceConfig: { ...effectiveConfig },
      results: [...currentResults],
      totalQuotePrice: Number(finalQuotePrice.toFixed(2)),
      totalCostPrice: Number(finalCostPrice.toFixed(2)),
      profit: Number(finalProfit.toFixed(2)),
      profitMargin: Number(finalMargin.toFixed(1)),
    };

    try {
      // 如果当前正在编辑已有历史记录，走 update 路径更新原记录；否则走 save 创建新记录
      if (currentHistoryId && deps?.updateHistoryRecord) {
        const updated = await deps.updateHistoryRecord(currentHistoryId, newRecord);
        alert(
          `【${updated.clientName} - ${updated.orderName}】报价已成功更新至云端！`,
        );
      } else {
        const saved = deps?.saveHistoryRecord
          ? await deps.saveHistoryRecord(newRecord)
          : newRecord;
        alert(
          `【${saved.clientName} - ${saved.orderName}】报价已成功保存至云端！`,
        );
      }
    } catch (err: any) {
      alert(`保存到云端失败: ${err.message || err}`);
    }
  }, [items, results, deps, currentHistoryId]);

  /** Group bar plans by identical segment patterns for visual deduplication */
  const getGroupedUniquePlans = useCallback(
    (plans: BarPlan[]): Array<{ plan: BarPlan; count: number }> => {
      const grouped = plans.reduce(
        (acc, plan) => {
          const patternKey = plan.segments
            .map((s) => s.length.toFixed(3))
            .sort()
            .join('|');
          if (!acc[patternKey])
            acc[patternKey] = { plan, count: 0 };
          acc[patternKey].count += 1;
          return acc;
        },
        {} as Record<string, { plan: BarPlan; count: number }>,
      );
      return Object.values(grouped);
    },
    [],
  );

  /**
   * Handle cost-database file upload (CSV/TXT/image → AI 解析).
   *
   * V4 变更：
   * - 移除 aiSettings 参数（AI Key 后端化）
   * - AI 解析走 cloudService.ai.parseCost 云函数
   * - 导入改走 cloudService.costDb.batchImport（替代本地 setCostDb）
   */
  const handleCostFileUpload = useCallback(
    async (
      e: React.ChangeEvent<HTMLInputElement>,
      currentCostDb: CostRecord[],
      setCostDb?: React.Dispatch<React.SetStateAction<CostRecord[]>>,
      batchImport?: (records: CostRecord[]) => Promise<number>,
    ) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsLoading(true);
      setStatusMsg(`正在解析底价表 ${file.name}...`);
      try {
        let textContent = '';
        let filePayload: FilePayload | undefined = undefined;

        const fileName = file.name.toLowerCase();
        const isImage = file.type.includes('image') || /\.(jpg|jpeg|png|gif|bmp|webp)$/.test(fileName);
        const isExcel = file.type.includes('spreadsheet') || /\.(xlsx|xls|csv)$/.test(fileName);
        const isPdf = file.type === 'application/pdf' || fileName.endsWith('.pdf');
        const isWord = file.type.includes('word') || /\.(docx|doc)$/.test(fileName);
        const isText = file.type === 'text/plain' || file.type === 'text/csv' || /\.(txt|csv|md)$/.test(fileName);

        if (isImage) {
          // 图片：转 base64 发给 AI 视觉模型
          const b64 = await fileToBase64(file);
          filePayload = { mimeType: file.type, data: b64 };
        } else if (isExcel) {
          // Excel/CSV：前端提取文本
          setStatusMsg('正在解析 Excel 表格...');
          textContent = await extractExcelText(file);
        } else if (isPdf) {
          // PDF：用 pdfjs-dist 提取文本
          setStatusMsg('正在解析 PDF 文件...');
          const { extractPdfText } = await import('../services/parsingService');
          textContent = await extractPdfText(file);
        } else if (isWord) {
          // Word：用 mammoth 提取文本
          setStatusMsg('正在解析 Word 文档...');
          const mammoth = await import('mammoth');
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer });
          textContent = result.value;
        } else {
          // 其他文本类文件
          textContent = await file.text();
        }

        let importedRecords: Partial<CostRecord>[] = [];

        // V4: 统一走 AI 云函数解析
        try {
          setStatusMsg('正在使用 AI 模型智能解析底价列表...');
          importedRecords = await cloudService.ai.parseCost(
            textContent,
            filePayload,
          );
        } catch (aiErr: any) {
          // AI 失败时回退到传统规则提取
          setStatusMsg('AI 解析失败，回退到传统规则提取...');
          const lines = textContent.split(/[\n\r]+/);
          lines.forEach((line) => {
            const parts = line.trim().split(/[\s,，;；\t]+/);
            if (parts.length >= 3) {
              const model = parts[0];
              const color = parts[1];
              const materialCost = parseFloat(parts[2]);
              const weightPerMeter = parseFloat(parts[3]) || 0.85;
              if (model && color && !isNaN(materialCost)) {
                importedRecords.push({
                  id: `cost-${Date.now()}-${Math.random()
                    .toString(36)
                    .substring(2, 6)}`,
                  model,
                  color,
                  materialCost,
                  weightPerMeter,
                  notes: parts[4] || '规则批量导入',
                  updatedAt: new Date().toISOString(),
                });
              }
            }
          });
        }

        if (importedRecords.length === 0) {
          alert(
            '未能在底价文件中匹配到有效底价信息。格式应为: 型号 颜色 材料成本 [线密度(kg/m)] [备注]',
          );
        } else {
          const recordsToImport = importedRecords.map((item: any) => ({
            id: item.id || `cost-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            model: String(item.model || '').trim(),
            color: String(item.color || '').trim(),
            materialCost: Number(item.materialCost) || 0,
            weightPerMeter: Number(item.weightPerMeter) || 0.85,
            notes: item.notes || '批量导入',
            updatedAt: new Date().toISOString(),
          })) as CostRecord[];

          // V4: 优先走云端批量导入；若未提供 batchImport 回调则回退到本地 setCostDb
          if (batchImport) {
            const count = await batchImport(recordsToImport);
            alert(`底价批量导入成功！共导入 ${count} 条记录（云端已去重合并）。`);
          } else if (setCostDb) {
            let countNew = 0;
            let countUpdate = 0;
            const tempDb = [...currentCostDb];
            recordsToImport.forEach((item) => {
              const idx = tempDb.findIndex(
                (r) =>
                  r.model.toLowerCase() === item.model.toLowerCase() &&
                  r.color.toLowerCase() === item.color.toLowerCase(),
              );
              if (idx !== -1) {
                tempDb[idx] = { ...tempDb[idx], ...item, id: tempDb[idx].id };
                countUpdate++;
              } else {
                tempDb.unshift(item);
                countNew++;
              }
            });
            setCostDb(tempDb);
            alert(
              `底价导入成功！新增 ${countNew} 条，覆盖更新 ${countUpdate} 条。`,
            );
          } else {
            alert('底价解析成功，但未配置导入通道（请联系管理员）。');
          }
        }
      } catch (err: any) {
        alert(`导入失败: ${err.message || err}`);
      } finally {
        setIsLoading(false);
        setStatusMsg('');
        e.target.value = '';
      }
    },
    [],
  );

  /**
   * Test AI API connection.
   *
   * V4 变更：
   * - 无参数（不再传 aiSettings）
   * - 调 cloudService.ai.testConnection 云函数（测试后端激活的供应商）
   */
  const testAiConnection = useCallback(
    async (
      onResult: (result: { success: boolean; msg: string } | null) => void,
      onLoading: (v: boolean) => void,
    ) => {
      onLoading(true);
      onResult(null);

      try {
        const result = await cloudService.ai.testConnection();
        onResult(result);
      } catch (err: any) {
        onResult({
          success: false,
          msg: `连接异常: ${err.message || err}`,
        });
      } finally {
        onLoading(false);
      }
    },
    [],
  );

  return {
    inputText,
    setInputText,
    items,
    setItems,
    results,
    setResults,
    isLoading,
    statusMsg,
    showWeight,
    setShowWeight,
    fileInputRef,
    costFileInputRef,
    useAiParser,
    setUseAiParser,
    isDragging,
    validationError,
    setValidationError,
    currentHistoryId,
    setCurrentHistoryId,
    addItemByText,
    processSingleUploadedFile,
    handleFileUpload,
    handlePaste,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    removeItem,
    clearAll,
    copyQuotation,
    exportCSV,
    saveCurrentToHistory,
    getGroupedUniquePlans,
    handleCostFileUpload,
    extractCostFileContent,
    parseCostWithAI,
    testAiConnection,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Validation utility (inline to avoid circular dependency)
// ─────────────────────────────────────────────────────────────────────

/** Basic frame item validation — returns error string or empty string (valid) */
function validateFrameItem(item: FrameItem): string {
  if (!item.model || item.model === '未指定型号') return '型号不能为空';
  if (!item.color || item.color === '未指定颜色') return '颜色不能为空';
  if (item.width <= 0) return '宽度必须大于 0';
  if (item.height <= 0) return '高度必须大于 0';
  if (item.quantity <= 0) return '数量必须大于 0';
  return ''; // valid
}
