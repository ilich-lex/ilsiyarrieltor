from __future__ import annotations

import asyncio
import hashlib
import html
import logging
import os
import re
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Literal
from uuid import UUID, uuid4

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
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
    allow_headers=["Content-Type", "Idempotency-Key"],
    expose_headers=["X-Lead-ID"],
)
app.mount("/assets", StaticFiles(directory=BASE_DIR / "assets"), name="assets")

_requests_by_ip: dict[str, deque[float]] = defaultdict(deque)
_successful_submissions: dict[str, float] = {}
_rate_limit_lock = asyncio.Lock()
_delivery_lock = asyncio.Lock()
_started_at = time.monotonic()
DELIVERY_TTL_SECONDS = 24 * 60 * 60
MAX_DELIVERY_RECORDS = 2000


@dataclass
class DeliveryRecord:
    fingerprint: str
    created_at: float
    outcome: str = "processing"


# Receipts only: no names, phones, comments or chat IDs. This is NOT durable storage.
_deliveries: dict[str, DeliveryRecord] = {}
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


def _telegram_message(lead: LeadPayload, lead_id: str) -> str:
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
        f"<b>Дата/время:</b> {html.escape(timestamp)}\n"
        f"<b>Код заявки:</b> <code>{lead_id}</code>"
    )


def _delivery_error(status_code: int, code: str, delivery: str = "not_sent") -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "delivery": delivery})


@app.middleware("http")
async def lead_trace(request: Request, call_next):
    if request.url.path != "/api/lead" or request.method != "POST":
        return await call_next(request)
    candidate = request.headers.get("Idempotency-Key")
    try:
        lead_id = str(UUID(candidate)) if candidate else str(uuid4())
    except (ValueError, AttributeError):
        return JSONResponse(status_code=400, content={"ok": False, "code": "invalid_request_id"})
    request.state.lead_id = lead_id
    started = time.monotonic()
    logger.info("lead_request_received | lead_id=%s", lead_id)
    response = await call_next(request)
    response.headers["X-Lead-ID"] = lead_id
    logger.info("lead_http_result | lead_id=%s | status=%s | duration_ms=%s",
                lead_id, response.status_code, round((time.monotonic() - started) * 1000))
    return response


@app.exception_handler(HTTPException)
async def lead_http_error(request: Request, exc: HTTPException):
    if request.url.path != "/api/lead":
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail}, headers=exc.headers)
    detail = exc.detail if isinstance(exc.detail, dict) else {}
    code = detail.get("code", "rate_limited" if exc.status_code == 429 else "request_failed")
    delivery = detail.get("delivery", "not_sent")
    lead_id = getattr(request.state, "lead_id", None)
    logger.info("lead_rejected | lead_id=%s | code=%s | delivery=%s", lead_id, code, delivery)
    return JSONResponse(status_code=exc.status_code, content={
        "ok": False, "leadId": lead_id, "code": code, "delivery": delivery,
    }, headers=exc.headers)


@app.exception_handler(RequestValidationError)
async def lead_validation_error(request: Request, exc: RequestValidationError):
    lead_id = getattr(request.state, "lead_id", None)
    logger.info("lead_validation_failed | lead_id=%s | issues=%s", lead_id, len(exc.errors()))
    return JSONResponse(status_code=422, content={
        "ok": False, "leadId": lead_id, "code": "invalid_fields", "delivery": "not_sent",
    })


async def _claim_delivery(lead_id: str, lead: LeadPayload) -> bool:
    fingerprint = hashlib.sha256(lead.model_dump_json().encode("utf-8")).hexdigest()
    now = time.monotonic()
    async with _delivery_lock:
        for key in [key for key, r in _deliveries.items() if now - r.created_at > DELIVERY_TTL_SECONDS]:
            _deliveries.pop(key, None)
        record = _deliveries.get(lead_id)
        if record:
            if record.fingerprint != fingerprint:
                raise _delivery_error(409, "idempotency_conflict", "unknown")
            if record.outcome == "accepted":
                logger.info("lead_duplicate_confirmed | lead_id=%s", lead_id)
                return False
            if record.outcome in ("processing", "unknown"):
                raise _delivery_error(409, "delivery_" + record.outcome, "unknown")
        # Also guard simultaneous copies with different IDs while a send is pending.
        if any(r.fingerprint == fingerprint and r.outcome in ("processing", "unknown")
               for r in _deliveries.values()):
            raise _delivery_error(409, "delivery_pending", "unknown")
        if len(_deliveries) >= MAX_DELIVERY_RECORDS and not record:
            raise _delivery_error(503, "service_busy")
        _deliveries[lead_id] = DeliveryRecord(fingerprint=fingerprint, created_at=now)
    return True


async def _record_outcome(lead_id: str, outcome: str):
    async with _delivery_lock:
        if lead_id in _deliveries:
            _deliveries[lead_id].outcome = outcome
    logger.info("lead_delivery_result | lead_id=%s | delivery=%s", lead_id, outcome)


