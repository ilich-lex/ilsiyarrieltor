from __future__ import annotations

import asyncio
import hashlib
import html
import logging
import os
import re
import time
from collections import defaultdict, deque
from datetime import datetime
from pathlib import Path
from typing import Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, field_validator


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "").strip()

RATE_LIMIT_WINDOW_SECONDS = 10 * 60
RATE_LIMIT_MAX_REQUESTS = 5
REPEAT_SUBMISSION_SECONDS = 60

logger = logging.getLogger("ilsiyar.leads")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

app = FastAPI(title="Ilsiyar website lead service", docs_url=None, redoc_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://ilsiyar.ru",
        "https://www.ilsiyar.ru",
        "https://ilich-lex.github.io",
        "http://127.0.0.1:8000",
        "http://localhost:8000",
    ],
    allow_credentials=False,
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)
app.mount("/assets", StaticFiles(directory=BASE_DIR / "assets"), name="assets")

_requests_by_ip: dict[str, deque[float]] = defaultdict(deque)
_successful_submissions: dict[str, float] = {}
_rate_limit_lock = asyncio.Lock()
_markup_pattern = re.compile(
    r"<\s*/?\s*[a-z][^>]*>|javascript\s*:|data\s*:\s*text/html",
    re.IGNORECASE,
)


class LeadPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(min_length=2, max_length=80)
    phone: str = Field(min_length=7, max_length=32)
    city: str = Field(min_length=2, max_length=100)
    requestType: Literal["Купить", "Продать", "Оценить", "Другое"]
    comment: str = Field(default="", max_length=1000)
    source: Literal["ilsiyar-website"]
    consent: Literal[True]
    website: str = Field(default="", max_length=200)

    @field_validator("name", "city", "comment", "website")
    @classmethod
    def reject_markup(cls, value: str) -> str:
        if _markup_pattern.search(value):
            raise ValueError("HTML-разметка не допускается")
        return value

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str) -> str:
        if _markup_pattern.search(value) or not re.fullmatch(r"[+\d\s().-]+", value):
            raise ValueError("Некорректный номер телефона")
        digits = re.sub(r"\D", "", value)
        if not 10 <= len(digits) <= 15:
            raise ValueError("Некорректный номер телефона")
        return value


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _submission_key(ip: str, lead: LeadPayload) -> str:
    normalized_phone = re.sub(r"\D", "", lead.phone)
    raw = f"{ip}|{normalized_phone}|{lead.requestType}|{lead.name.casefold()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def _check_rate_limit(ip: str, submission_key: str) -> None:
    now = time.monotonic()
    async with _rate_limit_lock:
        requests = _requests_by_ip[ip]
        while requests and now - requests[0] > RATE_LIMIT_WINDOW_SECONDS:
            requests.popleft()

        if len(requests) >= RATE_LIMIT_MAX_REQUESTS:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Слишком много попыток. Попробуйте позже.",
            )

        last_success = _successful_submissions.get(submission_key)
        if last_success is not None and now - last_success < REPEAT_SUBMISSION_SECONDS:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Заявка уже отправлена.",
            )

        requests.append(now)


async def _mark_submission_success(submission_key: str) -> None:
    now = time.monotonic()
    async with _rate_limit_lock:
        _successful_submissions[submission_key] = now
        expired_before = now - RATE_LIMIT_WINDOW_SECONDS
        expired_keys = [
            key for key, submitted_at in _successful_submissions.items()
            if submitted_at < expired_before
        ]
        for key in expired_keys:
            _successful_submissions.pop(key, None)


def _telegram_message(lead: LeadPayload) -> str:
    safe = {
        "name": html.escape(lead.name),
        "phone": html.escape(lead.phone),
        "city": html.escape(lead.city),
        "request_type": html.escape(lead.requestType),
        "comment": html.escape(lead.comment) if lead.comment else "Не указан",
    }
    timestamp = datetime.now().astimezone().strftime("%d.%m.%Y %H:%M %Z")

    return (
        "🏠 <b>НОВАЯ ЗАЯВКА С САЙТА</b>\n\n"
        f"<b>Имя:</b> {safe['name']}\n"
        f"<b>Телефон:</b> {safe['phone']}\n"
        f"<b>Город:</b> {safe['city']}\n"
        f"<b>Задача:</b> {safe['request_type']}\n\n"
        f"<b>Комментарий:</b>\n{safe['comment']}\n\n"
        "<b>Источник:</b> сайт Ильсияр Тухватшиной\n"
        f"<b>Дата/время:</b> {html.escape(timestamp)}"
    )


async def _send_to_telegram(lead: LeadPayload, lead_id: str) -> None:
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        logger.error("Telegram configuration is missing | lead_id=%s", lead_id)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Сервис отправки временно недоступен.",
        )

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": _telegram_message(lead),
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, json=payload)
    except httpx.HTTPError as exc:
        logger.error(
            "Telegram request failed | lead_id=%s | error=%s",
            lead_id,
            exc.__class__.__name__,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Не удалось отправить заявку.",
        ) from None

    telegram_ok = False
    if response.status_code == 200:
        try:
            telegram_ok = response.json().get("ok") is True
        except ValueError:
            telegram_ok = False

    logger.info(
        "Telegram API result | lead_id=%s | status=%s | ok=%s",
        lead_id,
        response.status_code,
        telegram_ok,
    )
    if not telegram_ok:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Не удалось отправить заявку.",
        )


@app.post("/api/lead")
async def create_lead(lead: LeadPayload, request: Request) -> dict[str, bool]:
    lead_id = hashlib.sha256(f"{time.time_ns()}".encode()).hexdigest()[:10]

    if lead.website:
        logger.info("Honeypot submission ignored | lead_id=%s", lead_id)
        return {"ok": True}

    ip = _client_ip(request)
    submission_key = _submission_key(ip, lead)
    await _check_rate_limit(ip, submission_key)
    logger.info("Lead received | lead_id=%s", lead_id)

    await _send_to_telegram(lead, lead_id)
    await _mark_submission_success(submission_key)
    return {"ok": True}


@app.get("/", include_in_schema=False)
async def index() -> FileResponse:
    return FileResponse(BASE_DIR / "index.html")


@app.get("/styles.css", include_in_schema=False)
async def styles() -> FileResponse:
    return FileResponse(BASE_DIR / "styles.css", media_type="text/css")


@app.get("/script.js", include_in_schema=False)
async def script() -> FileResponse:
    return FileResponse(BASE_DIR / "script.js", media_type="text/javascript")
