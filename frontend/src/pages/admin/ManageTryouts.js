import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Pencil, Trash2, FileText, Settings2, BarChart3, HelpCircle, Users } from "lucide-react";
import useFetch from "@/hooks/useFetch";
import api, { apiError } from "@/lib/api";
import PageHeader from "@/components/common/PageHeader";
import { Loading, Empty } from "@/components/common/States";
import ConfirmButton from "@/components/common/ConfirmButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import IrtScaleFields, { EMPTY_CUSTOM, toCustomPayload, SCALE_PRESETS } from "@/components/common/IrtScaleFields";
import { formatRupiah } from "@/lib/format";
import { toast } from "sonner";

const EMPTY = { title: "", description: "", subject: "", duration_minutes: 60, published: false, irt_scale: "snbt", irt_scale_custom: EMPTY_CUSTOM, price: 0 };
const scaleLabel = (t) => (SCALE_PRESETS.find((p) => p.key === (t.irt_scale || "snbt")) || SCALE_PRESETS[0]).label;

export default function ManageTryouts() {
  const { data, loading, refetch } = useFetch("/admin/tryouts");
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

  const openNew = () => { setForm(EMPTY); setEditId(null); setOpen(true); };
  const openEdit = (t) => { setForm({ title: t.title, description: t.description || "", subject: t.subject, duration_minutes: t.duration_minutes, published: t.published, irt_scale: t.irt_scale || "snbt", irt_scale_custom: t.irt_scale_custom || EMPTY_CUSTOM, price: t.price || 0 }); setEditId(t.id); setOpen(true); };

  const save = async () => {
    const payload = { ...form, duration_minutes: parseInt(form.duration_minutes || 60, 10), price: Math.max(0, parseInt(form.price || 0, 10) || 0), irt_scale_custom: form.irt_scale === "custom" ? toCustomPayload(form.irt_scale_custom) : null };
    try {
      if (editId) {
        const { data: res } = await api.put(`/admin/tryouts/${editId}`, payload);
        toast.success(res?.rescored ? `Try Out tersimpan · ${res.rescored} hasil peserta dihitung ulang` : "Try Out tersimpan");
      } else { await api.post("/admin/tryouts", payload); toast.success("Try Out tersimpan"); }
      setOpen(false); refetch();
    } catch (e) { toast.error(apiError(e)); }
  };
  const del = async (id) => { try { await api.delete(`/admin/tryouts/${id}`); toast.success("Try Out dihapus"); refetch(); } catch (e) { toast.error(apiError(e)); } };

  return (
    <div data-testid="manage-tryouts">
      <PageHeader title="Bank Soal & Try Out" subtitle="Buat paket Try Out, kelola soal & kunci jawaban, atur waktu, dan lihat hasil."
        actions={<Button onClick={openNew} className="rounded-full bg-[#0E7490] hover:bg-[#0B5C74]" data-testid="add-tryout-btn"><Plus className="h-4 w-4" /> Buat Try Out</Button>} />

      {loading ? <Loading /> : !data?.length ? (
        <Empty icon={FileText} title="Belum ada Try Out" action={<Button onClick={openNew} className="rounded-full bg-[#0E7490]"><Plus className="h-4 w-4" /> Buat</Button>} />
      ) : (
        <div className="grid md:grid-cols-2 gap-5">
          {data.map((t) => (
            <div key={t.id} className="bg-white rounded-xl border border-[#E2E8F0] p-5" data-testid={`tryout-${t.id}`}>
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-[#EFF6F8] px-3 py-1 text-[11px] font-semibold text-[#475569]">{t.subject}</span>
                <span className={`text-[11px] font-semibold ${t.published ? "text-[#10B981]" : "text-[#94A3B8]"}`}>{t.published ? "Terbit" : "Draft"}</span>
              </div>
              <h3 className="mt-3 font-semibold text-[#0A1128]">{t.title}</h3>
              <div className="mt-2 flex items-center gap-4 text-xs text-[#94A3B8]">
                <span className="flex items-center gap-1"><HelpCircle className="h-3.5 w-3.5" /> {t.question_count} soal</span>
                <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {t.attempt_count} pengerjaan</span>
                <span>{t.duration_minutes} menit</span>
                <span className={`font-semibold ${t.price > 0 ? "text-[#C9A227]" : "text-[#10B981]"}`} data-testid={`tryout-price-badge-${t.id}`}>{t.price > 0 ? formatRupiah(t.price) : "Gratis"}</span>
              </div>
              <div className="mt-2"><span className="inline-flex items-center rounded-full border border-[#0E7490]/30 bg-[#E6F5F8] px-2.5 py-0.5 text-[11px] font-semibold text-[#0E7490]" data-testid={`tryout-scale-${t.id}`}>Skala IRT: {scaleLabel(t)}</span></div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => navigate(`/admin/tryouts/${t.id}/builder`)} className="rounded-full bg-[#0E7490] hover:bg-[#0B5C74]" data-testid={`build-${t.id}`}><Settings2 className="h-4 w-4" /> Kelola Soal</Button>
                <Button size="sm" variant="outline" onClick={() => navigate(`/admin/tryouts/${t.id}/results`)} className="rounded-full hover:bg-[#E6F5F8] hover:text-[#0E7490]" data-testid={`results-${t.id}`}><BarChart3 className="h-4 w-4" /> Hasil</Button>
                <Button size="sm" variant="ghost" onClick={() => openEdit(t)} className="rounded-full hover:bg-[#E6F5F8] hover:text-[#0E7490]" data-testid={`edit-tryout-${t.id}`}><Pencil className="h-4 w-4" /></Button>
                <ConfirmButton onConfirm={() => del(t.id)} trigger={<Button size="sm" variant="ghost" className="rounded-full hover:bg-red-50 hover:text-red-600" data-testid={`delete-tryout-${t.id}`}><Trash2 className="h-4 w-4" /></Button>} />
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editId ? "Edit Try Out" : "Buat Try Out"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Judul</Label><Input value={form.title} onChange={set("title")} className="mt-1.5" data-testid="tryout-title" /></div>
            <div><Label>Deskripsi</Label><Textarea value={form.description} onChange={set("description")} className="mt-1.5" data-testid="tryout-desc" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Mata Pelajaran</Label><Input value={form.subject} onChange={set("subject")} className="mt-1.5" data-testid="tryout-subject" /></div>
              <div><Label>Durasi (menit)</Label><Input type="number" value={form.duration_minutes} onChange={set("duration_minutes")} className="mt-1.5" data-testid="tryout-duration" /></div>
            </div>
            <div>
              <Label>Harga (Rp) — 0 = gratis</Label>
              <Input type="number" min="0" value={form.price} onChange={set("price")} className="mt-1.5" data-testid="tryout-price" />
              <p className="mt-1 text-xs text-[#94A3B8]">Try Out berbayar dibuka setelah siswa membayar via Midtrans (VA, QRIS, GoPay, kartu).</p>
            </div>
            <IrtScaleFields value={form.irt_scale} custom={form.irt_scale_custom} onChange={(v) => setForm((f) => ({ ...f, irt_scale: v }))} onCustomChange={(c) => setForm((f) => ({ ...f, irt_scale_custom: c }))} testIdPrefix="tryout-irt-scale" />
            <div className="flex items-center justify-between rounded-lg border border-[#E2E8F0] p-3">
              <div><Label>Terbitkan untuk siswa</Label><p className="text-xs text-[#94A3B8]">Siswa hanya melihat Try Out yang terbit.</p></div>
              <Switch checked={form.published} onCheckedChange={(v) => setForm((f) => ({ ...f, published: v }))} data-testid="tryout-published" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button onClick={save} className="bg-[#0E7490] hover:bg-[#0B5C74]" data-testid="save-tryout">Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