def _telegram_error_category(data: dict, http_status: int) -> str:
    # Never log Telegram's raw description, URLs, credentials or returned chat/user data.
    description = str(data.get("description", "")).lower()
    if http_status == 401:
        return "credentials_rejected"
    if "blocked" in description:
        return "recipient_blocked"
    if "chat not found" in description:
        return "recipient_not_found"
    if "deactivated" in description:
        return "recipient_deactivated"
    if http_status == 403:
        return "recipient_forbidden"
    if http_status == 429:
        return "telegram_rate_limited"
    return "telegram_rejected"


async def _send_to_telegram(lead: LeadPayload, lead_id: str) -> None:
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        logger.error("telegram_configuration_missing | lead_id=%s", lead_id)
        raise _delivery_error(503, "service_unavailable")
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": _telegram_message(lead, lead_id),
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    started = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, json=payload)
    except httpx.HTTPError as exc:
        definitely_not_sent = isinstance(exc, (httpx.ConnectError, httpx.ConnectTimeout, httpx.PoolTimeout))
        logger.error("telegram_transport_failed | lead_id=%s | error=%s | delivery=%s",
                     lead_id, exc.__class__.__name__, "not_sent" if definitely_not_sent else "unknown")
        raise _delivery_error(502, "telegram_unavailable" if definitely_not_sent else "delivery_unknown",
                              "not_sent" if definitely_not_sent else "unknown") from None
    try:
        data = response.json()
        if not isinstance(data, dict):
            data = {}
    except ValueError:
        data = {}
    result = data.get("result")
    message_id = result.get("message_id") if isinstance(result, dict) else None
    telegram_ok = response.status_code == 200 and data.get("ok") is True and isinstance(message_id, int)
    logger.info("telegram_api_result | lead_id=%s | http_status=%s | ok=%s | duration_ms=%s",
                lead_id, response.status_code, telegram_ok, round((time.monotonic() - started) * 1000))
    if not telegram_ok:
        ambiguous = response.status_code >= 500 or response.status_code == 200
        category = "delivery_unknown" if ambiguous else _telegram_error_category(data, response.status_code)
        logger.warning("telegram_delivery_failed | lead_id=%s | category=%s | telegram_error_code=%s",
                       lead_id, category, data.get("error_code") if isinstance(data.get("error_code"), int) else None)
        raise _delivery_error(502, category, "unknown" if ambiguous else "not_sent")
    returned_chat = result.get("chat", {}).get("id") if isinstance(result.get("chat"), dict) else None
    if TELEGRAM_CHAT_ID.lstrip("-").isdigit() and str(returned_chat) != TELEGRAM_CHAT_ID:
        logger.error("telegram_recipient_mismatch | lead_id=%s", lead_id)
        raise _delivery_error(502, "recipient_mismatch", "unknown")
    logger.info("telegram_accepted | lead_id=%s | message_id=%s | recipient_match=%s",
                lead_id, message_id, str(returned_chat) == TELEGRAM_CHAT_ID)


@app.post("/api/lead")
async def create_lead(lead: LeadPayload, request: Request) -> dict:
    lead_id = request.state.lead_id
    if lead.website:
        logger.info("lead_honeypot_blocked | lead_id=%s", lead_id)
        raise _delivery_error(422, "form_check_failed")
    if not await _claim_delivery(lead_id, lead):
        return {"ok": True, "leadId": lead_id, "delivery": "accepted", "duplicate": True}
    try:
        await _check_rate_limit(_client_ip(request), _submission_key(_client_ip(request), lead))
        logger.info("lead_validated | lead_id=%s", lead_id)
        await _send_to_telegram(lead, lead_id)
        await _mark_submission_success(_submission_key(_client_ip(request), lead))
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, dict) else {}
        await _record_outcome(lead_id, "unknown" if detail.get("delivery") == "unknown" else "failed")
        raise
    except asyncio.CancelledError:
        await _record_outcome(lead_id, "unknown")
        raise
    except Exception as exc:
        logger.error("lead_internal_failure | lead_id=%s | error=%s", lead_id, exc.__class__.__name__)
        await _record_outcome(lead_id, "unknown")
        raise _delivery_error(503, "delivery_unknown", "unknown") from None
    await _record_outcome(lead_id, "accepted")
    return {"ok": True, "leadId": lead_id, "delivery": "accepted", "duplicate": False}


@app.get("/health", include_in_schema=False)
async def health():
    return {"ok": True, "version": "lead-diagnostics-v1",
            "uptimeSeconds": round(time.monotonic() - _started_at)}


@app.get("/", include_in_schema=False)
@app.get("/index.html", include_in_schema=False)
async def index() -> FileResponse:
    return FileResponse(BASE_DIR / "index.html")


@app.get("/styles.css", include_in_schema=False)
async def styles() -> FileResponse:
    return FileResponse(BASE_DIR / "styles.css", media_type="text/css")


@app.get("/objects.html", include_in_schema=False)
async def objects_page() -> FileResponse:
    return FileResponse(BASE_DIR / "objects.html")


@app.get("/property.html", include_in_schema=False)
async def property_page() -> FileResponse:
    return FileResponse(BASE_DIR / "property.html")


@app.get("/script.js", include_in_schema=False)
async def script() -> FileResponse:
    return FileResponse(BASE_DIR / "script.js", media_type="text/javascript")
