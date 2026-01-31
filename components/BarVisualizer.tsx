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

  const statsArray = Object.values(segmentStats);

  return (
    <div className="mb-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-[10px] font-bold text-slate-500 border border-slate-200">
            {String.fromCharCode(64 + ((index + 1) % 26 || 26))}
          </span>
          <span className="text-sm font-bold text-slate-700">切割方案</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full border border-indigo-100">
            共 {count} 支
          </span>
          <span className="text-[10px] text-slate-400 font-mono">剩余: {plan.remaining.toFixed(3)}m</span>
        </div>
      </div>
      
      {/* 进度条图示 */}
      <div className="relative h-10 w-full bg-slate-100 rounded-lg overflow-hidden flex border border-slate-300">
        {plan.segments.map((segment, i) => {
          const widthPercent = (segment.length / plan.totalUsableLength) * 100;
          return (
            <div
              key={i}
              className="h-full border-r border-white/30 flex items-center justify-center text-[11px] text-white font-bold transition-all hover:brightness-110 group cursor-help relative"
              style={{ 
                width: `${widthPercent}%`, 
                backgroundColor: `hsl(${(i * 60) % 360}, 55%, 45%)` 
              }}
              title={segment.description}
            >
              <span className="truncate px-1 drop-shadow-sm">{segment.length}m</span>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-20 bg-slate-800 text-white text-[10px] py-1 px-2 rounded whitespace-nowrap shadow-xl">
                {segment.description}
              </div>
            </div>
          );
        })}
        <div 
          className="h-full bg-slate-200 flex items-center justify-center" 
          style={{ width: `${(plan.remaining / plan.totalUsableLength) * 100}%` }}
        >
           {plan.remaining > 0.1 && <span className="text-[9px] text-slate-400 font-bold uppercase">余</span>}
        </div>
      </div>

      {/* 算式表述列表 */}
      <div className="mt-3 flex flex-wrap gap-2">
        {/* Fix: Explicitly type stat to resolve 'unknown' type inference in some environments */}
        {statsArray.map((stat: { length: number; count: number }, i) => (
          <div key={i} className="flex items-center bg-slate-50 border border-slate-200 rounded-md overflow-hidden">
            <span className="text-[11px] px-2 py-1 text-slate-600 font-mono border-r border-slate-200">
              {stat.length.toFixed(3)}m
            </span>
            <span className="text-[11px] px-2 py-1 bg-white text-indigo-600 font-bold">
              × {stat.count}
            </span>
          </div>
        ))}
        {plan.remaining > 0 && (
           <div className="flex items-center bg-slate-50 border border-slate-200 border-dashed rounded-md overflow-hidden opacity-60">
            <span className="text-[10px] px-2 py-1 text-slate-400 font-mono italic">
              余料 {plan.remaining.toFixed(3)}m
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default BarVisualizer;