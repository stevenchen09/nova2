import React, { useState, useRef } from 'react';

interface ShareCodeInputProps {
  onSubmit: (code: string) => void;
  errorMsg?: string;
  loading?: boolean;
}

/**
 * V4 T07 — 工厂端分享码输入入口
 *
 * 6 位字母数字输入框（拆分为 6 个小格子），输入完成自动提交。
 * 也支持点击「查看领料单」按钮手动提交。
 */
const ShareCodeInput: React.FC<ShareCodeInputProps> = ({
  onSubmit,
  errorMsg,
  loading,
}) => {
  const [code, setCode] = useState<string[]>(['', '', '', '', '', '']);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const CODE_LENGTH = 6;

  // ── 输入处理 ────────────────────────────────────────────────
  const handleChange = (index: number, value: string) => {
    // 只保留字母数字，转大写，取最后一位
    const cleaned = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (!cleaned) {
      const newCode = [...code];
      newCode[index] = '';
      setCode(newCode);
      return;
    }
    const char = cleaned.slice(-1);
    const newCode = [...code];
    newCode[index] = char;
    setCode(newCode);

    // 自动跳到下一个
    if (index < CODE_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }

    // 输入完成自动提交
    if (index === CODE_LENGTH - 1) {
      const fullCode = newCode.join('');
      if (fullCode.length === CODE_LENGTH) {
        onSubmit(fullCode);
      }
    } else {
      // 检查是否所有格子都已填
      const fullCode = newCode.join('');
      if (fullCode.length === CODE_LENGTH) {
        onSubmit(fullCode);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (code[index]) {
        // 当前格有值，清空
        const newCode = [...code];
        newCode[index] = '';
        setCode(newCode);
      } else if (index > 0) {
        // 当前格空，回退到上一格
        inputsRef.current[index - 1]?.focus();
        const newCode = [...code];
        newCode[index - 1] = '';
        setCode(newCode);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    } else if (e.key === 'Enter') {
      const fullCode = code.join('');
      if (fullCode.length === CODE_LENGTH) {
        onSubmit(fullCode);
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData('text')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(0, CODE_LENGTH);
    if (!pasted) return;
    const newCode = ['', '', '', '', '', ''];
    for (let i = 0; i < pasted.length; i++) {
      newCode[i] = pasted[i];
    }
    setCode(newCode);
    // 聚焦到下一格或最后一格
    const nextIndex = Math.min(pasted.length, CODE_LENGTH - 1);
    inputsRef.current[nextIndex]?.focus();
    if (pasted.length === CODE_LENGTH) {
      onSubmit(pasted);
    }
  };

  const handleSubmit = () => {
    const fullCode = code.join('');
    if (fullCode.length === CODE_LENGTH) {
      onSubmit(fullCode);
    }
  };

  const isComplete = code.join('').length === CODE_LENGTH;

  return (
    <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-200">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
          <svg
            className="w-4.5 h-4.5 text-indigo-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
            />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-black text-slate-900">输入分享码</h3>
          <p className="text-[10px] text-slate-400 font-bold">
            输入销售提供的 6 位分享码查看领料单
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        {code.map((char, i) => (
          <input
            key={i}
            ref={(el) => {
              inputsRef.current[i] = el;
            }}
            type="text"
            value={char}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            maxLength={1}
            disabled={loading}
            className={`w-11 h-12 text-center text-lg font-black font-mono uppercase rounded-xl border-2 transition-all outline-none ${
              char
                ? 'border-indigo-400 bg-indigo-50/50 text-indigo-700'
                : 'border-slate-200 bg-slate-50 text-slate-700 focus:border-indigo-400'
            } focus:ring-2 ring-indigo-500/20 disabled:opacity-60`}
            aria-label={`分享码第 ${i + 1} 位`}
          />
        ))}
      </div>

      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-2.5 mb-3">
          <p className="text-[11px] text-rose-600 font-bold">{errorMsg}</p>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!isComplete || loading}
        className="w-full py-2.5 bg-indigo-600 text-white text-xs font-black rounded-xl hover:bg-indigo-700 shadow-md shadow-indigo-500/15 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
      >
        {loading ? (
          <>
            <svg
              className="animate-spin h-3.5 w-3.5"
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
            查询中...
          </>
        ) : (
          '查看领料单'
        )}
      </button>
    </div>
  );
};

export default ShareCodeInput;
