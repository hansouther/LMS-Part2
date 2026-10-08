import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const SCALE_PRESETS = [
  { key: "snbt", label: "SNBT (0–1000)", desc: "Rata-rata 500, simpangan 100, rentang 0–1000." },
  { key: "tka", label: "TKA SMA (200–700)", desc: "Rentang 200–700 (rata-rata 450) untuk TKA tingkat SMA." },
  { key: "raw", label: "SD/SMP — Nilai Asli (1–100)", desc: "Hanya nilai asli (% benar) yang ditampilkan; skor IRT & θ disembunyikan." },
  { key: "custom", label: "Kustom", desc: "Tentukan sendiri minimum, maksimum, rata-rata, dan simpangan baku." },
];
export const EMPTY_CUSTOM = { min: 0, max: 1000, mean: 500, sd: 100 };

export default function IrtScaleFields({ value, custom, onChange, onCustomChange, testIdPrefix = "irt-scale" }) {
  const preset = SCALE_PRESETS.find((p) => p.key === value) || SCALE_PRESETS[0];
  const c = { ...EMPTY_CUSTOM, ...(custom || {}) };
  const setC = (k) => (e) => onCustomChange({ ...c, [k]: e.target.value });
  return (
    <div className="space-y-3" data-testid={`${testIdPrefix}-fields`}>
      <div>
        <Label>Skala Skor IRT</Label>
        <Select value={value || "snbt"} onValueChange={onChange}>
          <SelectTrigger className="mt-1.5" data-testid={`${testIdPrefix}-select`}><SelectValue /></SelectTrigger>
          <SelectContent>
            {SCALE_PRESETS.map((p) => <SelectItem key={p.key} value={p.key} data-testid={`${testIdPrefix}-option-${p.key}`}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="mt-1.5 text-xs text-[#94A3B8]" data-testid={`${testIdPrefix}-desc`}>{preset.desc}</p>
      </div>
      {value === "custom" && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-lg border border-dashed border-[#C9A227]/60 bg-[#FBF3DC]/40 p-3" data-testid={`${testIdPrefix}-custom`}>
          <div><Label className="text-xs">Minimum</Label><Input type="number" value={c.min} onChange={setC("min")} className="mt-1 h-9" data-testid={`${testIdPrefix}-min`} /></div>
          <div><Label className="text-xs">Maksimum</Label><Input type="number" value={c.max} onChange={setC("max")} className="mt-1 h-9" data-testid={`${testIdPrefix}-max`} /></div>
          <div><Label className="text-xs">Rata-rata</Label><Input type="number" value={c.mean} onChange={setC("mean")} className="mt-1 h-9" data-testid={`${testIdPrefix}-mean`} /></div>
          <div><Label className="text-xs">Simpangan (SD)</Label><Input type="number" value={c.sd} onChange={setC("sd")} className="mt-1 h-9" data-testid={`${testIdPrefix}-sd`} /></div>
        </div>
      )}
    </div>
  );
}

export const toCustomPayload = (c) => {
  const n = (v, d) => (v === "" || v == null || Number.isNaN(Number(v)) ? d : Number(v));
  return { min: n(c?.min, 0), max: n(c?.max, 1000), mean: n(c?.mean, 500), sd: n(c?.sd, 100) };
};
