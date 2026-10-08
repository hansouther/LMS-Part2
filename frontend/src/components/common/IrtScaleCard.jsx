import { useEffect, useState } from "react";
import { Ruler, Save } from "lucide-react";
import useFetch from "@/hooks/useFetch";
import api, { apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import IrtScaleFields, { EMPTY_CUSTOM, toCustomPayload } from "@/components/common/IrtScaleFields";
import { toast } from "sonner";

export default function IrtScaleCard({ tryoutId, onSaved }) {
  const { data, refetch } = useFetch(`/admin/tryouts/${tryoutId}/irt-scale`);
  const [scale, setScale] = useState("snbt");
  const [custom, setCustom] = useState(EMPTY_CUSTOM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setScale(data.irt_scale || "snbt");
    setCustom(data.irt_scale_custom || EMPTY_CUSTOM);
  }, [data]);

  const dirty = data && (scale !== (data.irt_scale || "snbt") || (scale === "custom" && JSON.stringify(toCustomPayload(custom)) !== JSON.stringify(data.irt_scale_custom || null)));

  const save = async () => {
    setSaving(true);
    try {
      const { data: res } = await api.put(`/admin/tryouts/${tryoutId}/irt-scale`, {
        irt_scale: scale, irt_scale_custom: scale === "custom" ? toCustomPayload(custom) : null,
      });
      toast.success(`Skala ${res.effective?.label} diterapkan · ${res.rescored} hasil peserta dihitung ulang`);
      refetch(); onSaved?.();
    } catch (e) { toast.error(apiError(e)); }
    finally { setSaving(false); }
  };

  const eff = data?.effective;
  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5" data-testid="irt-scale-card">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-[#E6F5F8] flex items-center justify-center"><Ruler className="h-5 w-5 text-[#0E7490]" /></div>
          <div>
            <h2 className="font-bold text-[#0A1128] leading-tight">Skala Skor IRT</h2>
            <p className="text-xs text-[#94A3B8]">Pilih skala pelaporan sesuai jenjang: SNBT, TKA SMA, SD/SMP, atau kustom.</p>
          </div>
        </div>
        {eff && (
          <span className="rounded-full bg-[#0A1128] px-3 py-1 text-[11px] font-semibold text-white" data-testid="irt-scale-active">
            Aktif: {eff.label}{eff.show_irt ? ` · μ ${eff.mean} · σ ${eff.sd}` : " · IRT disembunyikan"}
          </span>
        )}
      </div>
      <div className="mt-4">
        <IrtScaleFields value={scale} custom={custom} onChange={setScale} onCustomChange={setCustom} testIdPrefix="builder-irt-scale" />
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-[#94A3B8]">Mengganti skala akan menghitung ulang skor IRT semua hasil peserta yang sudah ada.</p>
        <Button size="sm" onClick={save} disabled={saving || !dirty} className="rounded-full bg-[#0E7490] hover:bg-[#0B5C74]" data-testid="save-irt-scale">
          <Save className="h-4 w-4" /> {saving ? "Menyimpan…" : "Terapkan Skala"}
        </Button>
      </div>
    </div>
  );
}
