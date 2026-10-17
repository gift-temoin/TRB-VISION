import { CandlestickChart, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CandleChart } from "../components/forex/CandleChart";
import { DataSourceStatus } from "../components/forex/DataSourceStatus";
import { EvaluationPanel } from "../components/forex/EvaluationPanel";
import { IndicatorPanel } from "../components/forex/IndicatorPanel";
import { Button } from "../components/ui/Button";
import { Card, CardHeader } from "../components/ui/Card";
import { ErrorState } from "../components/ui/States";
import { CardSkeleton } from "../components/ui/Spinner";
import { api, ApiError } from "../lib/api";
import type { ForexCandlesResponse, ForexAnalysisResponse, ForexEvaluation } from "../types";

const SYMBOLS = ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD"];
const INTERVALS = ["M15", "M30", "H1", "H4", "D1"];

interface Bundle {
  candles: ForexCandlesResponse;
  analysis: ForexAnalysisResponse;
  evaluation: ForexEvaluation;
}

export function ForexAnalysis() {
  const [symbol, setSymbol] = useState("EUR/USD");
  const [interval, setInterval_] = useState("H1");
  const [data, setData] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [candles, analysis, evaluation] = await Promise.all([
        api.forexCandles(symbol, interval),
        api.forexAnalysis(symbol, interval),
        api.forexEvaluate(symbol, interval),
      ]);
      setData({ candles, analysis, evaluation });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load Forex analysis.");
    } finally {
      setLoading(false);
    }
  }, [symbol, interval]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5">
            <CandlestickChart className="h-6 w-6 text-sky-400" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-white sm:text-2xl">Forex Trend Analysis</h1>
            <p className="text-sm text-slate-400">
              Historical OHLC, indicators &amp; swing structure — educational, not predictive.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <Selector label="Symbol" value={symbol} onChange={setSymbol} options={SYMBOLS} />
          <Selector label="Interval" value={interval} onChange={setInterval_} options={INTERVALS} />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void load()}
            icon={<RefreshCw className="h-4 w-4" />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {error && <ErrorState description={error} onRetry={() => void load()} />}

      {loading ? (
        <div className="space-y-6">
          <CardSkeleton />
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <CardSkeleton />
            </div>
            <CardSkeleton />
          </div>
        </div>
      ) : data ? (
        <>
          <DataSourceStatus status={data.candles.status} warnings={data.candles.warnings} />

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title="Price history"
                subtitle={`${data.candles.status.completed_candles} completed candles · ${data.candles.status.provider}`}
                icon={<CandlestickChart className="h-5 w-5" />}
              />
              <CandleChart
                candles={data.candles.candles}
                series={data.analysis.series}
                structure={data.analysis.structure}
                label={`${symbol} · ${interval}`}
              />
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader title="Indicators" subtitle="Computed on completed candles" />
                <IndicatorPanel
                  indicators={data.analysis.indicators}
                  structure={data.analysis.structure}
                />
              </Card>
            </div>
          </div>

          <EvaluationPanel data={data.evaluation} />
        </>
      ) : null}
    </div>
  );
}

function Selector({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-xl border border-line bg-navy-900 px-3 text-sm text-white focus:border-bullish/60 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o} className="bg-navy-800">
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
