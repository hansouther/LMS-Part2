"""Backend tests for Iter16: IRT additions (3PL)."""
import os
import io
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": "admin@lms.id", "password": "Admin@12345"})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def student():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": "siswa@lms.id", "password": "Siswa@12345"})
    assert r.status_code == 200, r.text
    return s


# ---------- IRT blueprint ----------
def test_blueprint_to_1(admin):
    r = admin.get(f"{BASE}/api/admin/tryouts/to_1/irt-blueprint")
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ("composition", "target_counts", "gaps", "tif", "tif_peak", "recommendations", "calibrated_count"):
        assert k in d, f"missing {k}"
    assert set(d["composition"].keys()) == {"mudah", "sedang", "sulit"}
    assert isinstance(d["tif"], list) and len(d["tif"]) > 0
    assert "theta" in d["tif"][0] and "information" in d["tif"][0]


def test_blueprint_to_3_exists(admin):
    r = admin.get(f"{BASE}/api/admin/tryouts/to_3/irt-blueprint")
    assert r.status_code == 200
    assert "total" in r.json()


# ---------- Calibrate ----------
def test_calibrate_to_1(admin):
    r = admin.post(f"{BASE}/api/admin/tryouts/to_1/calibrate")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["calibrated"] == 5, d
    assert d["total_questions"] >= 5
    assert d["attempts_scored"] >= 1

    # verify questions got irt params
    qs = admin.get(f"{BASE}/api/admin/tryouts/to_1/questions").json()
    cal = [q for q in qs if q.get("irt_calibrated")]
    assert len(cal) == 5
    for q in cal:
        assert q["irt_a"] is not None and q["irt_b"] is not None and q["irt_c"] is not None

    # results now have theta
    res = admin.get(f"{BASE}/api/admin/tryouts/to_1/results").json()
    assert len(res) >= 1
    with_theta = [a for a in res if a.get("theta") is not None]
    assert len(with_theta) >= 1
    for a in with_theta:
        assert a.get("irt_scaled") is not None


# ---------- Question create with difficulty_label ----------
def test_create_question_with_difficulty(admin):
    # pick first tryout that is exercise (to_3) to avoid polluting ranked results
    body = {
        "type": "single",
        "text": "TEST_IRT_Q apa 1+1?",
        "options": [{"id": "o1", "text": "1"}, {"id": "o2", "text": "2"}],
        "correct_answers": ["o2"],
        "points": 1,
        "order": 999,
        "competency": "numerasi",
        "difficulty_label": "mudah",
    }
    r = admin.post(f"{BASE}/api/admin/tryouts/to_3/questions", json=body)
    assert r.status_code == 200, r.text
    q = r.json()
    assert q["difficulty_label"] == "mudah"
    qid = q["id"]

    # verify persistence
    qs = admin.get(f"{BASE}/api/admin/tryouts/to_3/questions").json()
    assert any(x["id"] == qid and x["difficulty_label"] == "mudah" for x in qs)

    # update to sulit
    body["difficulty_label"] = "sulit"
    r = admin.put(f"{BASE}/api/admin/questions/{qid}", json=body)
    assert r.status_code == 200
    qs = admin.get(f"{BASE}/api/admin/tryouts/to_3/questions").json()
    assert any(x["id"] == qid and x["difficulty_label"] == "sulit" for x in qs)

    # cleanup
    admin.delete(f"{BASE}/api/questions/{qid}")


# ---------- Bulk difficulty ----------
def test_bulk_difficulty(admin):
    qs = admin.get(f"{BASE}/api/admin/tryouts/to_3/questions").json()
    # create 2 temp questions
    created = []
    for i in range(2):
        body = {
            "type": "single", "text": f"TEST_bulk Q{i}",
            "options": [{"id": "o1", "text": "a"}, {"id": "o2", "text": "b"}],
            "correct_answers": ["o1"], "points": 1, "order": 500 + i,
            "competency": "umum", "difficulty_label": "sedang",
        }
        r = admin.post(f"{BASE}/api/admin/tryouts/to_3/questions", json=body)
        created.append(r.json()["id"])

    r = admin.post(f"{BASE}/api/admin/tryouts/to_3/questions/bulk-difficulty",
                   json={"question_ids": created, "difficulty_label": "sulit"})
    assert r.status_code == 200
    assert r.json()["updated"] == 2

    qs = admin.get(f"{BASE}/api/admin/tryouts/to_3/questions").json()
    for cid in created:
        q = next(x for x in qs if x["id"] == cid)
        assert q["difficulty_label"] == "sulit"

    # invalid
    r = admin.post(f"{BASE}/api/admin/tryouts/to_3/questions/bulk-difficulty",
                   json={"question_ids": created, "difficulty_label": "bogus"})
    assert r.status_code == 400

    for cid in created:
        admin.delete(f"{BASE}/api/questions/{cid}")


