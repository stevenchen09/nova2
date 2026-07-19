import { useState, useEffect, useCallback } from 'react';
import {
  CostRecord,
  HistoryRecord,
  PriceConfig,
  PricingMode,
  Role,
} from '../types';
import { cloudService } from '../services/cloudService';

/**
 * useCloudData — V4 云端数据统一管理 hook
 *
 * 职责：
 *   集中加载并缓存三类云端数据：
 *     1. costDatabase  — 成本资料库（cost-database 云函数）
 *     2. priceConfig   — 费率配置（price-config 云函数）
 *     3. historyRecords — 算料历史（calculation 云函数）
 *
 * 设计要点：
 *   - 单一数据源：组件不再各自调 cloudService 读取，全部通过此 hook 拿数据
 *   - 写操作走 cloudService，成功后更新本地缓存（pessimistic 模式）
 *   - 提供 loading / error 状态供组件显示
 *   - 当前用户角色变化时（登录/切换账号）自动重新加载
 */

/** V3 默认费率配置（云端无数据时使用） */
const DEFAULT_PRICE_CONFIG: PriceConfig = {
  materialPrice: 45,
  mode: PricingMode.BATCH,
  quoteAccessoryPrice: 15,
  quoteCuttingFee: 3,
  quoteTaxRate: 0.13,
  costAccessoryPrice: 10.5,
  costCuttingFee: 2.1,
  costTaxRate: 0.13,
  defaultWeightPerMeter: 0.85,
  defaultWeightPerAccessorySet: 0.12,
  colorReuseRules: [
    { sourceColor: '哑银', targetColor: '哑黑' },
    { sourceColor: '浅哑金', targetColor: '哑黑' },
    { sourceColor: '磨砂白', targetColor: '哑黑' },
    { sourceColor: '亮钛金', targetColor: '磨光亮金' },
    { sourceColor: '紫金', targetColor: '磨光亮金' },
  ],
};

export interface UseCloudDataReturn {
  /* ---- 成本资料库 ---- */
  costDatabase: CostRecord[];
  costDbLoading: boolean;
  costDbError: string;
  createCostRecord: (record: CostRecord) => Promise<CostRecord>;
  updateCostRecord: (record: CostRecord) => Promise<CostRecord>;
  deleteCostRecord: (id: string) => Promise<void>;
  batchImportCostRecords: (records: CostRecord[]) => Promise<number>;
  refreshCostDatabase: () => Promise<void>;

  /* ---- 费率配置 ---- */
  priceConfig: PriceConfig;
  priceConfigLoading: boolean;
  priceConfigError: string;
  setPriceConfig: React.Dispatch<React.SetStateAction<PriceConfig>>;
  persistPriceConfig: (config: PriceConfig) => Promise<PriceConfig>;
  refreshPriceConfig: () => Promise<void>;

  /* ---- 算料历史 ---- */
  historyRecords: HistoryRecord[];
  historyLoading: boolean;
  historyError: string;
  saveHistoryRecord: (record: HistoryRecord) => Promise<HistoryRecord>;
  updateHistoryRecord: (id: string, record: HistoryRecord) => Promise<HistoryRecord>;
  deleteHistoryRecord: (id: string) => Promise<void>;
  refreshHistory: () => Promise<void>;

  /* ---- 全局 ---- */
  isInitialLoading: boolean;
}

