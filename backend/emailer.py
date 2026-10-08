import os
import re
import ipaddress
import logging
import smtplib
import asyncio
import httpx
from email.message import EmailMessage
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# Konfigurasi Kredensial API & SMTP
BREVO_API_KEY = os.environ.get("BREVO_API_KEY")
SMTP_HOST = os.environ.get("SMTP_HOST")
SMTP_PORT = int(os.environ.get("SMTP_PORT", 587))
SMTP_USER = os.environ.get("SMTP_USER")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "Binara LMS")
EMAIL_FROM_ADDRESS = os.environ.get("EMAIL_FROM_ADDRESS", "admin@binaralms.com")
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")
APP_BASE_URL = (os.environ.get("APP_BASE_URL") or "").rstrip("/")

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)

def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)

def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)

class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []

def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan(); scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)")

async def _send_via_api(to: str, subject: str, html: str) -> bool:
    if not BREVO_API_KEY:
        return False
    url = "https://api.brevo.com/v3/smtp/email"
    headers = {
        "accept": "application/json",
        "api-key": BREVO_API_KEY,
        "content-type": "application/json"
    }
    payload = {
        "sender": {"name": EMAIL_FROM_NAME, "email": EMAIL_FROM_ADDRESS},
        "to": [{"email": to}],
        "subject": subject,
        "htmlContent": html
    }
    if EMAIL_REPLY_TO:
        payload["replyTo"] = {"email": EMAIL_REPLY_TO}

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(url, json=payload, headers=headers)
            return res.status_code in (200, 201, 202)
    except Exception as e:
        logger.warning(f"Gagal via Brevo API, mencoba fallback SMTP: {e}")
        return False

def _send_smtp_sync(to: str, subject: str, html: str):
    if not SMTP_USER or not SMTP_PASSWORD or not SMTP_HOST:
        raise ValueError("Kredensial SMTP tidak lengkap.")

    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = f"{EMAIL_FROM_NAME} <{EMAIL_FROM_ADDRESS}>"
    msg['To'] = to
    if EMAIL_REPLY_TO:
        msg['Reply-To'] = EMAIL_REPLY_TO

    msg.set_content("Harap gunakan klien surel yang mendukung HTML.")
    msg.add_alternative(html, subtype='html')

    if SMTP_PORT == 465:
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=15) as server:
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(msg)
    else:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(msg)
    return "sent"

async def send_email(*, to: str, subject: str, html: str) -> str | None:
    _assert_safe_email(subject, html)
    
    # Prioritas 1: Menggunakan Brevo HTTP API (Port 443)
    if await _send_via_api(to, subject, html):
        return "sent"

    # Prioritas 2: Fallback menggunakan SMTP jika API gagal/tidak disetel
    try:
        result = await asyncio.to_thread(_send_smtp_sync, to, subject, html)
        return result
    except Exception as e:
        logger.error(f"Gagal total pengiriman email ke {to} (API & SMTP): {e}")
        return None

async def notify_safe(to: str, subject: str, html: str) -> bool:
    try:
        res = await send_email(to=to, subject=subject, html=html)
        return res == "sent"
    except Exception as e:
        logger.error(f"Email send error to {to}: {e}")
        return False

def _shell(inner: str) -> str:
    return (
        '<table role="presentation" width="100%" style="background:#F4F7FE;padding:24px">'
        '<tr><td align="center"><table role="presentation" width="560" '
        'style="background:#ffffff;border-radius:16px;border:1px solid #E2E8F0;'
        'font-family:Arial,Helvetica,sans-serif;color:#0A1128">'
        '<tr><td style="padding:28px 32px">'
        f'<p style="font-size:18px;font-weight:700;color:#0E7490;margin:0 0 16px">Binara LMS</p>'
        f'{inner}'
        '<p style="font-size:12px;color:#94A3B8;margin-top:24px">'
        'Email ini dikirim secara otomatis jadi jangan dilakukan pengiriman jawaban ke email ini. '
        'Namun jika butuh bantuan bisa menghubungi admin melalui WhatsApp di '
        '<a href="https://wa.me/628159896773" style="color:#0E7490;text-decoration:none;font-weight:600">+62 815-9896-773</a>.</p>'
        '</td></tr></table></td></tr></table>'
    )

async def notify_bid_accepted(to: str, tutor_name: str, slot_title: str, date: str, time_range: str):
    subject = f"Selamat! Pengajuan bidding Anda diterima — {slot_title}"
    inner = (
        f'<p>Halo {escape(tutor_name)},</p>'
        f'<p>Pengajuan bidding Anda untuk kelas <strong>{escape(slot_title)}</strong> telah diterima oleh admin.</p>'
        f'<p>Jadwal: <strong>{escape(date)}</strong>, pukul {escape(time_range)}.</p>'
        f'<p>Sekarang Anda bisa melihat kelas Anda dan pertemuannya dengan langsung mengklik bagian manajemen kelas melalui tautan berikut: '
        f'<a href="https://binaralms.com/tutor/classes" style="color:#0E7490;text-decoration:none;font-weight:600">Manajemen Kelas</a>.</p>'
        f'<p>Jangan lupa kirimkan materi setelah mengajar serta di-absen ya siswanya, semuanya ada di manajemen kelas tersebut. Terima kasih.</p>'
    )
    return await notify_safe(to, subject, _shell(inner))

async def notify_new_tryout(recipients: list, tryout_title: str, subject_name: str):
    subject = f"Try Out baru tersedia: {tryout_title}"
    for r in recipients:
        if not r.get("email"):
            continue
        inner = (
            f'<p>Halo {escape(r.get("name") or "Siswa")},</p>'
            f'<p>Sebuah Try Out baru telah dirilis dan siap Anda kerjakan:</p>'
            f'<p style="font-size:16px"><strong>{escape(tryout_title)}</strong> '
            f'<span style="color:#94A3B8">({escape(subject_name)})</span></p>'
            f'<p>Masuk ke portal siswa lalu buka menu CBT / Try Out untuk mulai mengerjakan.</p>'
        )
        await notify_safe(r["email"], subject, _shell(inner))

async def notify_new_material(recipients: list, class_title: str, item_label: str):
    subject = f"Pembaruan kelas: {class_title}"
    for r in recipients:
        if not r.get("email"):
            continue
        inner = (
            f'<p>Halo {escape(r.get("name") or "Siswa")},</p>'
            f'<p>Ada pembaruan pada kelas <strong>{escape(class_title)}</strong>:</p>'
            f'<p style="font-size:16px"><strong>{escape(item_label)}</strong></p>'
            f'<p>Masuk ke portal siswa lalu buka menu Jadwal untuk melihat detailnya.</p>'
        )
        await notify_safe(r["email"], subject, _shell(inner))