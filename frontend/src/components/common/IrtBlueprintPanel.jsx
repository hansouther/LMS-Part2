import { useEffect } from "react";
import { Activity, Target, Gauge, Sparkles, RefreshCw, Info } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import useFetch from "@/hooks/useFetch";
import { Button } from "@/components/ui/button";

const LEVELS = [
  { key: "mudah", label: "Mudah", color: "#10B981" },
  { key: "sedang", label: "Sedang", color: "#C9A227" },
  { key: "sulit", label: "Sulit", color: "#EF4444" },
];

export default function IrtBlueprintPanel({ tryoutId, version = 0, onCalibrate, calibrating = false }) {
  const { data, loading, refetch } = useFetch(`/admin/tryouts/${tryoutId}/irt-blueprint`);

  useEffect(() => { if (version > 0) refetch(); }, [version]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !data) {
    return <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 text-sm text-[#94A3B8]" data-testid="irt-blueprint-loading">Memuat rekomendasi IRT…</div>;
  }
  if (!data) return null;

  const total = data.total || 0;
  const peak = data.tif_peak || { theta: 0, info: 0 };

  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-white overflow-hidden" data-testid="irt-blueprint-panel">
      <div className="flex items-center justify-between gap-3 px-5 py-4 bg-gradient-to-r from-[#0A1128] to-[#0E3A4A] text-white">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-white/10 flex items-center justify-center"><Gauge className="h-5 w-5 text-[#5FD3E8]" /></div>
          <div>
            <h2 className="font-bold leading-tight">Rekomendasi Komposisi Soal (IRT)</h2>
            <p className="text-xs text-white/60">Item Response Theory · 3PL · target ±30% Mudah · 40% Sedang · 30% Sulit</p>
          </div>
        </div>
        <Button size="sm" onClick={onCalibrate} disabled={calibrating}
          className="rounded-full bg-[#C9A227] hover:bg-[#b08f1f] text-[#0A1128] font-semibold shrink-0" data-testid="calibrate-irt-btn">
          <RefreshCw className={`h-4 w-4 ${calibrating ? "animate-spin" : ""}`} /> {calibrating ? "Mengkalibrasi…" : "Kalibrasi IRT"}
        </Button>
      </div>

      <div className="p-5 grid lg:grid-cols-2 gap-6">
        {/* Composition vs target */}
        <div>
          <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-[#0A1128]"><Target className="h-4 w-4 text-[#0E7490]" /> Komposisi Tingkat Kesulitan</div>
          <div className="space-y-3" data-testid="irt-composition">
            {LEVELS.map((lv) => {
              const count = data.composition?.[lv.key] || 0;
              const target = data.target_counts?.[lv.key] || 0;
              const pct = total ? Math.round((count / total) * 100) : 0;
              const gap = data.gaps?.[lv.key] || 0;
              return (
                <div key={lv.key} data-testid={`irt-level-${lv.key}`}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold" style={{ color: lv.color }}>{lv.label}</span>
                    <span className="text-[#475569]">{count} soal <span className="text-[#94A3B8]">({pct}%) · target {target}</span></span>
                  </div>
                  <div className="h-2.5 rounded-full bg-[#F1F5F9] overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${total ? (count / total) * 100 : 0}%`, backgroundColor: lv.color }} />
                  </div>
                  {gap > 0 ? (
                    <p className="mt-1 text-[11px] text-[#EF4444]" data-testid={`irt-gap-${lv.key}`}>Kurang {gap} soal</p>
                  ) : gap < 0 ? (
                    <p className="mt-1 text-[11px] text-[#C9A227]" data-testid={`irt-gap-${lv.key}`}>Lebih {Math.abs(gap)} soal</p>
                  ) : (
                    <p className="mt-1 text-[11px] text-[#10B981]" data-testid={`irt-gap-${lv.key}`}>Sesuai target ✓</p>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-[#475569] bg-[#E6F5F8] rounded-lg px-3 py-2" data-testid="irt-calibration-status">
            <Info className="h-3.5 w-3.5 text-[#0E7490] shrink-0" />
            {data.calibrated_count}/{total} soal terkalibrasi IRT dari data jawaban peserta.
          </div>
        </div>

        {/* Test Information Function */}
        <div>
          <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-[#0A1128]"><Activity className="h-4 w-4 text-[#0E7490]" /> Test Information Function</div>
          <div className="h-[180px] w-full" data-testid="irt-tif-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.tif || []} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="tifFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0E7490" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#0E7490" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F6" vertical={false} />
                <XAxis dataKey="theta" tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} axisLine={{ stroke: "#E2E8F0" }} label={{ value: "Kemampuan (θ)", position: "insideBottom", offset: -2, fontSize: 10, fill: "#94A3B8" }} />
                <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v) => [v, "Informasi"]} labelFormatter={(l) => `θ = ${l}`} contentStyle={{ borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 12 }} />
                <Area type="monotone" dataKey="information" stroke="#0E7490" strokeWidth={2} fill="url(#tifFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-[#94A3B8] mt-1">Puncak informasi pada θ = {peak.theta} (paket paling akurat mengukur kemampuan di sekitar titik ini).</p>
        </div>
      </div>

      {/* Recommendations */}
      <div className="px-5 pb-5">
        <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-[#0A1128]"><Sparkles className="h-4 w-4 text-[#C9A227]" /> Saran untuk Staff Admin</div>
        <ul className="space-y-1.5" data-testid="irt-recommendations">
          {(data.recommendations || []).map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-[#475569]">
              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#0E7490] shrink-0" />{r}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
