import api, { apiError } from "@/lib/api";
import { toast } from "sonner";

let snapReady = null;

export async function getPaymentConfig() {
  const { data } = await api.get("/payments/config");
  return data;
}

async function loadSnap(cfg) {
  if (window.snap) return true;
  if (snapReady) return snapReady;
  snapReady = new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = cfg.snap_js_url;
    s.setAttribute("data-client-key", cfg.client_key);
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => { snapReady = null; resolve(false); };
    document.body.appendChild(s);
  });
  return snapReady;
}

// Bayar item (course | tryout). onPaid dipanggil setelah status terverifikasi ke server.
export async function payItem(itemType, itemId, { onPaid, onPending } = {}) {
  let res;
  try {
    res = (await api.post("/payments/checkout", { item_type: itemType, item_id: itemId, finish_url: `${window.location.origin}/student/payments` })).data;
  } catch (e) { toast.error(apiError(e)); return; }
  if (res.free) { toast.success("Akses diberikan (gratis)"); onPaid?.(res); return; }

  const cfg = await getPaymentConfig();
  const ok = cfg.enabled && (await loadSnap(cfg));
  if (!ok) { toast.error("Pembayaran belum tersedia. Hubungi admin."); return; }

  const sync = async () => {
    try {
      const { data } = await api.get(`/payments/${res.order_id}/status`);
      if (data.status === "paid") { toast.success("Pembayaran berhasil! Akses sudah aktif."); onPaid?.(data); }
      else { toast.info("Pembayaran menunggu konfirmasi. Cek Riwayat Pembayaran."); onPending?.(data); }
    } catch { onPending?.(); }
  };
  window.snap.pay(res.token, {
    onSuccess: sync,
    onPending: sync,
    onError: () => toast.error("Pembayaran gagal. Silakan coba lagi."),
    onClose: () => toast.info("Jendela pembayaran ditutup. Anda bisa melanjutkan dari Riwayat Pembayaran."),
  });
}

export const PAY_STATUS = {
  paid: { label: "Lunas", color: "#10B981", bg: "#ECFDF5" },
  pending: { label: "Menunggu", color: "#C9A227", bg: "#FBF3DC" },
  created: { label: "Belum Dibayar", color: "#0E7490", bg: "#E6F5F8" },
  failed: { label: "Gagal/Kedaluwarsa", color: "#EF4444", bg: "#FEF2F2" },
  token_failed: { label: "Gagal Dibuat", color: "#EF4444", bg: "#FEF2F2" },
};