# ---------- Bulk competency regression ----------
def test_bulk_competency_still_works(admin):
    body = {"type": "single", "text": "TEST_comp", "options": [{"id": "o1", "text": "a"}],
            "correct_answers": ["o1"], "points": 1, "order": 777, "competency": "umum"}
    r = admin.post(f"{BASE}/api/admin/tryouts/to_3/questions", json=body)
    qid = r.json()["id"]
    r = admin.post(f"{BASE}/api/admin/tryouts/to_3/questions/bulk-competency",
                   json={"question_ids": [qid], "competency": "literasi"})
    assert r.status_code == 200 and r.json()["updated"] == 1
    admin.delete(f"{BASE}/api/questions/{qid}")


# ---------- Templates ----------
def test_csv_template(admin):
    r = admin.get(f"{BASE}/api/admin/questions/template")
    assert r.status_code == 200
    assert "tingkat" in r.text
    assert "type,text" in r.text


def test_xlsx_template(admin):
    r = admin.get(f"{BASE}/api/admin/questions/template.xlsx")
    assert r.status_code == 200
    # xlsx = zip starting with PK
    assert r.content[:2] == b"PK"
    assert "spreadsheetml" in r.headers.get("content-type", "")


# ---------- Bulk import with tingkat ----------
def test_import_csv_with_tingkat(admin):
    csv = (
        "type,text,option_a,option_b,correct,points,competency,tingkat\n"
        "single,TEST_import_sulit,1,2,B,1,numerasi,sulit\n"
        "single,TEST_import_mudah,1,2,A,1,literasi,mudah\n"
    )
    r = admin.post(
        f"{BASE}/api/admin/tryouts/to_3/questions/import",
        files={"file": ("x.csv", csv, "text/csv")},
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["imported"] == 2, d
    qs = admin.get(f"{BASE}/api/admin/tryouts/to_3/questions").json()
    s = next((q for q in qs if q["text"] == "TEST_import_sulit"), None)
    m = next((q for q in qs if q["text"] == "TEST_import_mudah"), None)
    assert s and s["difficulty_label"] == "sulit"
    assert m and m["difficulty_label"] == "mudah"
    admin.delete(f"{BASE}/api/questions/{s['id']}")
    admin.delete(f"{BASE}/api/questions/{m['id']}")


# ---------- Student submit returns theta/irt_scaled ----------
def test_student_submit_returns_irt(student):
    # List available tryouts
    r = student.get(f"{BASE}/api/student/tryouts")
    assert r.status_code == 200
    tos = r.json()
    # find standalone tryout (not to_1 to avoid locking); any published w/ questions
    candidate = None
    for t in tos:
        if t["id"] == "to_2":
            candidate = t
            break
    if not candidate:
        pytest.skip("to_2 not available for student")

    # start attempt
    r = student.post(f"{BASE}/api/student/tryouts/{candidate['id']}/start")
    if r.status_code not in (200, 201):
        pytest.skip(f"cannot start: {r.status_code} {r.text}")
    attempt = r.json()
    aid = attempt["id"]

    # answer each question with first option / anything
    qs = attempt.get("questions") or []
    for q in qs:
        ans = []
        if q["type"] in ("single", "multiple") and q.get("options"):
            ans = [q["options"][0]["id"]]
        elif q["type"] == "truefalse":
            ans = ["true"]
        else:
            ans = ["jakarta"]
        student.post(f"{BASE}/api/student/attempts/{aid}/answer",
                     json={"question_id": q["id"], "answers": ans})

    r = student.post(f"{BASE}/api/student/attempts/{aid}/submit")
    assert r.status_code == 200, r.text
    d = r.json()
    assert "theta" in d, d
    assert "irt_scaled" in d, d


# ---------- Analysis regression ----------
def test_analysis_endpoint(admin):
    r = admin.get(f"{BASE}/api/admin/analysis")
    assert r.status_code == 200
    assert isinstance(r.json(), dict)
