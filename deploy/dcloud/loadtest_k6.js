// Load test k6: 1.000 peserta serentak login -> daftar Try Out -> start -> submit
// Jalankan di luar server (laptop/VPS lain): k6 run -e BASE=https://api.domain-anda.com -e TRYOUT=to_1 deploy/dcloud/loadtest_k6.js
// Siapkan akun siswa uji: student1..student1000@lms.id dengan password yang sama (lihat README_DCLOUD.md §9).
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    tryout: {
      executor: "ramping-vus",
      startVUs: 50,
      stages: [
        { duration: "2m", target: 500 },
        { duration: "3m", target: 1000 },
        { duration: "5m", target: 1000 },
        { duration: "1m", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<800"],
  },
};

const BASE = __ENV.BASE || "http://localhost:8001";
const TRYOUT = __ENV.TRYOUT || "to_1";
const PASSWORD = __ENV.PASSWORD || "Siswa@12345";

export default function () {
  const jar = http.cookieJar();
  const email = `student${(__VU % 1000) + 1}@lms.id`;
  const login = http.post(`${BASE}/api/auth/login`, JSON.stringify({ email, password: PASSWORD }), { headers: { "Content-Type": "application/json" }, jar });
  check(login, { "login 200": (r) => r.status === 200 });
  if (login.status !== 200) { sleep(2); return; }

  const list = http.get(`${BASE}/api/student/tryouts`, { jar });
  check(list, { "list 200": (r) => r.status === 200 });

  const start = http.post(`${BASE}/api/student/tryouts/${TRYOUT}/start`, null, { jar });
  check(start, { "start ok": (r) => r.status === 200 || r.status === 400 });
  if (start.status !== 200) { sleep(3); return; }
  const attempt = start.json();

  const detail = http.get(`${BASE}/api/student/tryouts/${TRYOUT}`, { jar });
  check(detail, { "detail 200": (r) => r.status === 200 });
  const qs = (detail.json().questions || []);
  const answers = {};
  qs.forEach((q) => { answers[q.id] = q.type === "truefalse" ? ["true"] : q.type === "essay" ? ["jawaban"] : [(q.options && q.options[0] && q.options[0].id) || "o1"]; });

  sleep(Math.random() * 5 + 2); // simulasi mengerjakan
  const submit = http.post(`${BASE}/api/student/attempts/${attempt.id}/submit`, JSON.stringify({ answers }), { headers: { "Content-Type": "application/json" }, jar });
  check(submit, { "submit 200": (r) => r.status === 200 });
  sleep(1);
}
