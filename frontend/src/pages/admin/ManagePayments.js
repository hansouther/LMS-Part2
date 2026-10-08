import { Wallet, CheckCircle2, AlertTriangle } from "lucide-react";
import useFetch from "@/hooks/useFetch";
import PageHeader from "@/components/common/PageHeader";
import { Loading, Empty } from "@/components/common/States";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah, formatDateTime } from "@/lib/format";
import { PAY_STATUS } from "@/lib/midtrans";

const TYPE_LABEL = { course: "Kursus", tryout: "Try Out" };

export default function ManagePayments() {
  const { data, loading } = useFetch("/payments/admin/all");
  const { data: cfg } = useFetch("/payments/config");
  const paid = (data || []).filter((o) => o.status === "paid" && o.amount > 0);
  const revenue = paid.reduce((a, o) => a + o.amount, 0);

  return (
    <div data-testid="manage-payments">
      <PageHeader title="Pembayaran (Midtrans)" subtitle="Transaksi pembelian Try Out & kursus online oleh siswa." />

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-4"><p className="text-xs text-[#94A3B8]">Total Pendapatan (lunas)</p><p className="mt-1 font-head text-xl font-bold text-[#0E7490]" data-testid="payments-revenue">{revenue > 0 ? formatRupiah(revenue) : "Rp 0"}</p></div>
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-4"><p className="text-xs text-[#94A3B8]">Transaksi Lunas</p><p className="mt-1 font-head text-xl font-bold text-[#10B981]">{paid.length}</p></div>
        <div className={`rounded-xl border p-4 ${cfg?.enabled ? "bg-[#ECFDF5] border-[#10B981]/30" : "bg-[#FBF3DC] border-[#C9A227]/40"}`} data-testid="midtrans-config-status">
          <p className="text-xs text-[#94A3B8]">Status Konfigurasi Midtrans</p>
          <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-[#0A1128]">
            {cfg?.enabled ? <><CheckCircle2 className="h-4 w-4 text-[#10B981]" /> Aktif · {cfg.is_production ? "Production" : "Sandbox"}</> : <><AlertTriangle className="h-4 w-4 text-[#C9A227]" /> Belum dikonfigurasi</>}
          </p>
          {!cfg?.enabled && <p className="mt-1 text-[11px] text-[#475569]">Isi <code>MIDTRANS_SERVER_KEY</code> & <code>MIDTRANS_CLIENT_KEY</code> di <code>backend/.env</code> lalu restart backend.</p>}
        </div>
      </div>

      {loading ? <Loading /> : !data?.length ? (
        <Empty icon={Wallet} title="Belum ada transaksi" desc="Transaksi siswa akan muncul di sini." />
      ) : (
        <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#EFF6F8]">
                <TableHead>Order</TableHead>
                <TableHead>Siswa</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Jumlah</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Waktu</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((o) => {
                const st = PAY_STATUS[o.status] || PAY_STATUS.created;
                return (
                  <TableRow key={o.order_id} data-testid={`admin-payment-${o.order_id}`}>
                    <TableCell className="font-mono2 text-xs">{o.order_id}</TableCell>
                    <TableCell><p className="font-medium text-[#0A1128]">{o.student?.name || "-"}</p><p className="text-xs text-[#94A3B8]">{o.student?.email}</p></TableCell>
                    <TableCell><p className="text-sm text-[#0A1128]">{o.item_title}</p><p className="text-xs text-[#94A3B8]">{TYPE_LABEL[o.item_type]}{o.payment_type ? ` · ${o.payment_type}` : ""}</p></TableCell>
                    <TableCell className="font-mono2">{o.amount > 0 ? formatRupiah(o.amount) : "Gratis"}</TableCell>
                    <TableCell><span className="rounded-full px-3 py-1 text-[11px] font-semibold" style={{ color: st.color, backgroundColor: st.bg }}>{st.label}</span></TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-[#94A3B8]">{formatDateTime(o.created_at)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
