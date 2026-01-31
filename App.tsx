
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FrameItem, GroupResult, SizeType, PricingMode, PriceConfig, QuotationLineItem } from './types';
import { calculateGroupedResults } from './utils/calculation';
import { parseOrderContent } from './services/geminiService';
import BarVisualizer from './components/BarVisualizer';

const App: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [items, setItems] = useState<FrameItem[]>([]);
  const [results, setResults] = useState<GroupResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 报价配置状态
  const [priceConfig, setPriceConfig] = useState<PriceConfig>({
    materialPrice: 45,
    accessoryPrice: 15,
    cuttingFee: 10,
    taxRate: 1.0,
    mode: PricingMode.BATCH
  });

  const [customTaxRate, setCustomTaxRate] = useState<string>("1.0");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCalculate = useCallback(() => {
    if (items.length === 0) {
      setResults([]);
      return;
    }
    const res = calculateGroupedResults(items, priceConfig);
    setResults(res);
  }, [items, priceConfig]);

  useEffect(() => {
    handleCalculate();
  }, [handleCalculate]);

  const processContent = async (base64Img?: string) => {
    if (!inputText.trim() && !base64Img) return;
    setIsLoading(true);
    setError(null);
    try {
      const parsedItems = await parseOrderContent(inputText, base64Img);
      setItems(prev => [...prev, ...parsedItems]);
      setInputText('');
    } catch (err) {
      setError('数据识别失败，请重试或手动输入。');
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        processContent(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const updateTaxRate = (val: string) => {
    setCustomTaxRate(val);
    const num = parseFloat(val);
    if (!isNaN(num)) {
      setPriceConfig(prev => ({ ...prev, taxRate: num }));
    }
  };

  const removeItem = (id: string) => setItems(items.filter(i => i.id !== id));
  const clearAll = () => { setItems([]); setResults([]); setError(null); };

  // 复制报价到剪贴板
  const copyQuotation = async () => {
    let text = `铝合金切框报价单\n报价模式: ${priceConfig.mode}\n税率: ${priceConfig.taxRate}\n\n`;
    results.forEach((group, gIdx) => {
      text += `--- 项目 ${gIdx + 1}: ${group.model} (${group.color}) ---\n`;
      text += `型号\t尺寸\t单价\t数量\t总价\n`;
      group.lineItems.forEach(line => {
        text += `${line.model}\t${line.size}\t¥${line.unitPrice}\t${line.quantity}\t¥${line.totalPrice}\n`;
      });
      text += `小计: ¥${group.totalPrice}\n\n`;
    });
    text += `总金额结算: ¥${results.reduce((acc, g) => acc + g.totalPrice, 0).toLocaleString()}`;
    
    try {
      await navigator.clipboard.writeText(text);
      alert('报价已成功复制到剪贴板！');
    } catch (err) {
      alert('复制失败，请重试。');
    }
  };

  // 导出 CSV
  const exportCSV = () => {
    let csv = '\uFEFF型号,尺寸,单价,数量,总价\n';
    results.forEach(group => {
      group.lineItems.forEach(line => {
        csv += `"${line.model}","${line.size}",${line.unitPrice},${line.quantity},${line.totalPrice}\n`;
      });
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `报价清单_${new Date().toLocaleDateString()}.csv`;
    link.click();
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24 text-slate-900 selection:bg-indigo-100 font-sans">
      {/* Header */}
      <header className="bg-white/95 backdrop-blur-md border-b sticky top-0 z-40 px-6 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-600 p-2.5 rounded-2xl shadow-indigo-100 shadow-xl">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight leading-none text-slate-900">铝合金切框报价算料助手</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-1.5 tracking-[0.2em]">PROFESSIONAL QUOTING SYSTEM</p>
            </div>
          </div>
          <button onClick={clearAll} className="px-4 py-2 text-xs font-black text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all uppercase">重置</button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Col */}
        <div className="lg:col-span-4 space-y-6">
          {/* Price Config */}
          <section className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm border-t-4 border-t-indigo-500">
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">报价参数</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 flex p-1.5 bg-slate-100 rounded-2xl mb-2">
                <button onClick={() => setPriceConfig({...priceConfig, mode: PricingMode.BATCH})} className={`flex-1 py-2 text-xs font-black rounded-xl transition-all ${priceConfig.mode === PricingMode.BATCH ? 'bg-white shadow' : 'text-slate-400'}`}>批量</button>
                <button onClick={() => setPriceConfig({...priceConfig, mode: PricingMode.RETAIL})} className={`flex-1 py-2 text-xs font-black rounded-xl transition-all ${priceConfig.mode === PricingMode.RETAIL ? 'bg-white shadow' : 'text-slate-400'}`}>零售</button>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase ml-1">材料单价(米)</label>
                <input type="number" value={priceConfig.materialPrice} onChange={(e) => setPriceConfig({...priceConfig, materialPrice: Number(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 ring-indigo-500/20 outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase ml-1">配件(个)</label>
                <input type="number" value={priceConfig.accessoryPrice} onChange={(e) => setPriceConfig({...priceConfig, accessoryPrice: Number(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 ring-indigo-500/20 outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase ml-1">切工(个)</label>
                <input type="number" value={priceConfig.cuttingFee} onChange={(e) => setPriceConfig({...priceConfig, cuttingFee: Number(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 ring-indigo-500/20 outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase ml-1">税率</label>
                <input type="number" step="0.01" value={customTaxRate} onChange={(e) => updateTaxRate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 ring-indigo-500/20 outline-none" />
              </div>
            </div>
          </section>

          {/* Input Area */}
          <section className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">输入订单</h2>
            <textarea value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="如: D1822 黑色 80*60 10个..." className="w-full h-32 p-4 text-sm bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 ring-indigo-500 outline-none resize-none mb-4" />
            <div className="flex gap-2">
              <button onClick={() => processContent()} disabled={isLoading || !inputText.trim()} className="flex-1 bg-slate-900 text-white py-3 rounded-xl font-black text-sm hover:bg-black transition-all disabled:opacity-30">解析</button>
              <button onClick={() => fileInputRef.current?.click()} className="px-4 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100 hover:bg-indigo-100 transition-all"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg></button>
              <input type="file" ref={fileInputRef} onChange={handleImageUpload} hidden accept="image/*" />
            </div>
          </section>

          {/* Item Preview */}
          <section className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm max-h-[300px] overflow-y-auto custom-scrollbar">
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">明细确认 ({items.length})</h2>
            <div className="space-y-2">
              {items.map(item => (
                <div key={item.id} className="group flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-200 transition-all">
                  <div>
                    <p className="text-[10px] font-black uppercase text-slate-400 mb-0.5">{item.model} · {item.color}</p>
                    <p className="text-xs font-black">{item.width}x{item.height}cm · <span className="text-indigo-600">x{item.quantity}</span></p>
                  </div>
                  <button onClick={() => removeItem(item.id)} className="p-1.5 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right Col */}
        <div className="lg:col-span-8 space-y-6">
          <section className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-200 min-h-[600px] relative">
             {/* Toolbar */}
             <div className="flex justify-between items-center mb-8">
               <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">报价结算明细单</h2>
               {results.length > 0 && (
                 <div className="flex gap-2">
                   <button onClick={copyQuotation} className="px-4 py-2 bg-slate-50 border border-slate-200 text-slate-600 text-xs font-black rounded-xl hover:bg-slate-100 transition-all flex items-center gap-2">
                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                     复制报价
                   </button>
                   <button onClick={exportCSV} className="px-4 py-2 bg-indigo-600 text-white text-xs font-black rounded-xl hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-100">
                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                     导出CSV
                   </button>
                 </div>
               )}
             </div>

             {results.length === 0 ? (
               <div className="flex flex-col items-center justify-center py-40 opacity-20">
                 <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4"><svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></div>
                 <p className="font-black text-xs uppercase tracking-widest">请录入数据开始计算</p>
               </div>
             ) : (
               <div className="space-y-12">
                 {results.map((group, gIdx) => (
                   <div key={gIdx} className="border-b border-slate-100 pb-12 last:border-0">
                      {/* Group Title */}
                      <div className="flex justify-between items-end mb-6">
                        <div>
                          <div className="flex gap-2 mb-1">
                            <span className="text-[9px] font-black bg-indigo-600 text-white px-2 py-0.5 rounded tracking-widest">{group.model}</span>
                            <span className="text-[9px] font-black bg-slate-200 text-slate-600 px-2 py-0.5 rounded tracking-widest uppercase">{group.color}</span>
                          </div>
                          <h3 className="text-lg font-black tracking-tight">{group.model} 系列报价</h3>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">小组总金额</p>
                          <p className="text-2xl font-black text-slate-900">¥ {group.totalPrice.toLocaleString()}</p>
                        </div>
                      </div>

                      {/* Detail Table */}
                      <div className="overflow-x-auto mb-6 bg-slate-50/50 rounded-3xl border border-slate-100">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-100">
                              <th className="px-6 py-4 font-black text-slate-400 uppercase tracking-widest text-[9px]">型号/尺寸</th>
                              <th className="px-6 py-4 font-black text-slate-400 uppercase tracking-widest text-[9px]">单价 (含税)</th>
                              <th className="px-6 py-4 font-black text-slate-400 uppercase tracking-widest text-[9px]">数量</th>
                              <th className="px-6 py-4 font-black text-slate-400 uppercase tracking-widest text-[9px] text-right">总价</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {group.lineItems.map(line => (
                              <tr key={line.id} className="hover:bg-indigo-50/30 transition-colors">
                                <td className="px-6 py-4">
                                  <p className="font-bold text-slate-900">{line.model}</p>
                                  <p className="text-[10px] text-slate-400 font-medium">{line.size}</p>
                                </td>
                                <td className="px-6 py-4 font-bold text-indigo-600">¥ {line.unitPrice}</td>
                                <td className="px-6 py-4 font-bold text-slate-600">{line.quantity} 个</td>
                                <td className="px-6 py-4 font-black text-slate-900 text-right">¥ {line.totalPrice.toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Visualizer Link/Indicator */}
                      <div className="space-y-3">
                         <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">生产切割参考图 (共 {group.totalBars} 支整料)</p>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {group.plans.slice(0, 4).map((plan, pIdx) => (
                              <BarVisualizer key={pIdx} plan={plan} count={1} index={pIdx} />
                            ))}
                            {group.plans.length > 4 && <div className="flex items-center justify-center p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-[10px] font-black text-slate-400 uppercase">+ {group.plans.length - 4} 种更多排料方案</div>}
                         </div>
                      </div>
                   </div>
                 ))}

                 {/* Final Summary Card */}
                 <div className="mt-20 bg-slate-900 rounded-[3.5rem] p-10 text-white shadow-2xl shadow-indigo-200">
                    <div className="flex justify-between items-end mb-10 border-b border-white/10 pb-10">
                       <div>
                         <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] mb-2">QUOTATION SUMMARY</h4>
                         <p className="text-3xl font-black tracking-tighter">最终全单报价汇总</p>
                       </div>
                       <div className="text-right">
                         <div className="flex items-baseline gap-2 justify-end">
                           <span className="text-xl font-bold text-indigo-400">¥</span>
                           <span className="text-6xl font-black tracking-tighter">
                             {results.reduce((acc, g) => acc + g.totalPrice, 0).toLocaleString()}
                           </span>
                         </div>
                         <p className="text-xs font-bold text-slate-500 mt-2">基于 {priceConfig.mode} · 税率 {priceConfig.taxRate}</p>
                       </div>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                       <div className="space-y-1">
                         <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">备料整料</p>
                         <p className="text-2xl font-black">{results.reduce((acc, g) => acc + g.totalBars, 0)} <span className="text-xs text-slate-500 font-bold uppercase">支</span></p>
                       </div>
                       <div className="space-y-1">
                         <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">成品数量</p>
                         <p className="text-2xl font-black">{results.reduce((acc, g) => acc + g.totalQuantity, 0)} <span className="text-xs text-slate-500 font-bold uppercase">个</span></p>
                       </div>
                       <div className="space-y-1">
                         <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">计费总长</p>
                         <p className="text-2xl font-black">{(results.reduce((acc, g) => acc + g.totalBars, 0) * 3.15).toFixed(2)} <span className="text-xs text-slate-500 font-bold uppercase">米</span></p>
                       </div>
                       <div className="space-y-1">
                         <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">算料模式</p>
                         <p className="text-xl font-black uppercase tracking-tighter">{priceConfig.mode.split('(')[0]}</p>
                       </div>
                    </div>
                 </div>
               </div>
             )}
             {isLoading && (
              <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center z-10">
                <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="font-black text-indigo-600 tracking-widest text-xs uppercase animate-pulse">正在生成报价单</p>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};

export default App;