export function useCloudData(
  user: { uid: string; username: string; role: Role } | null,
): UseCloudDataReturn {
  // ── 成本资料库状态 ──────────────────────────────────────────────
  const [costDatabase, setCostDatabase] = useState<CostRecord[]>([]);
  const [costDbLoading, setCostDbLoading] = useState(false);
  const [costDbError, setCostDbError] = useState('');

  // ── 费率配置状态 ────────────────────────────────────────────────
  const [priceConfig, setPriceConfig] = useState<PriceConfig>(
    () => ({ ...DEFAULT_PRICE_CONFIG }),
  );
  const [priceConfigLoading, setPriceConfigLoading] = useState(false);
  const [priceConfigError, setPriceConfigError] = useState('');

  // ── 算料历史状态 ────────────────────────────────────────────────
  const [historyRecords, setHistoryRecords] = useState<HistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // ── 加载方法 ────────────────────────────────────────────────────
  const refreshCostDatabase = useCallback(async () => {
    setCostDbLoading(true);
    setCostDbError('');
    try {
      const records = await cloudService.costDb.list();
      setCostDatabase(records);
    } catch (err: any) {
      setCostDbError(err.message || String(err));
    } finally {
      setCostDbLoading(false);
    }
  }, []);

  const refreshPriceConfig = useCallback(async () => {
    setPriceConfigLoading(true);
    setPriceConfigError('');
    try {
      const cfg = await cloudService.priceConfig.get();
      if (cfg) {
        setPriceConfig({ ...DEFAULT_PRICE_CONFIG, ...cfg });
      }
    } catch (err: any) {
      setPriceConfigError(err.message || String(err));
    } finally {
      setPriceConfigLoading(false);
    }
  }, []);

  const refreshHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const records = await cloudService.calculation.list();
      setHistoryRecords(records);
    } catch (err: any) {
      setHistoryError(err.message || String(err));
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // ── 用户变化时首次全量加载 ──────────────────────────────────────
  useEffect(() => {
    if (!user) {
      setCostDatabase([]);
      setHistoryRecords([]);
      setPriceConfig({ ...DEFAULT_PRICE_CONFIG });
      setIsInitialLoading(false);
      return;
    }
    setIsInitialLoading(true);
    Promise.all([refreshCostDatabase(), refreshPriceConfig(), refreshHistory()])
      .finally(() => setIsInitialLoading(false));
  }, [user?.uid, refreshCostDatabase, refreshPriceConfig, refreshHistory]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 成本资料库写操作 ────────────────────────────────────────────
  const createCostRecord = useCallback(
    async (record: CostRecord): Promise<CostRecord> => {
      const created = await cloudService.costDb.create(record);
      setCostDatabase((prev) => [created, ...prev]);
      return created;
    },
    [],
  );

  const updateCostRecord = useCallback(
    async (record: CostRecord): Promise<CostRecord> => {
      const updated = await cloudService.costDb.update(record);
      setCostDatabase((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r)),
      );
      return updated;
    },
    [],
  );

  const deleteCostRecord = useCallback(
    async (id: string): Promise<void> => {
      await cloudService.costDb.delete(id);
      setCostDatabase((prev) => prev.filter((r) => r.id !== id));
    },
    [],
  );

  const batchImportCostRecords = useCallback(
    async (records: CostRecord[]): Promise<number> => {
      const res = await cloudService.costDb.batchImport(records);
      await refreshCostDatabase();
      return res.count;
    },
    [refreshCostDatabase],
  );

  // ── 费率配置写操作 ──────────────────────────────────────────────
  const persistPriceConfig = useCallback(
    async (config: PriceConfig): Promise<PriceConfig> => {
      const updated = await cloudService.priceConfig.update(config);
      setPriceConfig({ ...DEFAULT_PRICE_CONFIG, ...updated });
      return updated;
    },
    [],
  );

  // ── 历史记录写操作 ──────────────────────────────────────────────
  const saveHistoryRecord = useCallback(
    async (record: HistoryRecord): Promise<HistoryRecord> => {
      const res = await cloudService.calculation.save(record);
      const saved = res.record || { ...record, id: res.id };
      setHistoryRecords((prev) => [saved, ...prev]);
      return saved;
    },
    [],
  );

  const updateHistoryRecord = useCallback(
    async (id: string, record: HistoryRecord): Promise<HistoryRecord> => {
      const res = await cloudService.calculation.update(id, record);
      const updated = res.record;
      setHistoryRecords((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...updated, id } : r)),
      );
      return updated;
    },
    [],
  );

  const deleteHistoryRecord = useCallback(
    async (id: string): Promise<void> => {
      await cloudService.calculation.delete(id);
      setHistoryRecords((prev) => prev.filter((r) => r.id !== id));
    },
    [],
  );

  return {
    /* cost db */
    costDatabase,
    costDbLoading,
    costDbError,
    createCostRecord,
    updateCostRecord,
    deleteCostRecord,
    batchImportCostRecords,
    refreshCostDatabase,

    /* price config */
    priceConfig,
    priceConfigLoading,
    priceConfigError,
    setPriceConfig,
    persistPriceConfig,
    refreshPriceConfig,

    /* history */
    historyRecords,
    historyLoading,
    historyError,
    saveHistoryRecord,
    updateHistoryRecord,
    deleteHistoryRecord,
    refreshHistory,

    /* global */
    isInitialLoading,
  };
}

export default useCloudData;
