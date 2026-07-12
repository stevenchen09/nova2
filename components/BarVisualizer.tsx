
import React from 'react';
import { BarPlan } from '../types';

interface BarVisualizerProps {
  plan: BarPlan;
  count: number;
  index: number;
}

const BarVisualizer: React.FC<BarVisualizerProps> = ({ plan, count, index }) => {
  // 对段长度进行分组计数，生成算式数据
  const segmentStats = plan.segments.reduce((acc, seg) => {
    const len = seg.length.toFixed(3);
    if (!acc[len]) {
      acc[len] = { length: seg.length, count: 0 };
    }
    acc[len].count += 1;
    return acc;
  }, {} as Record<string, { length: number; count: number }>);

  const statsArray: Array<{ length: number; count: number }> = Object.values(segmentStats);

  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-indigo-200 transition-all">
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-slate-900 text-white text-[10px] font-black">
            {index + 1}
          </span>
          <div>
            <h4 className="text-[11px] font-black text-slate-900">方案摘要</h4>
            <p className="text-[9px] font-bold text-indigo-600 uppercase tracking-tight">
              适用：<span className="text-xs font-black underline decoration-1 underline-offset-2">{count}</span> 支整料
            </p>
          </div>
        </div>
        {plan.remaining > 0.01 && (
          <div className="text-right">
             <p className="text-[8px] font-black text-slate-400 uppercase">余料</p>
             <p className="text-[10px] font-black text-emerald-600">{plan.remaining.toFixed(3)}m</p>
          </div>
        )}
      </div>
      
      {/* 进度条图示 */}
      <div className="relative h-8 w-full bg-slate-100 rounded-lg overflow-hidden flex border border-slate-200 shadow-inner mb-3">
        {plan.segments.map((segment, i) => {
          const widthPercent = (segment.length / plan.totalUsableLength) * 100;
          return (
            <div
              key={i}
              className="h-full border-r border-white/20 flex flex-col items-center justify-center transition-all hover:brightness-110 group cursor-help relative"
              style={{ 
                width: `${widthPercent}%`, 
                backgroundColor: `hsl(${(i * 45 + 210) % 360}, 65%, 45%)` 
              }}
              title={segment.description}
            >
              <span className="text-[8px] text-white font-black leading-none">{segment.length}</span>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-30 bg-slate-900 text-white text-[9px] py-1 px-2 rounded shadow-2xl border border-white/10 whitespace-nowrap">
                {segment.description}
              </div>
            </div>
          );
        })}
        {plan.remaining > 0.01 && (
          <div 
            className="h-full bg-slate-200/50 flex items-center justify-center border-l border-slate-300 border-dashed" 
            style={{ width: `${(plan.remaining / plan.totalUsableLength) * 100}%` }}
          >
             <span className="text-[8px] text-slate-400 font-black uppercase">余</span>
          </div>
        )}
      </div>

      {/* 算式表述 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">切割:</span>
        {statsArray.map((stat, i) => (
          <div key={i} className="flex items-center bg-slate-50 border border-slate-200 rounded h-5 overflow-hidden">
            <span className="text-[8px] px-1.5 font-bold text-slate-600 font-mono">
              {stat.length.toFixed(2)}
            </span>
            <span className="text-[8px] px-1.5 bg-indigo-500 text-white font-black flex items-center h-full">
              ×{stat.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BarVisualizer;
