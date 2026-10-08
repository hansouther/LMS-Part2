"""Iteration 18 — Midtrans Payments (disabled by design) & paid-tryout gating.

Covers:
- /api/payments/config returns enabled=false and sandbox snap_js_url
- paid tryout gating: list has_access, start/detail -> 402
- checkout: free course grants access, paid tryout/course -> 503, repeat -> 400
- notification bad signature -> 401; invalid item_type -> 400; unknown status -> 404
- non-student checkout -> 403
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or \
    open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip()
API = f"{BASE_URL}/api"


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def admin():
    return _login("admin@lms.id", "Admin@12345")


@pytest.fixture(scope="module")
def student():
    return _login("maya@lms.id", "Siswa@12345")


@pytest.fixture(scope="module")
def tutor():
    return _login("tutor@lms.id", "Tutor@12345")


@pytest.fixture(scope="module")
def created(admin):
    """Create a paid tryout, a free course and a paid course for testing. Clean up at end."""
    state = {"paid_tryout_id": None, "free_course_id": None, "paid_course_id": None}

    r = admin.post(f"{API}/admin/tryouts", json={
        "title": "TEST_ITER18 Paid Tryout",
        "subject": "SNBT",
        "duration_minutes": 60,
        "published": True,
        "kind": "standalone",
        "price": 25000,
    }, timeout=20)
    assert r.status_code in (200, 201), r.text
    state["paid_tryout_id"] = r.json()["id"]

    r = admin.post(f"{API}/admin/courses", json={
        "title": "TEST_ITER18 Free Course", "description": "free", "subject": "SNBT", "price": 0,
    }, timeout=20)
    assert r.status_code in (200, 201), r.text
    state["free_course_id"] = r.json()["id"]

    r = admin.post(f"{API}/admin/courses", json={
        "title": "TEST_ITER18 Paid Course", "description": "paid", "subject": "SNBT", "price": 50000,
    }, timeout=20)
    assert r.status_code in (200, 201), r.text
    state["paid_course_id"] = r.json()["id"]

    yield state

    # Cleanup via admin endpoints if available
    for cid in (state["free_course_id"], state["paid_course_id"]):
        try:
            admin.delete(f"{API}/admin/courses/{cid}", timeout=10)
        except Exception:
            pass
    try:
        admin.delete(f"{API}/admin/tryouts/{state['paid_tryout_id']}", timeout=10)
    except Exception:
        pass


# ---------- payments/config ----------
def test_payments_config_disabled():
    r = requests.get(f"{API}/payments/config", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["enabled"] is False
    assert data["client_key"] is None
    assert data["is_production"] is False
    assert "sandbox" in data["snap_js_url"]


# ---------- tryouts list exposes price/has_access ----------
def test_student_tryouts_price_and_access(student, created):
    r = student.get(f"{API}/student/tryouts", timeout=20)
    assert r.status_code == 200, r.text
    rows = r.json()
    by_id = {t["id"]: t for t in rows}
    paid = by_id.get(created["paid_tryout_id"])
    assert paid is not None, "paid tryout missing from list"
    assert paid["price"] == 25000
    assert paid["has_access"] is False

    seeds = [t for t in rows if t["id"].startswith("to_")]
    assert seeds, "no seed tryouts found"
    for t in seeds[:3]:
        assert int(t.get("price") or 0) == 0
        assert t["has_access"] is True


# ---------- paid tryout 402 gates ----------
def test_paid_tryout_detail_and_start_402(student, created):
    pid = created["paid_tryout_id"]
    r = student.get(f"{API}/student/tryouts/{pid}", timeout=15)
    assert r.status_code == 402, r.text
    r = student.post(f"{API}/student/tryouts/{pid}/start", timeout=15)
    assert r.status_code == 402, r.text


# ---------- checkout paid tryout -> 503 ----------
def test_checkout_paid_tryout_503(student, created):
    r = student.post(f"{API}/payments/checkout",
                     json={"item_type": "tryout", "item_id": created["paid_tryout_id"]}, timeout=15)
    assert r.status_code == 503, r.text
    assert "MIDTRANS" in r.text.upper() or "dikonfigurasi" in r.text.lower()


# ---------- free course checkout flow ----------
def test_free_course_checkout_grants_access(student, created, admin):
    cid = created["free_course_id"]
    r = student.post(f"{API}/payments/checkout",
                     json={"item_type": "course", "item_id": cid}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("free") is True
    assert data.get("order_id")

    # enrolled now
    r = student.get(f"{API}/student/courses", timeout=15)
    assert r.status_code == 200
    enrolled = [c for c in r.json() if c["id"] == cid]
    assert enrolled, "student not enrolled after free checkout"
    assert enrolled[0].get("enrolled") is True

    # mine shows paid 0
    r = student.get(f"{API}/payments/mine", timeout=15)
    assert r.status_code == 200
    orders = [o for o in r.json() if o.get("item_id") == cid]
    assert orders, "order missing in /payments/mine"
    assert orders[0]["status"] == "paid"
    assert orders[0]["amount"] == 0

    # repeat -> 400
    r = student.post(f"{API}/payments/checkout",
                     json={"item_type": "course", "item_id": cid}, timeout=15)
    assert r.status_code == 400
    assert "akses" in r.text.lower() or "memiliki" in r.text.lower()

    # admin all includes with student info
    r = admin.get(f"{API}/payments/admin/all", timeout=15)
    assert r.status_code == 200
    rows = [o for o in r.json() if o.get("item_id") == cid]
    assert rows and rows[0].get("student") and rows[0]["student"].get("email") == "maya@lms.id"


# ---------- paid course gating ----------
def test_paid_course_enroll_and_checkout(student, created):
    cid = created["paid_course_id"]
    r = student.post(f"{API}/student/courses/{cid}/enroll", timeout=15)
    assert r.status_code == 402, r.text
    r = student.post(f"{API}/payments/checkout",
                     json={"item_type": "course", "item_id": cid}, timeout=15)
    assert r.status_code == 503, r.text


# ---------- validation / error paths ----------
def test_notification_bad_signature(student):
    r = requests.post(f"{API}/payments/notification",
                      json={"order_id": "x", "status_code": "200",
                            "gross_amount": "10000", "signature_key": "bogus"}, timeout=15)
    assert r.status_code == 401


def test_checkout_invalid_item_type(student, created):
    r = student.post(f"{API}/payments/checkout",
                     json={"item_type": "wrong", "item_id": created["free_course_id"]}, timeout=15)
    assert r.status_code == 400


def test_order_status_unknown_404(student):
    r = student.get(f"{API}/payments/UNKNOWN-ORDER-XYZ/status", timeout=15)
    assert r.status_code == 404


def test_non_student_checkout_403(tutor, created):
    r = tutor.post(f"{API}/payments/checkout",
                   json={"item_type": "course", "item_id": created["free_course_id"]}, timeout=15)
    assert r.status_code == 403
