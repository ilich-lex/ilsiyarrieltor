"""Offline regressions: no Telegram messages or real credentials are used."""
import asyncio
import io
import logging
import unittest
from unittest.mock import patch
from uuid import uuid4

import httpx
import app as service

RealClient = httpx.AsyncClient


class LeadDeliveryTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        service._deliveries.clear()
        service._requests_by_ip.clear()
        service._successful_submissions.clear()
        self.payload = dict(name="Тест Проверки", phone="+79990000000", city="Тестовый город",
                            requestType="Купить", comment="A & B", source="ilsiyar-website",
                            consent=True, website="")
        self.id = str(uuid4())
        self.calls = []
        self.client = RealClient(transport=httpx.ASGITransport(app=service.app), base_url="http://test")
        self.logs = io.StringIO()
        self.handler = logging.StreamHandler(self.logs)
        service.logger.addHandler(self.handler)
        self.config = patch.multiple(service, TELEGRAM_BOT_TOKEN="offline-test-token", TELEGRAM_CHAT_ID="12345")
        self.config.start()

    async def asyncTearDown(self):
        await self.client.aclose()
        self.config.stop()
        service.logger.removeHandler(self.handler)
        text = self.logs.getvalue()
        for forbidden in ("offline-test-token", self.payload["phone"], self.payload["name"], "A & B"):
            self.assertNotIn(forbidden, text)

    def telegram(self, handler=None):
        def mock(request):
            self.calls.append(request)
            if handler:
                return handler(request)
            return httpx.Response(200, json={"ok": True, "result": {"message_id": 42, "chat": {"id": 12345}}})
        return patch.object(service.httpx, "AsyncClient", lambda **kwargs: RealClient(
            transport=httpx.MockTransport(mock), **kwargs))

    async def post(self, payload=None, lead_id=None):
        return await self.client.post("/api/lead", json=payload or self.payload,
                                      headers={"Idempotency-Key": lead_id or self.id})

    async def test_success_and_replayed_receipt_send_only_once(self):
        with self.telegram():
            first = await self.post()
            second = await self.post()
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.json()["leadId"], self.id)
        self.assertEqual(first.headers["X-Lead-ID"], self.id)
        self.assertFalse(first.json()["duplicate"])
        self.assertTrue(second.json()["duplicate"])
        self.assertEqual(len(self.calls), 1)
        self.assertIn("A &amp; B", self.calls[0].content.decode())
        self.assertIn("telegram_accepted", self.logs.getvalue())

    async def test_honeypot_has_no_false_success(self):
        with self.telegram():
            response = await self.post({**self.payload, "website": "autofill.example"})
        self.assertEqual(response.status_code, 422)
        self.assertFalse(response.json()["ok"])
        self.assertEqual(response.json()["code"], "form_check_failed")
        self.assertEqual(len(self.calls), 0)

    async def test_timeout_is_unknown_and_cannot_resend(self):
        def timeout(request):
            raise httpx.ReadTimeout("offline timeout")
        with self.telegram(timeout):
            first = await self.post()
            second = await self.post()
        self.assertEqual(first.json()["delivery"], "unknown")
        self.assertEqual(second.status_code, 409)
        self.assertEqual(len(self.calls), 1)

    async def test_recipient_rejection_has_safe_diagnostic(self):
        with self.telegram(lambda r: httpx.Response(403, json={"ok": False, "error_code": 403,
                "description": "Forbidden: bot was blocked by user offline-test-token"})):
            response = await self.post()
        self.assertEqual(response.json()["delivery"], "not_sent")
        self.assertEqual(response.json()["code"], "recipient_blocked")
        self.assertNotIn("description", response.text)

    async def test_concurrent_requests_do_not_send_twice(self):
        entered, release = asyncio.Event(), asyncio.Event()
        count = 0
        async def sender(*args):
            nonlocal count
            count += 1
            entered.set()
            await release.wait()
        with patch.object(service, "_send_to_telegram", sender):
            first = asyncio.create_task(self.post())
            await entered.wait()
            second = await self.post()
            third = await self.post(lead_id=str(uuid4()))
            release.set()
            self.assertEqual((await first).status_code, 200)
        self.assertEqual(second.status_code, 409)
        self.assertEqual(third.status_code, 409)
        self.assertEqual(count, 1)

    async def test_id_with_changed_payload_is_rejected(self):
        with self.telegram():
            await self.post()
            response = await self.post({**self.payload, "city": "Другой город"})
        self.assertEqual(response.json()["code"], "idempotency_conflict")
        self.assertEqual(len(self.calls), 1)

    async def test_invalid_fields_are_correlated_without_echoing_input(self):
        with self.telegram():
            for fields in ({"name": "x"}, {"comment": "<script>alert(1)</script>"}, {"city": "x" * 101}, {"consent": False}):
                response = await self.post({**self.payload, **fields})
                self.assertEqual(response.status_code, 422)
                self.assertEqual(response.json()["leadId"], self.id)
                self.assertNotIn(self.payload["phone"], response.text)
        self.assertEqual(len(self.calls), 0)

    async def test_unexpected_telegram_result_and_recipient_are_unknown(self):
        for result in ({"ok": True}, {"ok": True, "result": {"message_id": 1, "chat": {"id": 999}}}):
            service._deliveries.clear()
            with self.telegram(lambda r: httpx.Response(200, json=result)):
                response = await self.post()
            self.assertFalse(response.json()["ok"])
            self.assertEqual(response.json()["delivery"], "unknown")

    async def test_cors_accepts_diagnostic_header_only_for_allowed_origin(self):
        for origin, expected in (("https://ilsiyar.ru", 200), ("https://untrusted.example", 400)):
            response = await self.client.options("/api/lead", headers={"Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type,idempotency-key"})
            self.assertEqual(response.status_code, expected)


if __name__ == "__main__":
    unittest.main()
