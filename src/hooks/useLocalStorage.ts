import { useState, useEffect, useCallback } from 'react';
import { FrameItem } from '../types';

/**
 * 用户命名空间的 localStorage key
 * Example:  aluminum_items_admin
 */
function userKey(username: string, base: string): string {
  return `aluminum_${base}_${username}`;
}

export interface UseLocalStorageReturn {
  /* ---- 本地工作区临时数据 ---- */
  items: FrameItem[];
  setItems: React.Dispatch<React.SetStateAction<FrameItem[]>>;
  clientName: string;
  setClientName: React.Dispatch<React.SetStateAction<string>>;
  orderName: string;
  setOrderName: React.Dispatch<React.SetStateAction<string>>;

  /* ---- UI 偏好 ---- */
  showCosts: boolean;
  setShowCosts: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * V4 useLocalStorage — 仅管理本地临时数据
 *
 * 变更说明（V3 → V4）：
 * - 移除 costDatabase / historyRecords / priceConfig（已迁移到 useCloudData）
 * - 移除 aiSettings / getActiveAIKey / updateAISettings（T03 改走 cloudService.aiSettings）
 * - 移除 priceConfigMemory（云端统一存储费率，不再需要本地记忆）
 * - 移除 exportAllBackup / importBackupFile（云端数据由服务器持久化，备份改由 SettingsPanel 自行处理）
 * - 保留 items / clientName / orderName（工作区临时数据，按用户隔离）
 * - 保留 showCosts（UI 偏好，全局存储）
 */
export function useLocalStorage(
  username: string | undefined,
): UseLocalStorageReturn {
  // ---- Per-user initialisers ----
  const [items, setItems] = useState<FrameItem[]>(() => {
    if (!username) return [];
    const saved = localStorage.getItem(userKey(username, 'items'));
    return saved ? JSON.parse(saved) : [];
  });

  const [clientName, setClientName] = useState(() => {
    if (!username) return '';
    return localStorage.getItem(userKey(username, 'client')) || '';
  });

  const [orderName, setOrderName] = useState(() => {
    if (!username) return '';
    return localStorage.getItem(userKey(username, 'order')) || '';
  });

  // ---- Global UI preferences ----
  const [showCosts, setShowCosts] = useState<boolean>(() => {
    const saved = localStorage.getItem('aluminum_show_costs');
    return saved !== 'false';
  });

  // ---- Sync per-user state to localStorage ----
  useEffect(() => {
    if (username) {
      localStorage.setItem(userKey(username, 'items'), JSON.stringify(items));
    }
  }, [items, username]);

  useEffect(() => {
    if (username) {
      localStorage.setItem(userKey(username, 'client'), clientName);
    }
  }, [clientName, username]);

  useEffect(() => {
    if (username) {
      localStorage.setItem(userKey(username, 'order'), orderName);
    }
  }, [orderName, username]);

  useEffect(() => {
    localStorage.setItem('aluminum_show_costs', String(showCosts));
  }, [showCosts]);

  // ---- Re-initialise per-user state when username changes ----
  useEffect(() => {
    if (!username) return;
    const savedItems = localStorage.getItem(userKey(username, 'items'));
    setItems(savedItems ? JSON.parse(savedItems) : []);
    setClientName(localStorage.getItem(userKey(username, 'client')) || '');
    setOrderName(localStorage.getItem(userKey(username, 'order')) || '');
  }, [username]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    items,
    setItems,
    clientName,
    setClientName,
    orderName,
    setOrderName,
    showCosts,
    setShowCosts,
  };
}
