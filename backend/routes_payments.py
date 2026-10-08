from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import Optional

from database import db
from utils import new_id, now_iso
from security import require_roles
import payments as mt

router = APIRouter(prefix="/api/payments", tags=["payments"])
student_only = require_roles("student")
admin_only = require_roles("admin")


class CheckoutBody(BaseModel):
    item_type: str  # course | tryout
    item_id: str
    finish_url: Optional[str] = None


def _public(o: dict):
    return {k: v for k, v in o.items() if k not in ("_id", "midtrans_raw")}


@router.get("/config")
async def payment_config():
    return {"enabled": mt.enabled(), "client_key": mt.client_key() if mt.enabled() else None,
            "is_production": mt.is_production(), "snap_js_url": mt.snap_js_url()}


async def _load_item(item_type: str, item_id: str):
    if item_type == "course":
        it = await db.courses.find_one({"id": item_id, "active": True}, {"_id": 0})
    elif item_type == "tryout":
        it = await db.tryouts.find_one({"id": item_id, "published": True}, {"_id": 0})
    else:
        raise HTTPException(status_code=400, detail="Jenis item tidak valid")
    if not it:
        raise HTTPException(status_code=404, detail="Item tidak ditemukan")
    return it


async def _already_has_access(item_type, item_id, sid):
    if item_type == "course":
        return bool(await db.enrollments.find_one({"course_id": item_id, "student_id": sid}))
    return bool(await db.tryout_access.find_one({"tryout_id": item_id, "student_id": sid}))


@router.post("/checkout")
async def checkout(body: CheckoutBody, user: dict = Depends(student_only)):
    item = await _load_item(body.item_type, body.item_id)
    sid = user["id"]
    if await _already_has_access(body.item_type, body.item_id, sid):
        raise HTTPException(status_code=400, detail="Anda sudah memiliki akses item ini")
    price = int(item.get("price") or 0)
    order = {
        "id": new_id(), "order_id": f"BNR-{body.item_type[:2].upper()}-{new_id()[:12].upper()}",
        "student_id": sid, "item_type": body.item_type, "item_id": body.item_id,
        "item_title": item.get("title"), "amount": price, "status": "created",
        "created_at": now_iso(), "fulfilled_at": None,
    }
    if price <= 0:
        order["status"] = "paid"
        await db.payments.insert_one(order)
        await mt.fulfill(order)
        return {"free": True, "order_id": order["order_id"]}
    if not mt.enabled():
        raise HTTPException(status_code=503, detail="Pembayaran belum dikonfigurasi (MIDTRANS_SERVER_KEY/CLIENT_KEY kosong). Hubungi admin.")

    pending = await db.payments.find_one(
        {"student_id": sid, "item_type": body.item_type, "item_id": body.item_id,
         "status": {"$in": ["created", "pending"]}, "snap_token": {"$exists": True}}, {"_id": 0})
    if pending:
        return {"free": False, "order_id": pending["order_id"], "token": pending["snap_token"],
                "redirect_url": pending.get("redirect_url"), "reused": True}

    await db.payments.insert_one(order)
    snap, err = await mt.create_snap_transaction(
        order, {"name": user.get("name"), "email": user.get("email"), "phone": user.get("phone")}, body.finish_url)
    if not snap:
        await db.payments.update_one({"order_id": order["order_id"]}, {"$set": {"status": "token_failed", "error": err}})
        raise HTTPException(status_code=502, detail="Gagal membuat transaksi Midtrans")
    await db.payments.update_one({"order_id": order["order_id"]},
                                 {"$set": {"snap_token": snap["token"], "redirect_url": snap.get("redirect_url")}})
    return {"free": False, "order_id": order["order_id"], "token": snap["token"], "redirect_url": snap.get("redirect_url")}


@router.post("/notification")
async def notification(request: Request):
    """Webhook Midtrans (Payment Notification URL). Idempotent & terverifikasi."""
    body = await request.json()
    if not mt.enabled() or not mt.valid_signature(body):
        raise HTTPException(status_code=401, detail="Signature tidak valid")
    order = await db.payments.find_one({"order_id": body.get("order_id")}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order tidak dikenal")
    verified = await mt.fetch_status(order["order_id"])
    if not verified:
        raise HTTPException(status_code=502, detail="Gagal verifikasi status ke Midtrans")
    status = await mt.apply_status(order, verified)
    return {"ok": True, "status": status}


@router.get("/mine")
async def my_payments(user: dict = Depends(student_only)):
    rows = await db.payments.find({"student_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [_public(r) for r in rows]


@router.get("/admin/all")
async def all_payments(user: dict = Depends(admin_only)):
    rows = await db.payments.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    sids = list({r["student_id"] for r in rows})
    students = await db.users.find({"id": {"$in": sids}}, {"_id": 0, "id": 1, "name": 1, "email": 1}).to_list(5000)
    smap = {s["id"]: s for s in students}
    for r in rows:
        r["student"] = smap.get(r["student_id"])
    return [_public(r) for r in rows]


@router.get("/{order_id}/status")
async def order_status(order_id: str, user: dict = Depends(student_only)):
    """Sinkronkan status dari Midtrans (fallback bila webhook belum sampai)."""
    order = await db.payments.find_one({"order_id": order_id, "student_id": user["id"]}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order tidak ditemukan")
    if order["status"] != "paid" and mt.enabled() and order.get("snap_token"):
        verified = await mt.fetch_status(order_id)
        if verified and verified.get("status_code") != "404":
            await mt.apply_status(order, verified)
            order = await db.payments.find_one({"order_id": order_id}, {"_id": 0})
    return _public(order)
