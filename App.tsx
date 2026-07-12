import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FrameItem, GroupResult, PricingMode, PriceConfig, BarPlan, CostRecord, HistoryRecord, AiSettings, UserAccount } from './types';
import { calculateGroupedResults } from './utils/calculation';
import { processLocalFile, parseTextToItems } from './services/parsingService';
import { parseOrderWithAi, parseCostWithAi, FilePayload } from './services/aiService';
import BarVisualizer from './components/BarVisualizer';

const App: React.FC = () => {
  // === 导航状态 ===
  const [activeTab, setActiveTab] = useState<'quote' | 'cost' | 'history' | 'settings'>('quote');
  
  // === 隐私模式与成本可见性 ===
  const [showCosts, setShowCosts] = useState<boolean>(() => {
    const saved = localStorage.getItem('aluminum_show_costs');
    return saved !== 'false';
  });

  // === 核心算料状态 ===
  const [inputText, setInputText] = useState('');
  const [items, setItems] = useState<FrameItem[]>([]);
  const [results, setResults] = useState<GroupResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showWeight, setShowWeight] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  
  // === 客户与订单关联状态 ===
  const [clientName, setClientName] = useState('');
  const [orderName, setOrderName] = useState('');

  // === 报价价格配置 ===
  const [priceConfig, setPriceConfig] = useState<PriceConfig>({
    materialPrice: 45,
    accessoryPrice: 15,
    cuttingFee: 10,
    taxRate: 1.0,
    mode: PricingMode.BATCH,
    weightPerMeter: 0.85,
    weightPerAccessorySet: 0.12
  });

  // === 成本资料库状态 ===
  const [costDatabase, setCostDatabase] = useState<CostRecord[]>(() => {
    const saved = localStorage.getItem('aluminum_cost_db');
    if (saved) return JSON.parse(saved);
    // 预设美观的演示数据
    const seeds: CostRecord[] = [
      { id: 'seed-1', model: 'D1822', color: '黑色', materialCost: 22.5, accessoryCost: 8.0, cuttingCost: 5.0, notes: '拉丝哑黑 推荐底价', updatedAt: new Date().toISOString() },
      { id: 'seed-2', model: 'D1822', color: '金色', materialCost: 24.0, accessoryCost: 8.0, cuttingCost: 5.0, notes: '拉丝高光金 推荐底价', updatedAt: new Date().toISOString() },
      { id: 'seed-3', model: 'Y3011', color: '灰色', materialCost: 28.5, accessoryCost: 10.0, cuttingCost: 6.0, notes: '加厚断桥隔音灰色料', updatedAt: new Date().toISOString() },
      { id: 'seed-4', model: 'Y3011', color: '白色', materialCost: 26.0, accessoryCost: 10.0, cuttingCost: 6.0, notes: '烤漆象牙白型材', updatedAt: new Date().toISOString() }
    ];
    localStorage.setItem('aluminum_cost_db', JSON.stringify(seeds));
    return seeds;
  });

  // 成本表单状态
  const [costForm, setCostForm] = useState({
    model: '',
    color: '',
    materialCost: 25,
    accessoryCost: 8,
    cuttingCost: 5,
    notes: ''
  });
  const [editingCostId, setEditingCostId] = useState<string | null>(null);
  const [costSearch, setCostSearch] = useState('');

  // === 历史记录记忆系统 ===
  const [historyRecords, setHistoryRecords] = useState<HistoryRecord[]>(() => {
    const saved = localStorage.getItem('aluminum_history');
    if (saved) return JSON.parse(saved);
    return [];
  });
  const [historySearch, setHistorySearch] = useState('');

  // === AI 与外部 API 配置 ===
  const [aiSettings, setAiSettings] = useState<AiSettings>(() => {
    const saved = localStorage.getItem('aluminum_ai_settings');
    if (saved) return JSON.parse(saved);
    return {
      provider: 'deepseek',
      apiKey: '',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat'
    };
  });
  const [isTestingAi, setIsTestingAi] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{ success: boolean; msg: string } | null>(null);
  const [useAiParser, setUseAiParser] = useState(false);

  // === 登录与多账户管理状态 ===
  const [users, setUsers] = useState<UserAccount[]>(() => {
    const saved = localStorage.getItem('aluminum_users');
    if (saved) return JSON.parse(saved);
    const initialUsers: UserAccount[] = [
      { username: 'admin', role: 'admin', displayName: '超级管理员', avatarColor: 'indigo', password: '123', createdAt: new Date().toISOString() },
      { username: 'sales', role: 'sales', displayName: '销售业务员', avatarColor: 'emerald', password: '123', createdAt: new Date().toISOString() },
      { username: 'operator', role: 'operator', displayName: '工厂算料员', avatarColor: 'amber', password: '123', createdAt: new Date().toISOString() }
    ];
    localStorage.setItem('aluminum_users', JSON.stringify(initialUsers));
    return initialUsers;
  });

  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    const saved = localStorage.getItem('aluminum_current_user');
    return saved ? JSON.parse(saved) : null;
  });

  // 登录/注册表单状态
  const [loginForm, setLoginForm] = useState({ username: 'admin', password: '123' });
  const [registerForm, setRegisterForm] = useState({ username: '', password: '', displayName: '', role: 'sales' as 'sales' | 'operator' | 'admin' });
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [registerError, setRegisterError] = useState('');

  // === 拖拽上传与粘贴识别状态 ===
  const [isDragging, setIsDragging] = useState(false);

  // === 文件上传引用 ===
  const fileInputRef = useRef<HTMLInputElement>(null);
  const costFileInputRef = useRef<HTMLInputElement>(null);

  // === 同步当前登录用户专属数据 ===
  useEffect(() => {
    if (currentUser) {
      // 1. 专属底价库
      const savedCosts = localStorage.getItem(`aluminum_cost_db_${currentUser.username}`);
      if (savedCosts) {
        setCostDatabase(JSON.parse(savedCosts));
      } else {
        const seeds: CostRecord[] = [
          { id: 'seed-1', model: 'D1822', color: '黑色', materialCost: 22.5, accessoryCost: 8.0, cuttingCost: 5.0, notes: '拉丝哑黑 推荐底价', updatedAt: new Date().toISOString() },
          { id: 'seed-2', model: 'D1822', color: '金色', materialCost: 24.0, accessoryCost: 8.0, cuttingCost: 5.0, notes: '拉丝高光金 推荐底价', updatedAt: new Date().toISOString() },
          { id: 'seed-3', model: 'Y3011', color: '灰色', materialCost: 28.5, accessoryCost: 10.0, cuttingCost: 6.0, notes: '加厚断桥隔音灰色料', updatedAt: new Date().toISOString() },
          { id: 'seed-4', model: 'Y3011', color: '白色', materialCost: 26.0, accessoryCost: 10.0, cuttingCost: 6.0, notes: '烤漆象牙白型材', updatedAt: new Date().toISOString() }
        ];
        setCostDatabase(seeds);
      }

      // 2. 专属历史报价
      const savedHistory = localStorage.getItem(`aluminum_history_${currentUser.username}`);
      setHistoryRecords(savedHistory ? JSON.parse(savedHistory) : []);

      // 3. 专属算料池
      const savedItems = localStorage.getItem(`aluminum_items_${currentUser.username}`);
      setItems(savedItems ? JSON.parse(savedItems) : []);

      // 4. 专属报价价格参数
      const savedPriceConfig = localStorage.getItem(`aluminum_price_config_${currentUser.username}`);
      if (savedPriceConfig) {
        setPriceConfig(JSON.parse(savedPriceConfig));
      } else {
        setPriceConfig({
          materialPrice: 45,
          accessoryPrice: 15,
          cuttingFee: 10,
          taxRate: 1.0,
          mode: PricingMode.BATCH,
          weightPerMeter: 0.85,
          weightPerAccessorySet: 0.12
        });
      }

      // 5. 专属客户信息
      setClientName(localStorage.getItem(`aluminum_client_${currentUser.username}`) || '');
      setOrderName(localStorage.getItem(`aluminum_order_${currentUser.username}`) || '');
    }
  }, [currentUser]);

  // === 将个性化数据存回 LocalStorage ===
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem(`aluminum_cost_db_${currentUser.username}`, JSON.stringify(costDatabase));
    }
  }, [costDatabase, currentUser]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem(`aluminum_history_${currentUser.username}`, JSON.stringify(historyRecords));
    }
  }, [historyRecords, currentUser]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem(`aluminum_items_${currentUser.username}`, JSON.stringify(items));
    }
  }, [items, currentUser]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem(`aluminum_price_config_${currentUser.username}`, JSON.stringify(priceConfig));
    }
  }, [priceConfig, currentUser]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem(`aluminum_client_${currentUser.username}`, clientName);
    }
  }, [clientName, currentUser]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem(`aluminum_order_${currentUser.username}`, orderName);
    }
  }, [orderName, currentUser]);

  // === 系统全局配置同步 ===
  useEffect(() => {
    localStorage.setItem('aluminum_users', JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('aluminum_current_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('aluminum_current_user');
    }
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem('aluminum_ai_settings', JSON.stringify(aiSettings));
  }, [aiSettings]);

  useEffect(() => {
    localStorage.setItem('aluminum_show_costs', String(showCosts));
  }, [showCosts]);

  // === 核心计算逻辑 ===
  const handleCalculate = useCallback(() => {
    if (items.length === 0) {
      setResults([]);
      return;
    }
    // 传入 costDatabase 启用并行成本核算
    const res = calculateGroupedResults(items, priceConfig, showWeight, costDatabase);
    setResults(res);
  }, [items, priceConfig, showWeight, costDatabase]);

  useEffect(() => {
    handleCalculate();
  }, [handleCalculate]);

  // === 报价录入与文件解析 ===
  const handleManualParse = async () => {
    if (!inputText.trim()) return;

    if (useAiParser && aiSettings.apiKey) {
      setIsLoading(true);
      setStatusMsg('正在通过 AI 模型识别订单...');
      try {
        const parsed = await parseOrderWithAi(inputText, aiSettings);
        if (parsed.length === 0) {
          alert('AI 未能提取到有效的尺寸项目，请检查输入或改用传统规则解析。');
        } else {
          setItems(prev => [...prev, ...parsed]);
          setInputText('');
        }
      } catch (err: any) {
        alert(`AI 识别出错: ${err.message || err}`);
      } finally {
        setIsLoading(false);
        setStatusMsg('');
      }
    } else {
      // 传统正则表达式解析
      const parsed = parseTextToItems(inputText);
      setItems(prev => [...prev, ...parsed]);
      setInputText('');
    }
  };

  // 统一文件转 Base64 辅助函数
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = reader.result as string;
        const commaIdx = base64String.indexOf(',');
        resolve(commaIdx !== -1 ? base64String.substring(commaIdx + 1) : base64String);
      };
      reader.onerror = error => reject(error);
    });
  };

  // 单个文件的识别核心引擎：结合 AI/OCR/本地规则
  const processSingleUploadedFile = async (file: File) => {
    setIsLoading(true);
    setStatusMsg(`正在解析 ${file.name}...`);
    try {
      // 1. 如果配置了 AI Key 且启用 AI 模式 (或者它是图片)
      if (aiSettings.apiKey) {
        let textContent = '';
        let filePayload: FilePayload | undefined = undefined;

        if (file.type.includes('image')) {
          const b64 = await fileToBase64(file);
          filePayload = { mimeType: file.type, data: b64 };
        } else {
          // 文本、docx等转文字送给AI
          const rawItems = await processLocalFile(file);
          textContent = rawItems.map(i => `${i.model} ${i.color} ${i.width}x${i.height} * ${i.quantity}`).join('\n');
        }

        setStatusMsg(`正在通过 AI 智能识别 ${file.name}...`);
        const parsed = await parseOrderWithAi(textContent || `从上传文件【${file.name}】中提取框料明细`, aiSettings, filePayload);
        if (parsed.length === 0) {
          setStatusMsg('AI 未提取到有效结果，降级到本地规则解析...');
          const fallbackParsed = await processLocalFile(file);
          if (fallbackParsed.length > 0) {
            setItems(prev => [...prev, ...fallbackParsed]);
            alert(`【${file.name}】本地规则解析成功，导入了 ${fallbackParsed.length} 条算料项目！`);
          } else {
            alert(`未能在文件【${file.name}】中提取到有效规格。格式建议：宽x高 数量`);
          }
        } else {
          setItems(prev => [...prev, ...parsed]);
          alert(`【${file.name}】AI 智能识别成功，导入了 ${parsed.length} 条算料项目！`);
        }
      } else {
        // 2. 无 AI API Key，直接走本地 Tesseract OCR 或文本规则解析
        setStatusMsg('正在通过本地引擎离线解析...');
        const parsedItems = await processLocalFile(file);
        if (parsedItems.length === 0) {
          alert(`【${file.name}】未能在其中识别到有效算料尺寸，如果没有配置 AI，请确保文件或图片字迹非常端正清晰（支持 宽x高 数量 格式）。`);
        } else {
          setItems(prev => [...prev, ...parsedItems]);
          alert(`【${file.name}】本地规则解析成功，导入了 ${parsedItems.length} 条算料项目！`);
        }
      }
    } catch (err: any) {
      alert(`解析文件失败: ${err.message || err}`);
    } finally {
      setIsLoading(false);
      setStatusMsg('');
    }
  };

  // 支持多个文件并发/依次导入
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      await processSingleUploadedFile(files[i]);
    }
    e.target.value = '';
  };

  // 支持输入框粘贴剪贴板图片
  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
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
  };

  // 拖拽相关事件
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        await processSingleUploadedFile(files[i]);
      }
    }
  };

  // === 成本资料库操作 ===
  const handleSaveCost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!costForm.model.trim() || !costForm.color.trim()) {
      alert('请填写完整的型号与颜色');
      return;
    }

    const updatedRecord: CostRecord = {
      id: editingCostId || `cost-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      model: costForm.model.trim(),
      color: costForm.color.trim(),
      materialCost: Number(costForm.materialCost) || 0,
      accessoryCost: Number(costForm.accessoryCost) || 0,
      cuttingCost: Number(costForm.cuttingCost) || 0,
      notes: costForm.notes.trim(),
      updatedAt: new Date().toISOString()
    };

    if (editingCostId) {
      setCostDatabase(prev => prev.map(r => r.id === editingCostId ? updatedRecord : r));
      setEditingCostId(null);
    } else {
      // 避免重复项：如果型号颜色完全一致，直接覆写
      const existingIdx = costDatabase.findIndex(
        r => r.model.toLowerCase() === updatedRecord.model.toLowerCase() &&
             r.color.toLowerCase() === updatedRecord.color.toLowerCase()
      );
      if (existingIdx !== -1) {
        if (confirm(`型号【${updatedRecord.model}】颜色【${updatedRecord.color}】已存在，是否直接更新它的底价？`)) {
          setCostDatabase(prev => prev.map((r, idx) => idx === existingIdx ? { ...updatedRecord, id: r.id } : r));
        } else {
          return;
        }
      } else {
        setCostDatabase(prev => [updatedRecord, ...prev]);
      }
    }

    setCostForm({ model: '', color: '', materialCost: 25, accessoryCost: 8, cuttingCost: 5, notes: '' });
  };

  const editCostRecord = (record: CostRecord) => {
    setEditingCostId(record.id);
    setCostForm({
      model: record.model,
      color: record.color,
      materialCost: record.materialCost,
      accessoryCost: record.accessoryCost,
      cuttingCost: record.cuttingCost,
      notes: record.notes || ''
    });
  };

  const deleteCostRecord = (id: string) => {
    if (confirm('确认删除该材料的底价配置吗？')) {
      setCostDatabase(prev => prev.filter(r => r.id !== id));
      if (editingCostId === id) {
        setEditingCostId(null);
        setCostForm({ model: '', color: '', materialCost: 25, accessoryCost: 8, cuttingCost: 5, notes: '' });
      }
    }
  };

  const handleCostImportClick = () => {
    costFileInputRef.current?.click();
  };

  // 成本库文本/文件快速导入
  const handleCostFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setStatusMsg(`正在解析底价表 ${file.name}...`);
    try {
      let textContent = '';
      let filePayload: FilePayload | undefined = undefined;

      if (file.type.includes('image')) {
        const b64 = await fileToBase64(file);
        filePayload = { mimeType: file.type, data: b64 };
      } else {
        textContent = await file.text();
      }

      let importedRecords: Partial<CostRecord>[] = [];

      // 1. 如果配了 AI，用 AI 提取底价
      if (aiSettings.apiKey) {
        setStatusMsg('正在使用 AI 模型智能解析底价列表...');
        importedRecords = await parseCostWithAi(textContent, aiSettings, filePayload);
      } else {
        // 2. 传统规则解析底价文本
        setStatusMsg('传统离线规则提取底价 (支持 CSV/制表符/空格分隔)...');
        const lines = textContent.split(/[\n\r]+/);
        lines.forEach(line => {
          const parts = line.trim().split(/[\s,，;；\t]+/);
          if (parts.length >= 3) {
            const model = parts[0];
            const color = parts[1];
            const materialCost = parseFloat(parts[2]);
            if (model && color && !isNaN(materialCost)) {
              importedRecords.push({
                id: `cost-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                model,
                color,
                materialCost,
                accessoryCost: parseFloat(parts[3]) || 8,
                cuttingCost: parseFloat(parts[4]) || 5,
                notes: parts[5] || '规则批量导入',
                updatedAt: new Date().toISOString()
              });
            }
          }
        });
      }

      if (importedRecords.length === 0) {
        alert('未能在底价文件中匹配到有效底价信息。格式应为: 型号 颜色 材料成本 [配件成本] [切割成本]');
      } else {
        let countNew = 0;
        let countUpdate = 0;
        const tempDb = [...costDatabase];

        importedRecords.forEach((item: any) => {
          const idx = tempDb.findIndex(
            r => r.model.toLowerCase() === item.model.toLowerCase() &&
                 r.color.toLowerCase() === item.color.toLowerCase()
          );
          if (idx !== -1) {
            tempDb[idx] = { ...tempDb[idx], ...item, id: tempDb[idx].id };
            countUpdate++;
          } else {
            tempDb.unshift(item as CostRecord);
            countNew++;
          }
        });

        setCostDatabase(tempDb);
        alert(`底价导入成功！新增 ${countNew} 条，覆盖更新 ${countUpdate} 条。`);
      }
    } catch (err: any) {
      alert(`导入失败: ${err.message || err}`);
    } finally {
      setIsLoading(false);
      setStatusMsg('');
      e.target.value = '';
    }
  };

  // === 历史记录记忆系统操作 ===
  const saveCurrentToHistory = () => {
    if (items.length === 0) {
      alert('当前算料池为空，无法保存！');
      return;
    }

    const finalQuotePrice = results.reduce((acc, g) => acc + g.totalPrice, 0);
    const finalCostPrice = results.reduce((acc, g) => acc + (g.totalCost || 0), 0);
    const finalProfit = finalQuotePrice - finalCostPrice;
    const finalMargin = finalQuotePrice > 0 ? (finalProfit / finalQuotePrice) * 100 : 0;

    const newRecord: HistoryRecord = {
      id: `history-${Date.now()}`,
      clientName: clientName.trim() || '散客',
      orderName: orderName.trim() || `切框订单-${new Date().toLocaleDateString()}`,
      createdAt: new Date().toISOString(),
      items: [...items],
      priceConfig: { ...priceConfig },
      results: [...results],
      totalQuotePrice: Number(finalQuotePrice.toFixed(2)),
      totalCostPrice: Number(finalCostPrice.toFixed(2)),
      profit: Number(finalProfit.toFixed(2)),
      profitMargin: Number(finalMargin.toFixed(1))
    };

    setHistoryRecords(prev => [newRecord, ...prev]);
    alert(`【${newRecord.clientName} - ${newRecord.orderName}】报价已成功保存至记忆系统！`);
  };

  const loadHistoryRecord = (record: HistoryRecord) => {
    if (confirm(`是否载入历史记录：【${record.clientName} - ${record.orderName}】？这会覆盖当前的算料工作区。`)) {
      setItems(record.items);
      setPriceConfig(record.priceConfig);
      setClientName(record.clientName);
      setOrderName(record.orderName);
      setActiveTab('quote'); // 跳转到算料选项卡
    }
  };

  const deleteHistoryRecord = (id: string) => {
    if (confirm('确认彻底删除该条历史报价单吗？该操作不可撤销。')) {
      setHistoryRecords(prev => prev.filter(r => r.id !== id));
    }
  };

  // === AI 测试连接 ===
  const testAiConnection = async () => {
    if (!aiSettings.apiKey.trim()) {
      setAiTestResult({ success: false, msg: '请输入 API Key 之后再测试连接。' });
      return;
    }

    setIsTestingAi(true);
    setAiTestResult(null);

    try {
      const { provider, apiKey, baseUrl, model } = aiSettings;
      let url = '';
      let bodyData = {};

      if (provider === 'gemini') {
        const geminiModel = model || 'gemini-2.5-flash';
        url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;
        bodyData = {
          contents: [{ parts: [{ text: "请回复英文：OK" }] }]
        };
      } else {
        const activeBaseUrl = baseUrl ? baseUrl.replace(/\/+$/, '') : (provider === 'deepseek' ? 'https://api.deepseek.com' : 'https://api.openai.com/v1');
        url = `${activeBaseUrl}/chat/completions`;
        bodyData = {
          model: model || (provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o-mini'),
          messages: [{ role: "user", content: "请回复：OK" }],
          max_tokens: 10
        };
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(provider !== 'gemini' ? { 'Authorization': `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify(bodyData)
      });

      if (response.ok) {
        setAiTestResult({ success: true, msg: 'API 连接成功！模型响应迅速，可以开始愉快使用智能识别！' });
      } else {
        const errorText = await response.text();
        setAiTestResult({ success: false, msg: `API 响应失败 (状态码 ${response.status}): ${errorText}` });
      }
    } catch (err: any) {
      setAiTestResult({ success: false, msg: `连接测试异常: ${err.message || err}` });
    } finally {
      setIsTestingAi(false);
    }
  };

  // === 全局导出/导入 JSON 备份 ===
  const exportAllBackup = () => {
    const backupData = {
      version: '1.0.0',
      costDatabase,
      historyRecords,
      aiSettings,
      priceConfig,
      exportDate: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `铝合金算料助手_完整数据备份_${new Date().getTime()}.json`;
    link.click();
  };

  const importBackupFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.costDatabase) setCostDatabase(data.costDatabase);
        if (data.historyRecords) setHistoryRecords(data.historyRecords);
        if (data.aiSettings) setAiSettings(data.aiSettings);
        if (data.priceConfig) setPriceConfig(data.priceConfig);
        alert('数据恢复成功！所有历史记录、底价资料库及配置已恢复。');
      } catch (err) {
        alert('解析备份文件失败，请确保格式正确。');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // === 复制报价清单 ===
  const copyQuotation = async () => {
    if (results.length === 0) return;
    let text = `铝合金切框报价清单\n`;
    if (clientName) text += `客户: ${clientName}  |  `;
    if (orderName) text += `订单项目: ${orderName}\n`;
    text += `计费模式: ${priceConfig.mode}\n\n`;

    results.forEach(group => {
      text += `【${group.model} | ${group.color}】(合并算料)\n`;
      group.lineItems.forEach(line => {
        text += `- ${line.size}: ${line.quantity}个 x ¥${line.unitPrice} = ¥${line.totalPrice}\n`;
      });
      text += `小组小计: ¥${group.totalPrice} (共${group.totalBars}支料)\n`;
      if (showWeight) text += `小组重量: ${group.totalWeight}kg\n`;
      text += `----------------------------\n`;
    });
    
    const grandTotal = results.reduce((acc, g) => acc + g.totalPrice, 0);
    text += `合计总金额: ¥${grandTotal.toLocaleString()}`;
    await navigator.clipboard.writeText(text);
    alert('报价已复制到剪贴板');
  };

  const exportCSV = () => {
    if (results.length === 0) return;
    let csv = '\uFEFF型号,颜色,规格,数量,单价,总价,支数\n';
    results.forEach(group => {
      group.lineItems.forEach(line => {
        csv += `"${group.model}","${group.color}","${line.size}",${line.quantity},${line.unitPrice},${line.totalPrice},${group.totalBars}\n`;
      });
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `报价单_${clientName || '算料'}_${new Date().getTime()}.csv`;
    link.click();
  };

  const removeItem = (id: string) => setItems(items.filter(i => i.id !== id));
  const clearAll = () => {
    if (confirm('确认清空当前的所有算料尺寸数据吗？')) {
      setItems([]);
      setResults([]);
      setShowWeight(false);
      setClientName('');
      setOrderName('');
    }
  };

  const getGroupedUniquePlans = (plans: BarPlan[]) => {
    const grouped = plans.reduce((acc, plan) => {
      const patternKey = plan.segments.map(s => s.length.toFixed(3)).sort().join('|');
      if (!acc[patternKey]) acc[patternKey] = { plan, count: 0 };
      acc[patternKey].count += 1;
      return acc;
    }, {} as Record<string, { plan: BarPlan, count: number }>);
    return Object.values(grouped);
  };

  // 过滤后的底价列表
  const filteredCostDb = costDatabase.filter(r => 
    r.model.toLowerCase().includes(costSearch.toLowerCase()) || 
    r.color.toLowerCase().includes(costSearch.toLowerCase()) ||
    (r.notes || '').toLowerCase().includes(costSearch.toLowerCase())
  );

  // 过滤后的历史列表
  const filteredHistory = historyRecords.filter(r =>
    r.clientName.toLowerCase().includes(historySearch.toLowerCase()) ||
    r.orderName.toLowerCase().includes(historySearch.toLowerCase())
  );

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 selection:bg-indigo-100">
        <div className="sm:mx-auto w-full max-w-md">
          <div className="flex justify-center mb-4">
            <div className="bg-indigo-600 p-3 rounded-2xl shadow-xl shadow-indigo-500/20 text-white animate-bounce">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
          </div>
          <h2 className="text-center text-2xl font-black text-slate-900 tracking-tight">铝合金切框报价助手</h2>
          <p className="mt-1 text-center text-xs text-slate-400 font-bold uppercase tracking-wider">
            企业账号安全登录系统
          </p>
        </div>

        <div className="mt-8 sm:mx-auto w-full max-w-md px-4">
          <div className="bg-white py-8 px-6 shadow-xl border border-slate-200/80 rounded-[2.5rem] sm:px-10">
            {/* 标签切换 */}
            <div className="flex border-b border-slate-100 mb-6 pb-1">
              <button
                onClick={() => { setIsRegisterMode(false); setLoginError(''); }}
                className={`flex-1 pb-3 text-xs font-black border-b-2 transition-all ${!isRegisterMode ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400'}`}
              >
                企业密码登录
              </button>
              <button
                onClick={() => { setIsRegisterMode(true); setRegisterError(''); }}
                className={`flex-1 pb-3 text-xs font-black border-b-2 transition-all ${isRegisterMode ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400'}`}
              >
                注册新职员
              </button>
            </div>

            {!isRegisterMode ? (
              /* 登录表单 */
              <form className="space-y-4" onSubmit={handleLogin}>
                {loginError && (
                  <div className="bg-rose-50 text-rose-600 border border-rose-100 px-4 py-2 rounded-xl text-[11px] font-bold">
                    ⚠️ {loginError}
                  </div>
                )}
                
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">用户名/账号</label>
                  <input
                    type="text"
                    required
                    value={loginForm.username}
                    onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none placeholder:text-slate-300"
                    placeholder="请输入登录用户名"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">登录密码</label>
                  </div>
                  <input
                    type="password"
                    required
                    value={loginForm.password}
                    onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-mono font-bold focus:ring-2 ring-indigo-500/20 outline-none placeholder:text-slate-300"
                    placeholder="请输入密码 (内置账号默认: 123)"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-indigo-600 text-white py-2.5 rounded-xl font-black text-xs hover:bg-indigo-700 active:scale-98 transition-all shadow-md shadow-indigo-600/10 mt-2"
                >
                  立即登录系统
                </button>

                {/* 预设账号快速登入 */}
                <div className="pt-4 border-t border-slate-100">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-center mb-3">
                    演示测试：一键选择角色登入
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { username: 'admin', label: '超级管理员', color: 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200' },
                      { username: 'sales', label: '销售业务员', color: 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200' },
                      { username: 'operator', label: '工厂加工端', color: 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200' }
                    ].map(acc => (
                      <button
                        key={acc.username}
                        type="button"
                        onClick={() => {
                          const matched = users.find(u => u.username === acc.username);
                          if (matched) setCurrentUser(matched);
                        }}
                        className={`py-2 text-[9px] font-black border rounded-xl transition-all ${acc.color}`}
                      >
                        {acc.label}
                      </button>
                    ))}
                  </div>
                </div>
              </form>
            ) : (
              /* 注册表单 */
              <form className="space-y-4" onSubmit={handleRegister}>
                {registerError && (
                  <div className="bg-rose-50 text-rose-600 border border-rose-100 px-4 py-2 rounded-xl text-[11px] font-bold">
                    ⚠️ {registerError}
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">注册登录名</label>
                  <input
                    type="text"
                    required
                    value={registerForm.username}
                    onChange={(e) => setRegisterForm({ ...registerForm, username: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none placeholder:text-slate-300"
                    placeholder="仅限英文字母与数字，如: tom99"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">职员真实姓名/称呼</label>
                  <input
                    type="text"
                    required
                    value={registerForm.displayName}
                    onChange={(e) => setRegisterForm({ ...registerForm, displayName: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none placeholder:text-slate-300"
                    placeholder="如: 王经理、销售李阳"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">登录密码</label>
                  <input
                    type="password"
                    required
                    value={registerForm.password}
                    onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-mono font-bold focus:ring-2 ring-indigo-500/20 outline-none placeholder:text-slate-300"
                    placeholder="请设置您的登录密码"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">职能岗位授权</label>
                  <select
                    value={registerForm.role}
                    onChange={(e) => setRegisterForm({ ...registerForm, role: e.target.value as any })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none"
                  >
                    <option value="sales">销售员 (看全套底价与预估利润)</option>
                    <option value="operator">车间工人 (不显示任何底价与利润)</option>
                    <option value="admin">超级管理员 (全部设置与账号分配权)</option>
                  </select>
                </div>

                <button
                  type="submit"
                  className="w-full bg-indigo-600 text-white py-2.5 rounded-xl font-black text-xs hover:bg-indigo-700 active:scale-98 transition-all shadow-md shadow-indigo-600/10 mt-4"
                >
                  注册并去登录
                </button>
              </form>
            )}
          </div>
          
          <p className="mt-4 text-center text-[10px] text-slate-400 font-medium">
            提示：系统使用前端沙箱隔离数据。切换账号会自动切换对应的历史底价库和记忆单据。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-indigo-100">
      
      {/* ================= 侧边栏 ================= */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 border-r border-slate-800 shadow-2xl relative z-40">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-indigo-500 to-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-500/20">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-black text-white tracking-wide leading-tight">铝合金切框报价助手</h1>
              <span className="text-[9px] text-indigo-400 font-bold uppercase tracking-wider">Smart Dual Quoting v2.0</span>
            </div>
          </div>
        </div>

        {/* 侧边栏导航菜单 */}
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          <button 
            onClick={() => setActiveTab('quote')}
            className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-xs font-bold transition-all ${activeTab === 'quote' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/10' : 'hover:bg-slate-800/60 text-slate-400 hover:text-slate-200'}`}
          >
            <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
            报价算料工作区
          </button>
          <button 
            onClick={() => setActiveTab('cost')}
            className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-xs font-bold transition-all ${activeTab === 'cost' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/10' : 'hover:bg-slate-800/60 text-slate-400 hover:text-slate-200'}`}
          >
            <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            材料成本资料库
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-xs font-bold transition-all ${activeTab === 'history' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/10' : 'hover:bg-slate-800/60 text-slate-400 hover:text-slate-200'}`}
          >
            <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            历史报价记录
            {historyRecords.length > 0 && (
              <span className="ml-auto bg-slate-800 text-[9px] text-indigo-400 font-extrabold px-2 py-0.5 rounded-full">
                {historyRecords.length}
              </span>
            )}
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-xs font-bold transition-all ${activeTab === 'settings' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/10' : 'hover:bg-slate-800/60 text-slate-400 hover:text-slate-200'}`}
          >
            <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            系统与AI配置
          </button>
        </nav>

        {/* 侧边栏底部：隐私模式开关 & 状态 */}
        <div className="p-4 border-t border-slate-800 space-y-4">
          {/* 用户账户状态卡片 */}
          {currentUser && (
            <div className="bg-slate-950/40 p-3 rounded-2xl border border-slate-800/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs text-white uppercase ${currentUser.avatarColor === 'indigo' ? 'bg-indigo-600' : currentUser.avatarColor === 'emerald' ? 'bg-emerald-600' : 'bg-amber-500'}`}>
                  {currentUser.displayName.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black text-slate-100 truncate">{currentUser.displayName}</p>
                  <p className="text-[8px] text-slate-400 font-medium">
                    {currentUser.role === 'admin' ? '超级管理员' : currentUser.role === 'sales' ? '销售员' : '车间加工端'}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => {
                  if (confirm('是否确认退出登录？退出后需要重新输入账密。')) {
                    setCurrentUser(null);
                  }
                }}
                className="text-slate-400 hover:text-rose-400 transition-all text-[9px] font-bold p-1 hover:bg-slate-800 rounded-lg shrink-0"
                title="退出登录"
              >
                退出
              </button>
            </div>
          )}

          <div className="bg-slate-950/50 p-3 rounded-2xl border border-slate-800/60">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-slate-200">👀 显示底价与利润</p>
                <p className="text-[8px] text-slate-500">客户在旁建议关闭此项</p>
              </div>
              <button 
                onClick={() => setShowCosts(!showCosts)}
                disabled={currentUser?.role === 'operator'}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${showCosts && currentUser?.role !== 'operator' ? 'bg-indigo-600' : 'bg-slate-700'} ${currentUser?.role === 'operator' ? 'opacity-40 cursor-not-allowed' : ''}`}
                title={currentUser?.role === 'operator' ? '您当前为车间权限，已被强制定向隐藏底价与利润' : ''}
              >
                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${showCosts && currentUser?.role !== 'operator' ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-500 px-1">
            <span>本地隔离存储</span>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </div>
        </div>
      </aside>

      {/* ================= 主体内容区 ================= */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        
        {/* 全局加载条 */}
        {isLoading && (
          <div className="fixed top-0 left-0 right-0 z-50 h-1.5 bg-indigo-100 overflow-hidden">
            <div className="h-full bg-indigo-600 animate-[loading_1.5s_infinite_linear]" style={{ width: '40%' }}></div>
          </div>
        )}

        {/* ==================== 选项卡：报价算料工作区 ==================== */}
        {activeTab === 'quote' && (
          <>
            <header className="bg-white border-b border-slate-200 px-8 py-5 sticky top-0 z-10 flex items-center justify-between shadow-sm">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black tracking-tight text-slate-900">算料与智能报价工作区</h2>
                  <span className="text-[10px] bg-slate-100 text-slate-500 border px-2 py-0.5 rounded-md font-bold">主线算料池</span>
                </div>
                <p className="text-xs text-slate-400">相同型号、颜色自动合并套料，计算最佳支数与毛利润</p>
              </div>

              <div className="flex items-center gap-3">
                <button 
                  onClick={clearAll} 
                  className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                >
                  清空工作区
                </button>
                {results.length > 0 && (
                  <button 
                    onClick={saveCurrentToHistory} 
                    className="px-5 py-2.5 bg-emerald-600 text-white text-xs font-black rounded-xl hover:bg-emerald-700 shadow-md shadow-emerald-500/15 transition-all flex items-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                    保存本单报价
                  </button>
                )}
              </div>
            </header>

            <main className="px-8 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-7xl w-full mx-auto">
              {/* 左侧配置与数据录入面板 */}
              <div className="lg:col-span-4 space-y-6">
                
                {/* 客户信息卡片 */}
                <section className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full -mr-12 -mt-12"></div>
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">客户与订单基本信息</h3>
                  <div className="space-y-3 relative z-10">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase ml-1">客户姓名/称呼</label>
                      <input 
                        type="text" 
                        value={clientName} 
                        onChange={(e) => setClientName(e.target.value)} 
                        placeholder="例如：李老板、南山张总" 
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none placeholder:text-slate-300"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase ml-1">订单/项目名称</label>
                      <input 
                        type="text" 
                        value={orderName} 
                        onChange={(e) => setOrderName(e.target.value)} 
                        placeholder="例如：天阅公馆1002号房切框" 
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none placeholder:text-slate-300"
                      />
                    </div>
                  </div>
                </section>

                {/* 价格配置卡片 */}
                <section className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-center mb-5">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">报价计费与技术参数</h3>
                    <span className="text-[9px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-extrabold">手动核价</span>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="flex p-1 bg-slate-100 rounded-2xl">
                      <button 
                        onClick={() => setPriceConfig({...priceConfig, mode: PricingMode.BATCH})} 
                        className={`flex-1 py-2 text-[10px] font-black rounded-xl transition-all ${priceConfig.mode === PricingMode.BATCH ? 'bg-white text-slate-900 shadow' : 'text-slate-400'}`}
                      >
                        批量整料合并
                      </button>
                      <button 
                        onClick={() => setPriceConfig({...priceConfig, mode: PricingMode.RETAIL})} 
                        className={`flex-1 py-2 text-[10px] font-black rounded-xl transition-all ${priceConfig.mode === PricingMode.RETAIL ? 'bg-white text-slate-900 shadow' : 'text-slate-400'}`}
                      >
                        零散周长计算
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: '材料报价(元/米)', key: 'materialPrice' },
                        { label: '配件报价(元/个)', key: 'accessoryPrice' },
                        { label: '切割报价(元/个)', key: 'cuttingFee' },
                        { label: '综合税率(无税填1)', key: 'taxRate' },
                        { label: '每米重量(kg)', key: 'weightPerMeter' },
                        { label: '配件重量/套', key: 'weightPerAccessorySet' }
                      ].map(field => (
                        <div key={field.key} className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase ml-1">{field.label}</label>
                          <input 
                            type="number" 
                            step="0.01"
                            value={priceConfig[field.key as keyof PriceConfig]} 
                            onChange={(e) => setPriceConfig({...priceConfig, [field.key]: Number(e.target.value)})} 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-1.5 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none" 
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                {/* 快速录入卡片 */}
                <section 
                  className={`bg-white p-6 rounded-[2rem] border transition-all relative overflow-hidden shadow-sm ${isDragging ? 'border-indigo-500 ring-4 ring-indigo-500/10 scale-[1.01]' : 'border-slate-200'}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  {/* 拖拽文件时的视觉效果覆盖层 */}
                  {isDragging && (
                    <div className="absolute inset-0 bg-indigo-600/90 backdrop-blur-sm z-30 flex flex-col items-center justify-center text-white p-6 transition-all animate-fade-in text-center">
                      <div className="bg-white/20 p-4 rounded-full mb-3 animate-bounce">
                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                      </div>
                      <p className="font-black text-sm mb-1">将材料清单文件拖至此处</p>
                      <p className="text-[10px] text-indigo-100 opacity-90 max-w-xs">支持直接识别图片、TXT、CSV、Word (docx)、PDF 等各种类型的订单规格清单</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between mb-4">
                    <div className="space-y-0.5">
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">快捷录入明细</h3>
                      <p className="text-[9px] text-slate-300">支持直接复制粘贴图片、多文件拖拽</p>
                    </div>
                    
                    {/* 传统与 AI 模式切换 */}
                    {aiSettings.apiKey && (
                      <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border">
                        <button 
                          onClick={() => setUseAiParser(false)} 
                          className={`px-2 py-0.5 text-[8px] font-black rounded ${!useAiParser ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'}`}
                        >
                          传统
                        </button>
                        <button 
                          onClick={() => setUseAiParser(true)} 
                          className={`px-2 py-0.5 text-[8px] font-black rounded flex items-center gap-0.5 ${useAiParser ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400'}`}
                        >
                          🤖 AI
                        </button>
                      </div>
                    )}
                  </div>

                  <textarea 
                    value={inputText} 
                    onChange={(e) => setInputText(e.target.value)} 
                    onPaste={handlePaste}
                    placeholder={useAiParser 
                      ? "【AI模式】可粘贴截图、文字/数字，或拖入各种文件。示例:\n李老板要D1822黑色，长1米宽80，切10个外径；另外做两个内径宽50x80高"
                      : "格式: 型号 颜色 宽x高 数量\n支持粘贴/拖入各种类型文件或复制粘贴图片识别！\n示例: D1822 黑色 80x60 10\n(不输入型号和颜色将自动继承上次输入)"
                    }
                    className="w-full h-24 p-4 text-xs bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 ring-indigo-500 outline-none resize-none mb-4 font-mono transition-all placeholder:text-slate-300" 
                  />
                  <div className="flex gap-2">
                    <button 
                      onClick={handleManualParse} 
                      className="flex-1 bg-slate-900 text-white py-3 rounded-xl font-black text-xs hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-md shadow-slate-900/10"
                    >
                      {useAiParser ? 'AI 识别并添加' : '加入算料池'}
                    </button>
                    
                    <button 
                      onClick={() => fileInputRef.current?.click()} 
                      title="上传清单文件 (支持多选图片、Word、CSV、TXT、PDF等)"
                      className="px-4 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-all flex items-center justify-center border border-indigo-200/50"
                    >
                      <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </button>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileUpload} 
                      accept="image/*,.txt,.csv,.docx,.doc,application/pdf" 
                      multiple 
                      hidden 
                    />
                  </div>
                  {isLoading && statusMsg && (
                    <div className="mt-3 flex items-center gap-1.5 text-[10px] font-black text-indigo-600 animate-pulse uppercase tracking-wider">
                      <svg className="animate-spin h-3.5 w-3.5 text-indigo-600" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {statusMsg}
                    </div>
                  )}
                </section>

                {/* 当前明细库列表 */}
                <section className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm max-h-[300px] overflow-y-auto custom-scrollbar">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">当前明细池 ({items.length})</h3>
                    {items.length > 0 && (
                      <button onClick={() => setItems([])} className="text-[9px] font-black text-red-500 hover:underline">一键清池</button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {items.length === 0 ? (
                      <div className="text-center py-10 text-slate-300 text-xs font-bold uppercase tracking-widest border border-dashed rounded-xl">算料池为空</div>
                    ) : (
                      items.map(item => (
                        <div key={item.id} className="group flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-100/40 transition-all">
                          <div className="text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="font-black text-slate-800">{item.model}</span>
                              <span className="text-slate-300">·</span>
                              <span className="font-bold text-slate-500">{item.color}</span>
                            </div>
                            <p className="text-slate-400 font-bold mt-0.5">{item.width} x {item.height} cm <span className="bg-slate-200/60 text-slate-600 px-1.5 py-0.5 rounded text-[8px] ml-1.5">{item.sizeType}</span> x{item.quantity}</p>
                          </div>
                          <button 
                            onClick={() => removeItem(item.id)} 
                            className="p-1 text-slate-300 hover:text-red-500 transition-all"
                            title="删除该条"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>

              {/* 右侧合并计算结果 */}
              <div className="lg:col-span-8 space-y-6">
                
                {/* 成本与毛利分析仪表盘 (私密/显示模式控制) */}
                {results.length > 0 && showCosts && (
                  <section className="bg-gradient-to-tr from-indigo-900 to-slate-900 text-white p-7 rounded-[2.5rem] shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full -mr-40 -mt-40 blur-3xl"></div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative z-10">
                      <div className="space-y-1 md:col-span-1 border-r border-white/10 pr-4">
                        <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">合同总报价 (含税)</p>
                        <p className="text-3xl font-black tracking-tight text-white">¥ {results.reduce((acc, g) => acc + g.totalPrice, 0).toLocaleString()}</p>
                        <p className="text-[9px] text-slate-400 font-medium">报价客户：{clientName || '临时散客'}</p>
                      </div>

                      <div className="space-y-1 md:col-span-1 border-r border-white/10 pr-4">
                        <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">核算底价总成本</p>
                        <p className="text-3xl font-black tracking-tight text-slate-100">¥ {results.reduce((acc, g) => acc + (g.totalCost || 0), 0).toLocaleString()}</p>
                        <p className="text-[9px] text-slate-400 font-medium">依据底价资料库计算</p>
                      </div>

                      <div className="space-y-1 md:col-span-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">预估净毛利</p>
                          {(() => {
                            const totalQuote = results.reduce((acc, g) => acc + g.totalPrice, 0);
                            const totalCost = results.reduce((acc, g) => acc + (g.totalCost || 0), 0);
                            const profit = totalQuote - totalCost;
                            const margin = totalQuote > 0 ? (profit / totalQuote) * 100 : 0;
                            return (
                              <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-black ${
                                margin >= 40 ? 'bg-emerald-500/20 text-emerald-400' :
                                margin >= 25 ? 'bg-blue-500/20 text-blue-400' :
                                margin >= 0 ? 'bg-amber-500/20 text-amber-400' :
                                'bg-red-500/20 text-rose-400 animate-pulse'
                              }`}>
                                毛利率: {margin.toFixed(1)}%
                              </span>
                            );
                          })()}
                        </div>
                        <p className="text-3xl font-black tracking-tight text-emerald-400">
                          ¥ {(results.reduce((acc, g) => acc + g.totalPrice, 0) - results.reduce((acc, g) => acc + (g.totalCost || 0), 0)).toLocaleString()}
                        </p>
                        <p className="text-[9px] text-slate-400 font-medium">未扣除人工与固定设备摊销</p>
                      </div>
                    </div>
                  </section>
                )}

                {/* 算料计算明细结果卡片 */}
                <section className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-200 min-h-[600px]">
                  <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-8 border-b border-slate-100 pb-6">
                    <div>
                      <h2 className="text-[11px] font-black text-indigo-600 uppercase tracking-[0.2em] mb-1">Calculation Results</h2>
                      <p className="text-slate-400 text-xs font-bold">相同型号颜色已自动合并算料与平摊报价</p>
                    </div>
                    {results.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        <button 
                          onClick={() => setShowWeight(!showWeight)} 
                          className={`px-3 py-1.5 text-xs font-black rounded-xl border transition-all ${showWeight ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                        >
                          {showWeight ? '隐藏重量' : '估算总重量'}
                        </button>
                        <button onClick={copyQuotation} className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-black rounded-xl hover:bg-slate-200 transition-all">复制报价</button>
                        <button onClick={exportCSV} className="px-3 py-1.5 bg-slate-900 text-white text-xs font-black rounded-xl hover:bg-black transition-all">导出 CSV</button>
                      </div>
                    )}
                  </div>

                  {results.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-40 opacity-15">
                      <svg className="w-20 h-20 mb-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                      <p className="font-black text-xs uppercase tracking-widest text-slate-500">请在左侧录入框料数据，开始智能合并报价算料</p>
                    </div>
                  ) : (
                    <div className="space-y-16">
                      {results.map((group, groupIdx) => (
                        <div key={groupIdx} className="relative">
                          
                          {/* 组头部信息 */}
                          <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-4">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="bg-indigo-100 text-indigo-700 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest">批次 #{groupIdx+1}</span>
                                <span className="text-slate-300">/</span>
                                <span className="font-black text-md text-slate-900">{group.model} · {group.color}</span>
                              </div>
                              <p className="text-[10px] font-bold text-slate-400">
                                包含 {group.totalQuantity} 个成品 ｜ 耗用 {group.totalBars} 支 3.15m 整料 ｜ 
                                {showCosts && group.totalCost ? (
                                  <span className="text-emerald-600 font-extrabold ml-1">
                                    底价成本: ¥{group.totalCost} (毛利: ¥{group.profit}, {group.profitMargin}%)
                                  </span>
                                ) : (
                                  <span className="text-slate-400 ml-1">单件摊耗: {group.avgMetersPerFrame.toFixed(2)}米/框</span>
                                )}
                              </p>
                            </div>
                            
                            <div className="text-right">
                              <p className="text-[9px] font-black text-slate-400 uppercase mb-0.5">批次结算总价</p>
                              <p className="text-2xl font-black text-slate-900 tracking-tighter">¥ {group.totalPrice.toLocaleString()}</p>
                            </div>
                          </div>

                          {/* 组算料与报价明细表格 */}
                          <div className="overflow-hidden rounded-2xl border border-slate-100 mb-6">
                            <table className="w-full text-left text-[11px]">
                              <thead className="bg-slate-50 border-b border-slate-100">
                                <tr>
                                  <th className="px-5 py-3 font-black text-slate-400 uppercase tracking-widest">规格尺寸详情</th>
                                  <th className="px-5 py-3 font-black text-slate-400 uppercase tracking-widest text-center">成品数量</th>
                                  <th className="px-5 py-3 font-black text-slate-400 uppercase tracking-widest">
                                    {priceConfig.mode === PricingMode.BATCH ? '平摊单价' : '报价单价'}
                                  </th>
                                  <th className="px-5 py-3 font-black text-slate-400 uppercase tracking-widest text-right">报价小计</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {group.lineItems.map(line => (
                                  <tr key={line.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-5 py-3 font-bold text-slate-700">{line.size}</td>
                                    <td className="px-5 py-3 text-center font-black text-indigo-600">{line.quantity}</td>
                                    <td className="px-5 py-3 font-bold">¥ {line.unitPrice}</td>
                                    <td className="px-5 py-3 text-right font-black text-slate-900">¥ {line.totalPrice.toLocaleString()}</td>
                                  </tr>
                                ))}
                              </tbody>
                              {showWeight && group.totalWeight && (
                                <tfoot className="bg-indigo-50/30">
                                  <tr>
                                    <td colSpan={4} className="px-5 py-2.5">
                                      <div className="flex gap-6 text-[10px] font-bold text-indigo-700 uppercase">
                                        <span>材料毛重: {group.materialWeight}kg</span>
                                        <span>配件总重: {group.accessoryWeight}kg</span>
                                        <span className="font-black underline underline-offset-4">批次总重: {group.totalWeight}kg</span>
                                      </div>
                                    </td>
                                  </tr>
                                </tfoot>
                              )}
                            </table>
                          </div>

                          {/* 裁切套料方案可视化 */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {getGroupedUniquePlans(group.plans).map((unique, uIdx) => (
                              <BarVisualizer key={uIdx} plan={unique.plan} count={unique.count} index={groupIdx + uIdx} />
                            ))}
                          </div>
                        </div>
                      ))}

                      {/* 底部最终大结算 */}
                      <div className="mt-20 bg-slate-900 rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full -mr-40 -mt-40 blur-3xl"></div>
                        <div className="flex flex-col md:flex-row justify-between items-end gap-8 relative z-10">
                          <div className="space-y-1.5">
                            <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em]">FINAL QUOTATION</h4>
                            <p className="text-2xl font-black tracking-tight text-white">全单结算最终统计</p>
                            <p className="text-[10px] text-slate-400 font-bold">
                              模式：{priceConfig.mode} ｜ 包含成品框：{results.reduce((acc, g) => acc + g.totalQuantity, 0)} 个
                            </p>
                          </div>
                          
                          <div className="text-right">
                            <p className="text-[9px] font-black text-slate-400 uppercase mb-1">应收合同款</p>
                            <p className="text-5xl font-black tracking-tighter text-indigo-400">
                              ¥ {results.reduce((acc, g) => acc + g.totalPrice, 0).toLocaleString()}
                            </p>
                            {showWeight && (
                              <p className="text-[10px] font-black text-slate-400 mt-1 uppercase tracking-widest">
                                预估成品总重: {results.reduce((acc, g) => acc + (g.totalWeight || 0), 0).toFixed(2)} kg
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </section>
              </div>
            </main>
          </>
        )}

        {/* ==================== 选项卡：材料成本资料库 ==================== */}
        {activeTab === 'cost' && (
          <>
            <header className="bg-white border-b border-slate-200 px-8 py-5 sticky top-0 z-10 flex items-center justify-between shadow-sm">
              <div className="space-y-1">
                <h2 className="text-lg font-black tracking-tight text-slate-900">材料成本底价资料库</h2>
                <p className="text-xs text-slate-400">维护每款型材及颜色的底价信息，以实现精准的利润率核算</p>
              </div>
              
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleCostImportClick}
                  className="px-4 py-2 bg-indigo-50 text-indigo-600 border border-indigo-200 text-xs font-black rounded-xl hover:bg-indigo-100 transition-all flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  上传底价资料导入
                </button>
                <input 
                  type="file" 
                  ref={costFileInputRef} 
                  onChange={handleCostFileUpload} 
                  accept=".csv, .txt, .png, .jpg, .jpeg" 
                  hidden 
                />
              </div>
            </header>

            <main className="px-8 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-7xl w-full mx-auto">
              
              {/* 左侧：新增或编辑底价表单 */}
              <div className="lg:col-span-4 space-y-6">
                <section className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
                  <h3 className="text-xs font-black text-slate-950 uppercase tracking-widest mb-4">
                    {editingCostId ? '✏️ 编辑材料底价' : '➕ 新增型材底价'}
                  </h3>

                  <form onSubmit={handleSaveCost} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase ml-1">型材型号 *</label>
                      <input 
                        type="text" 
                        required
                        value={costForm.model}
                        onChange={(e) => setCostForm({...costForm, model: e.target.value})}
                        placeholder="如: D1822, Y3011"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase ml-1">型材颜色 *</label>
                      <input 
                        type="text" 
                        required
                        value={costForm.color}
                        onChange={(e) => setCostForm({...costForm, color: e.target.value})}
                        placeholder="如: 黑色, 哑金, 灰色"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase ml-1">材料底价成本 (元/米) *</label>
                      <input 
                        type="number" 
                        required
                        step="0.01"
                        value={costForm.materialCost}
                        onChange={(e) => setCostForm({...costForm, materialCost: Number(e.target.value)})}
                        placeholder="25"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1">配件成本 (元/套)</label>
                        <input 
                          type="number" 
                          step="0.01"
                          value={costForm.accessoryCost}
                          onChange={(e) => setCostForm({...costForm, accessoryCost: Number(e.target.value)})}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1">切工成本 (元/个)</label>
                        <input 
                          type="number" 
                          step="0.01"
                          value={costForm.cuttingCost}
                          onChange={(e) => setCostForm({...costForm, cuttingCost: Number(e.target.value)})}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase ml-1">备注说明</label>
                      <input 
                        type="text" 
                        value={costForm.notes}
                        onChange={(e) => setCostForm({...costForm, notes: e.target.value})}
                        placeholder="材质厚度、主配货厂家等"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none"
                      />
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button 
                        type="submit" 
                        className="flex-1 bg-indigo-600 text-white text-xs font-black py-2.5 rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/10"
                      >
                        {editingCostId ? '保存修改' : '确认添加'}
                      </button>
                      {editingCostId && (
                        <button 
                          type="button" 
                          onClick={() => {
                            setEditingCostId(null);
                            setCostForm({ model: '', color: '', materialCost: 25, accessoryCost: 8, cuttingCost: 5, notes: '' });
                          }}
                          className="px-4 bg-slate-100 text-slate-600 text-xs font-black rounded-xl hover:bg-slate-200 transition-all"
                        >
                          取消
                        </button>
                      )}
                    </div>
                  </form>
                </section>

                {/* 智能导入指引卡片 */}
                <div className="bg-indigo-50/50 border border-indigo-100 p-5 rounded-[2rem] text-xs space-y-2 text-indigo-950">
                  <p className="font-black flex items-center gap-1.5"><span className="text-base">💡</span>底价智能导入小助手</p>
                  <p className="leading-relaxed text-indigo-800">
                    在顶部点击<b>“上传底价资料导入”</b>，可以直接拖入您的报价表单图片、微信截图、甚至TXT底价文字段落。
                  </p>
                  <p className="leading-relaxed text-indigo-800">
                    若已配置 <b>DeepSeek / Gemini API Key</b>，AI 将会自动识别复杂的非格式化表格，一键录入底价库，免去手工挨个输入的痛苦！
                  </p>
                </div>
              </div>

              {/* 右侧：底价库列表与检索 */}
              <div className="lg:col-span-8 space-y-6">
                <section className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-200">
                  <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-6">
                    <div className="relative flex-1">
                      <input 
                        type="text" 
                        value={costSearch}
                        onChange={(e) => setCostSearch(e.target.value)}
                        placeholder="检索型号、颜色、说明备注..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none placeholder:text-slate-300"
                      />
                      <svg className="w-4 h-4 text-slate-300 absolute left-3.5 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>
                    
                    {costDatabase.length > 0 && (
                      <button 
                        onClick={() => {
                          if (confirm('确认清空底价数据库吗？建议提前备份。')) {
                            setCostDatabase([]);
                          }
                        }}
                        className="px-4 py-2 text-xs font-bold text-red-500 hover:bg-red-50 border border-red-100 rounded-xl transition-all"
                      >
                        清空底价库
                      </button>
                    )}
                  </div>

                  <div className="overflow-x-auto rounded-2xl border border-slate-100">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>
                          <th className="px-5 py-3.5 font-black text-slate-400 uppercase tracking-widest">型号</th>
                          <th className="px-5 py-3.5 font-black text-slate-400 uppercase tracking-widest">颜色</th>
                          <th className="px-5 py-3.5 font-black text-slate-400 uppercase tracking-widest">材料成本 (米)</th>
                          <th className="px-5 py-3.5 font-black text-slate-400 uppercase tracking-widest">配件 (套)</th>
                          <th className="px-5 py-3.5 font-black text-slate-400 uppercase tracking-widest">切工 (个)</th>
                          <th className="px-5 py-3.5 font-black text-slate-400 uppercase tracking-widest">备注</th>
                          <th className="px-5 py-3.5 font-black text-slate-400 text-right uppercase tracking-widest">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                        {filteredCostDb.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="text-center py-12 text-slate-300 font-black tracking-widest uppercase">无对应底价数据</td>
                          </tr>
                        ) : (
                          filteredCostDb.map(record => (
                            <tr key={record.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-5 py-3.5 font-black text-slate-900">{record.model}</td>
                              <td className="px-5 py-3.5 text-slate-600">{record.color}</td>
                              <td className="px-5 py-3.5 text-indigo-600">¥ {record.materialCost}</td>
                              <td className="px-5 py-3.5 text-slate-500">¥ {record.accessoryCost}</td>
                              <td className="px-5 py-3.5 text-slate-500">¥ {record.cuttingCost}</td>
                              <td className="px-5 py-3.5 text-slate-400 font-medium max-w-[150px] truncate" title={record.notes}>{record.notes || '-'}</td>
                              <td className="px-5 py-3.5 text-right space-x-1.5 whitespace-nowrap">
                                <button 
                                  onClick={() => editCostRecord(record)} 
                                  className="text-indigo-600 hover:text-indigo-800 hover:underline text-xs"
                                >
                                  编辑
                                </button>
                                <span className="text-slate-200">|</span>
                                <button 
                                  onClick={() => deleteCostRecord(record.id)} 
                                  className="text-red-500 hover:text-red-700 hover:underline text-xs"
                                >
                                  删除
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            </main>
          </>
        )}

        {/* ==================== 选项卡：历史报价记录 (记忆系统) ==================== */}
        {activeTab === 'history' && (
          <>
            <header className="bg-white border-b border-slate-200 px-8 py-5 sticky top-0 z-10 flex items-center justify-between shadow-sm">
              <div className="space-y-1">
                <h2 className="text-lg font-black tracking-tight text-slate-900">历史报价单记录 (全记忆)</h2>
                <p className="text-xs text-slate-400">系统自动本地持久化存储每一笔报价，支持一键载入工作区二次修改</p>
              </div>
            </header>

            <main className="px-8 py-8 max-w-7xl w-full mx-auto space-y-6">
              <section className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-200">
                <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-6">
                  <div className="relative flex-1">
                    <input 
                      type="text" 
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      placeholder="检索历史订单，按客户姓名或项目名称搜索..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none placeholder:text-slate-300"
                    />
                    <svg className="w-4 h-4 text-slate-300 absolute left-3.5 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  </div>
                  
                  {historyRecords.length > 0 && (
                    <button 
                      onClick={() => {
                        if (confirm('警告：确认要清空全部历史报价数据库吗？此操作将丢失全部已存单据！')) {
                          setHistoryRecords([]);
                        }
                      }}
                      className="px-4 py-2 text-xs font-bold text-red-500 hover:bg-red-50 border border-red-100 rounded-xl transition-all"
                    >
                      清空全部历史
                    </button>
                  )}
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-100">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="px-5 py-4 font-black text-slate-400 uppercase tracking-widest">保存日期</th>
                        <th className="px-5 py-4 font-black text-slate-400 uppercase tracking-widest">客户姓名</th>
                        <th className="px-5 py-4 font-black text-slate-400 uppercase tracking-widest">订单/项目名称</th>
                        <th className="px-5 py-4 font-black text-slate-400 uppercase tracking-widest text-center">成品件数</th>
                        <th className="px-5 py-4 font-black text-slate-400 uppercase tracking-widest">报价总金额</th>
                        {showCosts && <th className="px-5 py-4 font-black text-slate-400 uppercase tracking-widest">预估毛利率</th>}
                        <th className="px-5 py-4 font-black text-slate-400 text-right uppercase tracking-widest">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                      {filteredHistory.length === 0 ? (
                        <tr>
                          <td colSpan={showCosts ? 7 : 6} className="text-center py-16 text-slate-300 font-black tracking-widest uppercase">无历史报价记录</td>
                        </tr>
                      ) : (
                        filteredHistory.map(record => (
                          <tr key={record.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-5 py-4 text-slate-400 font-medium">
                              {new Date(record.createdAt).toLocaleString('zh-CN', { hour12: false })}
                            </td>
                            <td className="px-5 py-4 font-black text-slate-900">{record.clientName}</td>
                            <td className="px-5 py-4 text-slate-600">{record.orderName}</td>
                            <td className="px-5 py-4 text-center text-slate-500">{record.items.reduce((acc, i) => acc + i.quantity, 0)} 个</td>
                            <td className="px-5 py-4 text-indigo-600 font-black">¥ {record.totalQuotePrice.toLocaleString()}</td>
                            {showCosts && (
                              <td className="px-5 py-4">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                                  record.profitMargin >= 40 ? 'bg-emerald-50 text-emerald-600' :
                                  record.profitMargin >= 25 ? 'bg-blue-50 text-blue-600' :
                                  record.profitMargin >= 0 ? 'bg-amber-50 text-amber-600' :
                                  'bg-rose-50 text-rose-600'
                                }`}>
                                  {record.profitMargin}%
                                </span>
                              </td>
                            )}
                            <td className="px-5 py-4 text-right space-x-2 whitespace-nowrap">
                              <button 
                                onClick={() => loadHistoryRecord(record)} 
                                className="px-2.5 py-1 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg text-xs font-black transition-all"
                              >
                                载入此单
                              </button>
                              <button 
                                onClick={() => deleteHistoryRecord(record.id)} 
                                className="px-2.5 py-1 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg text-xs font-black transition-all"
                              >
                                删除
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </main>
          </>
        )}

        {/* ==================== 选项卡：系统与 AI 配置 ==================== */}
        {activeTab === 'settings' && (
          <>
            <header className="bg-white border-b border-slate-200 px-8 py-5 sticky top-0 z-10 flex items-center justify-between shadow-sm">
              <div className="space-y-1">
                <h2 className="text-lg font-black tracking-tight text-slate-900">系统与 AI 接口配置</h2>
                <p className="text-xs text-slate-400">配置 DeepSeek、Google Gemini、OpenAI 密钥和备份，享受无限智能工作流</p>
              </div>
            </header>

            <main className="px-8 py-8 max-w-4xl w-full mx-auto space-y-8">
              
              {/* API 核心配置 */}
              <section className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-200">
                <h3 className="text-xs font-black text-slate-950 uppercase tracking-widest mb-6">🔗 LLM API 接口对接</h3>
                
                <div className="space-y-6">
                  {/* 服务提供商选择 */}
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase">AI 接口供应商</label>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { id: 'deepseek', label: 'DeepSeek (深度求索)', defaultUrl: 'https://api.deepseek.com', defaultModel: 'deepseek-chat' },
                        { id: 'gemini', label: 'Google Gemini', defaultUrl: '', defaultModel: 'gemini-2.5-flash' },
                        { id: 'openai', label: 'OpenAI 兼容端', defaultUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini' }
                      ].map(provider => (
                        <button
                          key={provider.id}
                          type="button"
                          onClick={() => setAiSettings({
                            provider: provider.id as any,
                            apiKey: aiSettings.provider === provider.id ? aiSettings.apiKey : '',
                            baseUrl: provider.defaultUrl,
                            model: provider.defaultModel
                          })}
                          className={`p-4 rounded-2xl border-2 text-left font-bold transition-all ${aiSettings.provider === provider.id ? 'border-indigo-600 bg-indigo-50/20 text-indigo-950' : 'border-slate-100 bg-slate-50 hover:bg-slate-100 text-slate-500'}`}
                        >
                          <p className="text-xs">{provider.label}</p>
                          <span className="text-[9px] text-slate-400 font-medium block mt-1">{provider.defaultModel}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* API Key */}
                  <div className="space-y-1">
                    <label className="text-xs font-black text-slate-500 uppercase ml-1">API Key (密钥) *</label>
                    <input 
                      type="password" 
                      value={aiSettings.apiKey}
                      onChange={(e) => setAiSettings({...aiSettings, apiKey: e.target.value})}
                      placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-mono font-bold focus:ring-2 ring-indigo-500/20 outline-none"
                    />
                  </div>

                  {/* 自定义端点 URL 和 模型名称 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-black text-slate-500 uppercase ml-1">自定义端点 (Base URL)</label>
                      <input 
                        type="text" 
                        value={aiSettings.baseUrl}
                        disabled={aiSettings.provider === 'gemini'}
                        onChange={(e) => setAiSettings({...aiSettings, baseUrl: e.target.value})}
                        placeholder={aiSettings.provider === 'gemini' ? '无需配置' : 'https://api.deepseek.com'}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none disabled:opacity-50"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-black text-slate-500 uppercase ml-1">模型名称 (Model ID)</label>
                      <input 
                        type="text" 
                        value={aiSettings.model}
                        onChange={(e) => setAiSettings({...aiSettings, model: e.target.value})}
                        placeholder="deepseek-chat"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none"
                      />
                    </div>
                  </div>

                  {/* 测试连接按钮与反馈 */}
                  <div className="pt-2 flex items-center gap-4">
                    <button
                      type="button"
                      disabled={isTestingAi}
                      onClick={testAiConnection}
                      className="px-5 py-2.5 bg-slate-900 text-white hover:bg-black text-xs font-black rounded-xl transition-all disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {isTestingAi && (
                        <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      )}
                      测试接口连接
                    </button>

                    {aiTestResult && (
                      <span className={`text-[11px] font-bold px-3 py-1.5 rounded-xl border ${aiTestResult.success ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-500 border-red-100'}`}>
                        {aiTestResult.msg}
                      </span>
                    )}
                  </div>
                </div>
              </section>

              {/* 数据备份与完全恢复 */}
              <section className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-200">
                <h3 className="text-xs font-black text-slate-950 uppercase tracking-widest mb-4">💾 系统防丢备份与迁移</h3>
                <p className="text-xs text-slate-400 mb-6">当换设备、重新装系统或发布部署时，可以完整导出底价资料库、历史单据、AI秘钥配置，并在任何新环境中一键无损导入恢复。</p>
                
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={exportAllBackup}
                    className="px-5 py-3 bg-indigo-50 text-indigo-600 border border-indigo-200 text-xs font-black rounded-xl hover:bg-indigo-100 transition-all flex items-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4-4m0 0L8 8m4-4v12" /></svg>
                    一键备份：导出完整数据 (JSON)
                  </button>

                  <button
                    onClick={() => document.getElementById('restore_file_input')?.click()}
                    className="px-5 py-3 bg-slate-50 text-slate-700 border border-slate-200 text-xs font-black rounded-xl hover:bg-slate-100 transition-all flex items-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M8 8l4 4m0 0l4-4m-4 4V4" /></svg>
                    恢复备份：导入数据文件
                  </button>
                  <input 
                    type="file" 
                    id="restore_file_input" 
                    onChange={importBackupFile} 
                    accept=".json" 
                    hidden 
                  />
                </div>
              </section>

              {/* 账户安全与多用户管理 */}
              <section className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-200">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-6">
                  <div>
                    <h3 className="text-xs font-black text-slate-950 uppercase tracking-widest">👤 账号安全与多用户管理</h3>
                    <p className="text-xs text-slate-400 mt-1">每个账户的数据独立隔离，提供细粒度的权限控制</p>
                  </div>
                  <span className="text-[10px] bg-slate-100 text-slate-600 px-3 py-1 rounded-full font-black self-start md:self-auto">
                    当前账号: <span className="text-indigo-600">{currentUser?.displayName}</span> ({currentUser?.role === 'admin' ? '超级管理员' : currentUser?.role === 'sales' ? '销售员' : '车间加工端'})
                  </span>
                </div>

                <div className="space-y-6">
                  {/* 修改个人信息 */}
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const dName = (e.currentTarget.elements.namedItem('dName') as HTMLInputElement).value;
                    const pWord = (e.currentTarget.elements.namedItem('pWord') as HTMLInputElement).value;
                    if (!dName.trim() || !pWord.trim()) {
                      alert('姓名和密码不能为空！');
                      return;
                    }
                    setUsers(prev => prev.map(u => u.username === currentUser?.username ? { ...u, displayName: dName.trim(), password: pWord.trim() } : u));
                    setCurrentUser(prev => prev ? { ...prev, displayName: dName.trim(), password: pWord.trim() } : null);
                    alert('个人账户信息更新成功！');
                  }} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end bg-slate-50 p-5 rounded-2xl border border-slate-100">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase ml-1">修改姓名/称呼</label>
                      <input 
                        type="text" 
                        name="dName"
                        defaultValue={currentUser?.displayName}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none" 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase ml-1">修改登录密码</label>
                      <input 
                        type="password" 
                        name="pWord"
                        defaultValue={currentUser?.password}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-mono font-bold focus:ring-2 ring-indigo-500/20 outline-none" 
                      />
                    </div>
                    <button 
                      type="submit"
                      className="bg-indigo-600 text-white py-2 px-4 rounded-xl font-black text-xs hover:bg-indigo-700 transition-all shadow-sm"
                    >
                      保存账号信息
                    </button>
                  </form>

                  {/* 管理员专属：多账户分配与列表 */}
                  {currentUser?.role === 'admin' && (
                    <div className="border-t border-slate-100 pt-6 space-y-4">
                      <div>
                        <p className="text-xs font-black text-slate-800">分配/创建下属账号</p>
                        <p className="text-[10px] text-slate-400">作为主管理员，您可以分配、注销下属员工账号，且下属数据互不干扰</p>
                      </div>

                      {/* 快速新建账号 */}
                      <form onSubmit={(e) => {
                        e.preventDefault();
                        const uName = (e.currentTarget.elements.namedItem('uName') as HTMLInputElement).value.trim().toLowerCase();
                        const uDName = (e.currentTarget.elements.namedItem('uDName') as HTMLInputElement).value.trim();
                        const uPass = (e.currentTarget.elements.namedItem('uPass') as HTMLInputElement).value.trim();
                        const uRole = (e.currentTarget.elements.namedItem('uRole') as HTMLSelectElement).value as 'sales' | 'operator' | 'admin';

                        if (!uName || !uDName || !uPass) {
                          alert('请填写完整的账号分配信息！');
                          return;
                        }

                        if (users.some(u => u.username === uName)) {
                          alert('该用户名已存在，无法重复添加！');
                          return;
                        }

                        const newUser: UserAccount = {
                          username: uName,
                          displayName: uDName,
                          password: uPass,
                          role: uRole,
                          avatarColor: uRole === 'admin' ? 'indigo' : uRole === 'sales' ? 'emerald' : 'amber',
                          createdAt: new Date().toISOString()
                        };

                        setUsers(prev => [...prev, newUser]);
                        e.currentTarget.reset();
                        alert(`成功创建下属账号：【${newUser.displayName}】(${uRole === 'sales' ? '销售员' : uRole === 'admin' ? '管理员' : '车间人员'})`);
                      }} className="grid grid-cols-1 md:grid-cols-5 gap-3 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400">用户名 (英/数)</label>
                          <input type="text" name="uName" placeholder="如 sales_lee" className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400">真实姓名</label>
                          <input type="text" name="uDName" placeholder="如 李小龙" className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400">初始密码</label>
                          <input type="text" name="uPass" placeholder="如 123456" className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-mono font-bold focus:ring-2 ring-indigo-500/20 outline-none" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400">岗位角色权限</label>
                          <select name="uRole" className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold focus:ring-2 ring-indigo-500/20 outline-none">
                            <option value="sales">销售业务员 (看价格与利润)</option>
                            <option value="operator">车间加工端 (隐蔽底价与利润)</option>
                            <option value="admin">超级管理员 (全部控制权限)</option>
                          </select>
                        </div>
                        <button type="submit" className="bg-slate-900 text-white hover:bg-black rounded-xl text-xs font-black py-2.5 shadow-md">
                          确定分配创建
                        </button>
                      </form>

                      {/* 账号清单列表 */}
                      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 border-b border-slate-100">
                            <tr>
                              <th className="px-5 py-3 font-black text-slate-400">成员姓名</th>
                              <th className="px-5 py-3 font-black text-slate-400">用户名</th>
                              <th className="px-5 py-3 font-black text-slate-400">岗位权限</th>
                              <th className="px-5 py-3 font-black text-slate-400 font-mono">密码</th>
                              <th className="px-5 py-3 font-black text-slate-400 text-right">操作</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                            {users.map(u => (
                              <tr key={u.username} className="hover:bg-slate-50/50 transition-all">
                                <td className="px-5 py-3 flex items-center gap-2">
                                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-white uppercase font-black ${u.avatarColor === 'indigo' ? 'bg-indigo-600' : u.avatarColor === 'emerald' ? 'bg-emerald-600' : 'bg-amber-500'}`}>
                                    {u.displayName.charAt(0)}
                                  </div>
                                  <span className="text-slate-900">{u.displayName}</span>
                                </td>
                                <td className="px-5 py-3 text-slate-500">{u.username}</td>
                                <td className="px-5 py-3">
                                  <span className={`text-[9px] px-2 py-0.5 rounded-full font-black ${
                                    u.role === 'admin' ? 'bg-indigo-50 text-indigo-600' :
                                    u.role === 'sales' ? 'bg-emerald-50 text-emerald-600' :
                                    'bg-amber-50 text-amber-600'
                                  }`}>
                                    {u.role === 'admin' ? '超级管理员' : u.role === 'sales' ? '销售员' : '车间加工端'}
                                  </span>
                                </td>
                                <td className="px-5 py-3 font-mono text-slate-400">{u.password || '******'}</td>
                                <td className="px-5 py-3 text-right">
                                  {u.username === 'admin' ? (
                                    <span className="text-[10px] text-slate-300 font-medium italic">主账号保护</span>
                                  ) : u.username === (currentUser ? currentUser.username : '') ? (
                                    <span className="text-[10px] text-slate-300 font-medium italic">当前登录中</span>
                                  ) : (
                                    <button 
                                      onClick={() => {
                                        if (confirm(`确认要收回并注销员工账号【${u.displayName}】吗？对应的数据也将清除。`)) {
                                          setUsers(prev => prev.filter(item => item.username !== u.username));
                                          localStorage.removeItem(`aluminum_cost_db_${u.username}`);
                                          localStorage.removeItem(`aluminum_history_${u.username}`);
                                          localStorage.removeItem(`aluminum_items_${u.username}`);
                                        }
                                      }}
                                      className="text-rose-600 hover:text-rose-800 hover:underline text-xs"
                                    >
                                      注销账号
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </main>
          </>
        )}
      </div>
    </div>
  );
};

export default App;
