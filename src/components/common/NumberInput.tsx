import React, { useEffect, useRef, useState } from 'react';

/**
 * 数字输入框 — 字符串草稿模式，解决受控 number 输入"最后一位删不掉"的经典问题。
 *
 * 原理：内部用字符串保存草稿，聚焦期间允许任意中间态（空、"-"、"0."、"3.14"），
 * 删除可一路删到空；失焦时才解析成数字并 clamp 到 [min, max] 提交。
 *
 * 与 type="number" + value={number} 的区别：
 * - type="number" 在删除到空时 e.target.value 为 ""，Number("")===0 被强制回填 0，
 *   或 onChange 里 `if(raw==='') return` 导致 React 用旧 number 重渲染、输入框弹回旧值。
 * - 本组件改用 type="text" + inputMode="decimal"，空就是空，绝不强制回填。
 */
interface NumberInputProps {
  value: number;
  /** 输入合法数字时实时回调（用于 live preview） */
  onChange: (value: number) => void;
  /** 输入变为空时回调（可选，用于"清空恢复默认"场景） */
  onEmpty?: () => void;
  min?: number;
  max?: number;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  title?: string;
  /** 是否允许小数（决定键盘与显示），默认 true */
  decimal?: boolean;
}

const NumberInput: React.FC<NumberInputProps> = ({
  value,
  onChange,
  onEmpty,
  min,
  max,
  placeholder,
  disabled,
  required,
  className,
  title,
  decimal = true,
}) => {
  // 字符串草稿：聚焦时可容纳任意中间态
  const [draft, setDraft] = useState<string>(String(value));
  const focusedRef = useRef(false);

  // 外部 value 变化时：仅在未聚焦时同步草稿（聚焦时保留用户正在输入的内容）
  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(String(value));
    }
  }, [value]);

  const clamp = (n: number): number => {
    let v = n;
    if (typeof min === 'number' && v < min) v = min;
    if (typeof max === 'number' && v > max) v = max;
    return v;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setDraft(raw); // 任何中间态都保留，绝不回填

    // 空或纯符号的中间态：不提交数字，触发 onEmpty（若提供）
    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') {
      onEmpty?.();
      return;
    }

    const n = Number(raw);
    if (!Number.isNaN(n)) {
      onChange(n); // 实时提交（不 clamp，clamp 交给失焦）
    }
  };

  const handleBlur = () => {
    focusedRef.current = false;
    const trimmed = draft.trim();
    const n = Number(trimmed);

    if (trimmed === '' || Number.isNaN(n)) {
      // 空/非法输入：回退到当前有效 value
      setDraft(String(value));
      return;
    }

    const clamped = clamp(n);
    setDraft(String(clamped));
    if (clamped !== value) {
      onChange(clamped);
    }
  };

  return (
    <input
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      value={draft}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={() => {
        focusedRef.current = true;
      }}
      placeholder={placeholder}
      disabled={disabled}
      required={required}
      className={className}
      title={title}
    />
  );
};

export default NumberInput;
