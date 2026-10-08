import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, CheckCircle2, Loader2, PlayCircle, CreditCard } from "lucide-react";
import useFetch from "@/hooks/useFetch";
import api, { apiError } from "@/lib/api";
import PageHeader from "@/components/common/PageHeader";
import { Loading, Empty } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { formatRupiah } from "@/lib/format";
import { payItem } from "@/lib/midtrans";
import { toast } from "sonner";

export default function CourseCatalog() {
  const { data, loading, refetch } = useFetch("/student/courses");
  const navigate = useNavigate();
  const [busy, setBusy] = useState(null);

  const enroll = async (c) => {
    setBusy(c.id);
    try {
      if ((c.price || 0) > 0) {
        await payItem("course", c.id, { onPaid: refetch });
        return;
      }
      await api.post(`/student/courses/${c.id}/enroll`);
      toast.success("Berhasil mendaftar kursus!");
      refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div data-testid="course-catalog">
      <PageHeader title="Katalog Kursus" subtitle="Pilih kursus aktif dan daftarkan diri Anda untuk mulai belajar." />

      {loading ? <Loading /> : !data?.length ? (
        <Empty icon={BookOpen} title="Belum ada kursus" desc="Kursus aktif akan ditampilkan di sini." />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.map((c) => (
            <div key={c.id} className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden flex flex-col hover:-translate-y-1 transition-transform duration-200" data-testid={`course-${c.id}`}>
              <div className="h-36 bg-gradient-to-br from-[#0E7490] to-[#7C3AED] relative">
                {c.thumbnail && <img src={c.thumbnail} alt="" className="h-full w-full object-cover" />}
                <span className="absolute top-3 left-3 rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold text-[#0A1128]">{c.subject}</span>
              </div>
              <div className="p-5 flex flex-col flex-1">
                <p className="text-xs text-[#94A3B8]">{c.level}</p>
                <h3 className="mt-1 font-semibold text-[#0A1128]">{c.title}</h3>
                <p className="mt-2 text-sm text-[#475569] line-clamp-2 flex-1">{c.description}</p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="font-head font-bold text-[#0E7490]">{formatRupiah(c.price)}</span>
                  {c.enrolled ? (
                    <Button onClick={() => navigate(`/student/courses/${c.id}/learn`)} size="sm" className="rounded-full bg-[#10B981] hover:bg-[#0ea371]" data-testid={`open-course-${c.id}`}><PlayCircle className="h-4 w-4" /> Buka Kelas</Button>
                  ) : (
                    <Button onClick={() => enroll(c)} disabled={busy === c.id} className="rounded-full bg-[#0E7490] hover:bg-[#0B5C74]" size="sm" data-testid={`enroll-${c.id}`}>
                      {busy === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : (c.price || 0) > 0 ? <><CreditCard className="h-4 w-4" /> Beli & Daftar</> : "Daftar"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
