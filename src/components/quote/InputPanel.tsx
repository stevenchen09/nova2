import React from 'react';

interface InputPanelProps {
  inputText: string;
  onInputChange: (value: string) => void;
  onParse: () => Promise<void>;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => Promise<void>;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => Promise<void>;
  isLoading: boolean;
  statusMsg: string;
  isDragging: boolean;
  useAiParser: boolean;
  onToggleAiParser: (v: boolean) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  validationError?: string;
  onClearValidationError?: () => void;
}

/**
 * Quick-entry input panel for quotation items.
 *
 * V4 变更：
 * - 移除 aiSettings prop（AI Key 后端化，调用走云函数）
 * - 移除「未配置 API Key」警告横幅（由云函数返回错误时统一提示）
 */
const InputPanel: React.FC<InputPanelProps> = ({
  inputText,
  onInputChange,
  onParse,
  onFileUpload,
  onPaste,
  onDragOver,
  onDragLeave,
  onDrop,
  isLoading,
  statusMsg,
  isDragging,
  useAiParser,
  onToggleAiParser,
  fileInputRef,
  validationError,
  onClearValidationError,
}) => {
  return (
    <section
      className={`bg-white p-6 rounded-[2rem] border transition-all relative overflow-hidden shadow-sm ${
        isDragging
          ? 'border-indigo-500 ring-4 ring-indigo-500/10 scale-[1.01]'
          : 'border-slate-200'
      }`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Drag-overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-indigo-600/90 backdrop-blur-sm z-30 flex flex-col items-center justify-center text-white p-6 transition-all animate-fade-in text-center">
          <div className="bg-white/20 p-4 rounded-full mb-3 animate-bounce">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          </div>
          <p className="font-black text-sm mb-1">将材料清单文件拖至此处</p>
          <p className="text-[10px] text-indigo-100 opacity-90 max-w-xs">
            支持直接识别图片、TXT、CSV、Word (docx)、PDF 等各种类型的订单规格清单
          </p>
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <div className="space-y-0.5">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            快捷录入明细
          </h3>
          <p className="text-[9px] text-slate-300">支持直接复制粘贴图片、多文件拖拽</p>
        </div>
      </div>

      {/* Warning banner — V4: 由云函数统一管理 API Key，前端不再提示 */}

      {/* Textarea */}
      <textarea
        value={inputText}
        onChange={(e) => onInputChange(e.target.value)}
        onPaste={onPaste}
        placeholder="输入订单信息，如：30×40 黑色画框 2个、50×60 银色相框 1个..."
        className="w-full h-24 p-4 text-xs bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 ring-indigo-500 outline-none resize-none mb-4 font-mono transition-all placeholder:text-slate-300"
      />

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={onParse}
          className="flex-1 bg-slate-900 text-white py-3 rounded-xl font-black text-xs hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-md shadow-slate-900/10"
        >
          AI 识别并添加
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          title="上传清单文件 (支持多选图片、Word、CSV、TXT、PDF等)"
          className="px-4 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-all flex items-center justify-center border border-indigo-200/50"
        >
          <svg
            className="w-4.5 h-4.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.5"
              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.5"
              d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </button>
        <input
          type="file"
          ref={fileInputRef as React.RefObject<HTMLInputElement>}
          onChange={onFileUpload}
          accept="image/*,.txt,.csv,.docx,.doc,application/pdf"
          multiple
          hidden
        />
      </div>

      {/* Loading status */}
      {isLoading && statusMsg && (
        <div className="mt-3 flex items-center gap-1.5 text-[10px] font-black text-indigo-600 animate-pulse uppercase tracking-wider">
          <svg
            className="animate-spin h-3.5 w-3.5 text-indigo-600"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          {statusMsg}
        </div>
      )}

      {/* Validation warning */}
      {validationError && (
        <div className="mt-2 bg-amber-50 text-amber-700 border border-amber-200 px-4 py-2 rounded-xl text-[11px] font-bold flex items-start gap-2">
          <span>⚠️</span>
          <span>{validationError}</span>
          {onClearValidationError && (
            <button
              onClick={onClearValidationError}
              className="ml-auto text-amber-400 hover:text-amber-600 font-black"
            >
              ✕
            </button>
          )}
        </div>
      )}
    </section>
  );
};

export default InputPanel;
