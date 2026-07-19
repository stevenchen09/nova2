import React from 'react';
import { FrameItem } from '../../types';

interface ItemListPanelProps {
  items: FrameItem[];
  onRemoveItem: (id: string) => void;
  onClearItems: () => void;
}

/**
 * Scrollable list of currently entered quotation items.
 *
 * Shows each item's model, color, dimensions, size-type and quantity
 * with a per-item delete button. Also provides a "clear all" shortcut.
 */
const ItemListPanel: React.FC<ItemListPanelProps> = ({
  items,
  onRemoveItem,
  onClearItems,
}) => {
  return (
    <section className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm max-h-[300px] overflow-y-auto custom-scrollbar">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          当前明细池 ({items.length})
        </h3>
        {items.length > 0 && (
          <button
            onClick={onClearItems}
            className="text-[9px] font-black text-red-500 hover:underline"
          >
            一键清池
          </button>
        )}
      </div>
      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="text-center py-10 text-slate-300 text-xs font-bold uppercase tracking-widest border border-dashed rounded-xl">
            算料池为空
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="group flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-100/40 transition-all"
            >
              <div className="text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="font-black text-slate-800">{item.model}</span>
                  <span className="text-slate-300">&middot;</span>
                  <span className="font-bold text-slate-500">{item.color}</span>
                </div>
                <p className="text-slate-400 font-bold mt-0.5">
                  {item.width} x {item.height} cm{' '}
                  <span className="bg-slate-200/60 text-slate-600 px-1.5 py-0.5 rounded text-[8px] ml-1.5">
                    {item.sizeType}
                  </span>{' '}
                  x{item.quantity}
                </p>
              </div>
              <button
                onClick={() => onRemoveItem(item.id)}
                className="p-1 text-slate-300 hover:text-red-500 transition-all"
                title="删除该条"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
};

export default ItemListPanel;
