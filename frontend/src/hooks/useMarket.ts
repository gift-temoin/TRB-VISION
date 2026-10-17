import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { MarketCategory, PredictionResponse } from "../types";

export function useMarket(category: MarketCategory) {
  const [data, setData] = useState<PredictionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.market(category);
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load market data.");
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, reload: load };
}

export function useAllMarkets(categories: MarketCategory[]) {
  const [data, setData] = useState<Record<string, PredictionResponse>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.all(
        categories.map((c) => api.market(c).then((r) => [c, r] as const))
      );
      setData(Object.fromEntries(results));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load market data.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories.join(",")]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, reload: load };
}
