import { useState } from "react";
import { Wallet, RefreshCw, ExternalLink } from "lucide-react";
import useFetch from "@/hooks/useFetch";
import api, { apiError } from "@/lib/api";
import PageHeader from "@/components/common/PageHeader";
import { Loading, Empty } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah, formatDateTime } from "@/lib/format";
import { PAY_STATUS } from "@/lib/midtrans";
import { toast } from "sonner";

const TYPE_LABEL = { course: "Kursus", tryout: "Try Out" };

export default function StudentPayments() {
  const { data, loading, refetch } = useFetch("/payments/mine");
  const [busy, setBusy] = useState(null);

  const sync = async (orderId) => {
    setBusy(orderId);
    try {
      const { data: o } = await api.get(`/payments/${orderId}/status`);
      toast[o.status === "paid" ? "success" : "info"](`Status: ${PAY_STATUS[o.status]?.label || o.status}`);
      refetch();
    } catch (e) { toast.error(apiError(e)); }
    finally { setBusy(null); }
  };

  return (
    <div data-testid="student-payments">
      <PageHeader title="Riwayat Pembayaran" subtitle="Transaksi pembelian Try Out & kursus melalui Midtrans." />
      {loading ? <Loading /> : !data?.length ? (
        <Empty icon={Wallet} title="Belum ada transaksi" desc="Pembelian Try Out berbayar atau kursus akan tercatat di sini." />
      ) : (
        <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#EFF6F8]">
                <TableHead>Order</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Jumlah</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Waktu</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((o) => {
                const st = PAY_STATUS[o.status] || PAY_STATUS.created;
                return (
                  <TableRow key={o.order_id} data-testid={`payment-row-${o.order_id}`}>
                    <TableCell className="font-mono2 text-xs">{o.order_id}</TableCell>
                    <TableCell><p className="font-medium text-[#0A1128]">{o.item_title}</p><p className="text-xs text-[#94A3B8]">{TYPE_LABEL[o.item_type]}{o.payment_type ? ` · ${o.payment_type}` : ""}</p></TableCell>
                    <TableCell className="font-mono2">{o.amount > 0 ? formatRupiah(o.amount) : "Gratis"}</TableCell>
                    <TableCell><span className="rounded-full px-3 py-1 text-[11px] font-semibold" style={{ color: st.color, backgroundColor: st.bg }} data-testid={`payment-status-${o.order_id}`}>{st.label}</span></TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-[#94A3B8]">{formatDateTime(o.created_at)}</TableCell>
                    <TableCell className="text-right">
                      {o.status !== "paid" && o.amount > 0 && (
                        <div className="flex justify-end gap-1">
                          {o.redirect_url && <Button size="sm" variant="outline" className="rounded-full" onClick={() => window.open(o.redirect_url, "_blank")} data-testid={`pay-continue-${o.order_id}`}><ExternalLink className="h-3.5 w-3.5" /> Bayar</Button>}
                          <Button size="sm" variant="ghost" className="rounded-full" disabled={busy === o.order_id} onClick={() => sync(o.order_id)} data-testid={`pay-sync-${o.order_id}`}><RefreshCw className={`h-3.5 w-3.5 ${busy === o.order_id ? "animate-spin" : ""}`} /> Cek</Button>
                        </div>
                      )}
                    </TableCell>
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
