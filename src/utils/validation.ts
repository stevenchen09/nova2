/**
 * 输入校验与清洗工具模块
 * 提供对 FrameItem 数据的字段校验和文本清洗功能
 */

import { FrameItem } from '../types';

/** 校验错误信息接口 */
export interface ValidationError {
  field: string;
  message: string;
}

/**
 * 校验单个 FrameItem 的数据合法性
 * @param item - 待校验的 FrameItem（允许部分字段）
 * @returns 校验通过返回 null，否则返回错误对象
 */
export function validateFrameItem(item: Partial<FrameItem>): ValidationError | null {
  if (item.width !== undefined && item.width !== null) {
    if (isNaN(item.width) || item.width <= 0) return { field: 'width', message: '宽度必须大于0' };
    if (item.width > 500) return { field: 'width', message: '宽度超出合理范围(≤500cm)' };
  }
  if (item.height !== undefined && item.height !== null) {
    if (isNaN(item.height) || item.height <= 0) return { field: 'height', message: '高度必须大于0' };
    if (item.height > 500) return { field: 'height', message: '高度超出合理范围(≤500cm)' };
  }
  if (item.quantity !== undefined && item.quantity !== null) {
    if (isNaN(item.quantity) || item.quantity <= 0) return { field: 'quantity', message: '数量必须大于0' };
    if (item.quantity > 9999) return { field: 'quantity', message: '数量上限为9999' };
  }
  return null;
}

/**
 * 清理用户输入文本：去除首尾空白并合并内部连续空白为单个空格
 * @param text - 原始输入文本
 * @returns 清洗后的文本
 */
export function sanitizeInput(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}
