"""Integrasi Midtrans Snap untuk pembayaran Try Out & kursus/kelas online.

Kunci diambil dari .env: MIDTRANS_SERVER_KEY, MIDTRANS_CLIENT_KEY,
MIDTRANS_IS_PRODUCTION (true/false). Bila kunci kosong, fitur pembayaran
berbayar dinonaktifkan (item gratis tetap bisa diakses).
"""
import os
import hashlib
import hmac
import httpx

from database import db
from utils import new_id, now_iso


def server_key():
    return os.environ.get("MIDTRANS_SERVER_KEY", "").strip()


def client_key():
    return os.environ.get("MIDTRANS_CLIENT_KEY", "").strip()


def is_production():
    return os.environ.get("MIDTRANS_IS_PRODUCTION", "false").strip().lower() in ("1", "true", "yes")


def enabled():
    return bool(server_key() and client_key())


def snap_url():
    return ("https://app.midtrans.com/snap/v1/transactions" if is_production()
            else "https://app.sandbox.midtrans.com/snap/v1/transactions")


def api_base():
    return "https://api.midtrans.com" if is_production() else "https://api.sandbox.midtrans.com"


def snap_js_url():
    return "https://app.midtrans.com/snap/snap.js" if is_production() else "https://app.sandbox.midtrans.com/snap/snap.js"


def valid_signature(payload: dict) -> bool:
    raw = (str(payload.get("order_id", "")) + str(payload.get("status_code", ""))
           + str(payload.get("gross_amount", "")) + server_key())
    expected = hashlib.sha512(raw.encode()).hexdigest()
    supplied = str(payload.get("signature_key", ""))
    return bool(supplied) and hmac.compare_digest(expected, supplied)


def map_status(tx_status, fraud_status):
    if tx_status in ("capture", "settlement") and fraud_status in (None, "accept"):
        return "paid"
    if tx_status in ("deny", "cancel", "expire", "failure"):
        return "failed"
    return "pending"


async def create_snap_transaction(order: dict, customer: dict, finish_url: str | None):
    payload = {
        "transaction_details": {"order_id": order["order_id"], "gross_amount": int(order["amount"])},
        "item_details": [{
            "id": order["item_id"], "price": int(order["amount"]), "quantity": 1,
            "name": (order["item_title"] or "Item")[:50],
        }],
        "customer_details": {"first_name": (customer.get("name") or "Siswa")[:50],
                             "email": customer.get("email"),
                             **({"phone": customer["phone"]} if customer.get("phone") else {})},
        "expiry": {"unit": "hours", "duration": 24},
    }
    if finish_url:
        payload["callbacks"] = {"finish": finish_url}
    async with httpx.AsyncClient(timeout=20) as cli:
        res = await cli.post(snap_url(), json=payload, auth=(server_key(), ""),
                             headers={"Accept": "application/json"})
    if res.status_code not in (200, 201):
        return None, res.text[:300]
    return res.json(), None


async def fetch_status(order_id: str):
    async with httpx.AsyncClient(timeout=20) as cli:
        res = await cli.get(f"{api_base()}/v2/{order_id}/status", auth=(server_key(), ""))
    if res.status_code != 200:
        return None
    return res.json()


async def fulfill(order: dict):
    """Berikan akses setelah pembayaran sukses (idempotent)."""
    sid, item_id = order["student_id"], order["item_id"]
    if order["item_type"] == "course":
        if not await db.enrollments.find_one({"course_id": item_id, "student_id": sid}):
            await db.enrollments.insert_one({
                "id": new_id(), "course_id": item_id, "student_id": sid, "status": "active",
                "enrolled_at": now_iso(), "payment_id": order["order_id"],
            })
    elif order["item_type"] == "tryout":
        if not await db.tryout_access.find_one({"tryout_id": item_id, "student_id": sid}):
            await db.tryout_access.insert_one({
                "id": new_id(), "tryout_id": item_id, "student_id": sid,
                "granted_at": now_iso(), "payment_id": order["order_id"],
            })
    await db.payments.update_one({"order_id": order["order_id"]}, {"$set": {"fulfilled_at": now_iso()}})


async def apply_status(order: dict, verified: dict):
    """Simpan status transaksi terverifikasi; fulfil bila lunas & belum di-fulfil."""
    tx = verified.get("transaction_status")
    fraud = verified.get("fraud_status")
    new_status = map_status(tx, fraud)
    await db.payments.update_one({"order_id": order["order_id"]}, {"$set": {
        "status": new_status, "transaction_status": tx, "fraud_status": fraud,
        "payment_type": verified.get("payment_type"), "transaction_time": verified.get("transaction_time"),
        "settlement_time": verified.get("settlement_time"), "updated_at": now_iso(),
    }})
    if new_status == "paid" and not order.get("fulfilled_at"):
        await fulfill(order)
    return new_status
