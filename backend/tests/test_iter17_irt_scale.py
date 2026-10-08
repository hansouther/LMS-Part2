"""Backend tests for Iter17: configurable IRT score scale per Try Out.

Covers:
- GET /api/admin/irt-scales presets
- GET/PUT /api/admin/tryouts/{id}/irt-scale (snbt, tka, raw, custom)
- Full PUT /api/admin/tryouts/{id} re-scoring on scale change
- POST /api/admin/tryouts default/custom irt_scale
"""
import os
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": "admin@lms.id", "password": "Admin@12345"})
    assert r.status_code == 200, r.text
    return s


# ---------- Presets ----------
def test_get_irt_scale_presets(admin):
    r = admin.get(f"{BASE}/api/admin/irt-scales")
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list)
    keys = {p["key"] for p in data}
    assert {"snbt", "tka", "raw", "custom"} <= keys
    snbt = next(p for p in data if p["key"] == "snbt")
    assert snbt["min"] == 0 and snbt["max"] == 1000 and snbt["mean"] == 500 and snbt["sd"] == 100
    tka = next(p for p in data if p["key"] == "tka")
    assert tka["min"] == 200 and tka["max"] == 700
    raw = next(p for p in data if p["key"] == "raw")
    assert raw["show_irt"] is False


# ---------- PUT scale: tka ----------
def test_put_scale_tka_and_results(admin):
    r = admin.put(f"{BASE}/api/admin/tryouts/to_1/irt-scale",
                  json={"irt_scale": "tka"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["rescored"] == 7, d
    assert d["effective"]["label"] == "TKA SMA (200–700)"
    assert d["irt_scale"] == "tka"

    res = admin.get(f"{BASE}/api/admin/tryouts/to_1/results").json()
    assert len(res) >= 1
    for a in res:
        if a.get("irt_scaled") is not None:
            assert 200 <= a["irt_scaled"] <= 700, a
            assert a.get("irt_scale_label") == "TKA SMA (200–700)"


# ---------- PUT scale: raw hides IRT ----------
def test_put_scale_raw_hides_irt(admin):
    r = admin.put(f"{BASE}/api/admin/tryouts/to_1/irt-scale",
                  json={"irt_scale": "raw"})
    assert r.status_code == 200, r.text
    assert r.json()["effective"]["show_irt"] is False

    res = admin.get(f"{BASE}/api/admin/tryouts/to_1/results").json()
    assert len(res) >= 1
    for a in res:
        assert a.get("irt_scaled") is None, a
        assert a.get("theta") is None, a


# ---------- Custom scale validation ----------
def test_put_scale_custom_invalid_min_max(admin):
    r = admin.put(f"{BASE}/api/admin/tryouts/to_1/irt-scale",
                  json={"irt_scale": "custom",
                        "irt_scale_custom": {"min": 500, "max": 100, "mean": 300, "sd": 40}})
    assert r.status_code == 400, r.text
    detail = r.json().get("detail", "")
    # Indonesian error
    assert "maksimum" in detail.lower() or "minimum" in detail.lower()


def test_put_scale_custom_valid(admin):
    r = admin.put(f"{BASE}/api/admin/tryouts/to_1/irt-scale",
                  json={"irt_scale": "custom",
                        "irt_scale_custom": {"min": 100, "max": 300, "mean": 200, "sd": 40}})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["effective"]["label"] == "Kustom (100–300)"
    assert d["rescored"] >= 1

    res = admin.get(f"{BASE}/api/admin/tryouts/to_1/results").json()
    for a in res:
        if a.get("irt_scaled") is not None:
            assert 100 <= a["irt_scaled"] <= 300, a
            assert a.get("irt_scale_label") == "Kustom (100–300)"


def test_put_scale_invalid_key(admin):
    r = admin.put(f"{BASE}/api/admin/tryouts/to_1/irt-scale",
                  json={"irt_scale": "bogus"})
    assert r.status_code == 400


# ---------- Full tryout PUT w/ irt_scale ----------
def test_full_tryout_put_with_scale_restores_snbt(admin):
    # Get current tryout
    tos = admin.get(f"{BASE}/api/admin/tryouts").json()
    t = next(x for x in tos if x["id"] == "to_1")

    body = {
        "title": t["title"],
        "description": t.get("description"),
        "subject": t["subject"],
        "duration_minutes": t.get("duration_minutes", 60),
        "start_at": t.get("start_at"),
        "end_at": t.get("end_at"),
        "published": bool(t.get("published", True)),
        "course_id": t.get("course_id"),
        "kind": t.get("kind", "standalone"),
        "irt_scale": "snbt",
        "irt_scale_custom": None,
    }
    r = admin.put(f"{BASE}/api/admin/tryouts/to_1", json=body)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["ok"] is True
    assert d["rescored"] == 7, d

    g = admin.get(f"{BASE}/api/admin/tryouts/to_1/irt-scale").json()
    assert g["irt_scale"] == "snbt"
    assert g["effective"]["label"] == "SNBT (0–1000)"

    res = admin.get(f"{BASE}/api/admin/tryouts/to_1/results").json()
    # 100% student near mean + 1*sd typically → around 500-600 for snbt
    top = max(res, key=lambda a: a.get("percentage", 0))
    assert top.get("irt_scaled") is not None
    assert 400 <= top["irt_scaled"] <= 700, top


# ---------- POST new tryout defaults + custom ----------
def test_create_tryout_default_snbt(admin):
    body = {"title": "TEST_IRT_default", "subject": "Mat", "duration_minutes": 10,
            "published": False, "kind": "standalone"}
    r = admin.post(f"{BASE}/api/admin/tryouts", json=body)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["irt_scale"] == "snbt"
    tid = d["id"]
    admin.delete(f"{BASE}/api/admin/tryouts/{tid}")


def test_create_tryout_tka(admin):
    body = {"title": "TEST_IRT_tka", "subject": "Mat", "duration_minutes": 10,
            "published": False, "kind": "standalone", "irt_scale": "tka"}
    r = admin.post(f"{BASE}/api/admin/tryouts", json=body)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["irt_scale"] == "tka"
    tid = d["id"]
    admin.delete(f"{BASE}/api/admin/tryouts/{tid}")
