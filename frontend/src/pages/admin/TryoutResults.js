import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Trophy, BarChart3 } from "lucide-react";
import useFetch from "@/hooks/useFetch";
import { Loading, Empty } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";

export default function TryoutResults() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading } = useFetch(`/admin/tryouts/${id}/results`);

  const avg = data?.length ? Math.round(data.reduce((a, x) => a + x.percentage, 0) / data.length) : 0;

  return (
    <div data-testid="tryout-results">
      <Button variant="ghost" onClick={() => navigate("/admin/tryouts")} className="mb-3 text-[#475569] hover:text-[#0E7490] hover:bg-[#E6F5F8]"><ArrowLeft className="h-4 w-4" /> Kembali</Button>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0A1128]">Hasil & Peringkat</h1>
          <p className="text-sm text-[#475569] mt-1">{data?.length || 0} peserta · Rata-rata {avg}%</p>
        </div>
      </div>

      {loading ? <Loading /> : !data?.length ? (
        <Empty icon={BarChart3} title="Belum ada peserta" desc="Hasil akan muncul setelah siswa mengerjakan." />
      ) : (
        <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#EFF6F8]">
                <TableHead className="w-16">Rank</TableHead>
                <TableHead>Siswa</TableHead>
                <TableHead>Skor</TableHead>
                <TableHead>Nilai</TableHead>
                <TableHead className="hidden md:table-cell">Skor IRT</TableHead>
                <TableHead className="hidden sm:table-cell">Waktu</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((a, i) => (
                <TableRow key={a.id} data-testid={`result-row-${i}`}>
                  <TableCell>
                    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${i < 3 ? "bg-[#FBF3DC] text-[#C9A227]" : "bg-[#EFF6F8] text-[#475569]"}`}>{i + 1}</span>
                  </TableCell>
                  <TableCell>
                    <p className="font-medium text-[#0A1128]">{a.student?.name || "-"}</p>
                    <p className="text-xs text-[#94A3B8]">{a.student?.email}</p>
                  </TableCell>
                  <TableCell className="font-mono2">{a.score}/{a.max_score}</TableCell>
                  <TableCell><span className="font-mono2 font-bold" style={{ color: a.percentage >= 70 ? "#10B981" : a.percentage >= 50 ? "#C9A227" : "#EF4444" }}>{a.percentage}%</span></TableCell>
                  <TableCell className="hidden md:table-cell" data-testid={`result-irt-${i}`}>
                    {a.irt_scaled != null ? (
                      <span className="font-mono2 font-semibold text-[#0E7490]">{a.irt_scaled}<span className="text-xs text-[#94A3B8]"> (θ {a.theta})</span></span>
                    ) : <span className="text-xs text-[#94A3B8]">—</span>}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-xs text-[#94A3B8]">{formatDateTime(a.submitted_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
