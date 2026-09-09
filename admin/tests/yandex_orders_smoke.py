#!/usr/bin/env python3
"""Local-only Yandex orders acceptance; no backend or live credentials.

Use /usr/bin/python3 with an existing clean local Vite server, --url and
--output-dir. Every API request is intercepted before navigation. No browser
download, production access or synchronous WebSocket close is attempted.
"""

import argparse
from copy import deepcopy
import json
from pathlib import Path
import re
from urllib.parse import parse_qs, unquote, urlsplit

from playwright.sync_api import expect, sync_playwright


ID = "11111111-1111-4111-8111-111111111111"
EXTERNAL_ID = "YA-LOCAL-001-ABCDEFGHIJKLMN0123456789ABCDEFGHIJKLMN0123456789"
ORDER_PATH = f"/api/admin/yandex/orders/{ID}"
PRODUCTS = {
    "vitamin": {"billzProductId": "vitamin", "name": "Витамин", "unitPrice": 40000, "availableQuantity": 10},
    "zinc": {"billzProductId": "zinc", "name": "Цинк", "unitPrice": 20000, "availableQuantity": 5},
    "magnesium": {"billzProductId": "magnesium", "name": "Магний", "unitPrice": 55000, "availableQuantity": 8},
}


def local_origin(value):
    parsed = urlsplit(value)
    try:
        port = parsed.port
    except ValueError as error:
        raise argparse.ArgumentTypeError(str(error)) from error
    if (parsed.scheme not in ("http", "https")
            or parsed.hostname not in ("localhost", "127.0.0.1")
            or not port or parsed.username is not None or parsed.password is not None
            or parsed.path not in ("", "/") or parsed.query or parsed.fragment):
        raise argparse.ArgumentTypeError("Use localhost/127.0.0.1 with an explicit port and no credentials, path or query")
    return f"{parsed.scheme}://{parsed.hostname}:{port}"


def fixture_order():
    return {
        "id": ID, "externalId": EXTERNAL_ID, "status": "NEW", "accountingStatus": "received",
        "revision": 7, "itemsRevision": 3, "itemsFrozen": False,
        "enabled": True, "accountingEnabled": True, "inProgress": False,
        "reconciliationRequired": False, "cancellationPending": False,
        "items": [{"billzProductId": key, "name": PRODUCTS[key]["name"],
                   "unitPrice": PRODUCTS[key]["unitPrice"], "quantity": quantity}
                  for key, quantity in (("vitamin", 3), ("zinc", 1))],
        "totalAmount": 140000, "customer": {"name": "Локальный клиент", "phone": ""},
        "actions": ["accept", "reject"], "audit": [],
        "createdAt": "2026-09-08T09:00:00Z", "updatedAt": "2026-09-08T09:00:00Z",
    }


class Fixtures:
    def __init__(self, origin):
        self.origin = origin
        self.order = fixture_order()
        self.stale_next = False
        self.fail_detail = False
        self.fail_list = False
        self.writes = []
        self.reads = []
        self.unexpected_api = []
        self.blocked_external = []
        self.expected_errors = []
        self.fixture_errors = []

    def route(self, route):
        try:
            self.handle(route)
        except Exception as error:
            self.fixture_errors.append(str(error))
            route.fulfill(status=500, content_type="application/json", body=json.dumps({"success": False, "error": "fixture_assertion_failed"}))

    def handle(self, route):
        request = route.request
        target = urlsplit(request.url)
        if f"{target.scheme}://{target.netloc}" != self.origin:
            self.blocked_external.append(f"{target.scheme}://{target.netloc}{target.path}")
            route.abort()
            return
        path = unquote(target.path)
        # Vite proxies the entire raw /api prefix, including malformed paths.
        if not target.path.startswith("/api") and not path.startswith("/api"):
            route.continue_()
            return

        def respond(body, status=200):
            route.fulfill(status=status, content_type="application/json", body=json.dumps({"success": status < 400, **body}))

        def expected_error(code, status):
            self.expected_errors.append({"method": request.method, "path": path, "status": status, "code": code})
            respond({"error": code}, status)

        if request.method == "GET":
            self.reads.append(path)
            if path == "/api/admin/auth/whoami":
                respond({"data": {"isAdmin": True, "role": "admin", "firstName": "Fixture admin", "telegramId": 901, "csrfToken": "local-fixture-csrf"}})
                return
            if path in ("/api/admin/orders", "/api/admin/medicalka/approvals", "/api/admin/uzum/orders"):
                respond({"enabled": False, "data": [], "meta": {"total": 0}, "sync": {"stale": False}})
                return
            if path == "/api/admin/yandex/orders":
                query = parse_qs(target.query)
                assert set(query) == {"bucket", "page", "limit"}, query
                assert query["bucket"][0] in ("active", "history", "all")
                assert query["page"] == ["1"] and query["limit"] == ["30"]
                if self.fail_list:
                    self.fail_list = False
                    expected_error("yandex_service_unavailable", 503)
                else:
                    # The fixture defines the bucket; the browser must not hide READY.
                    rows = [] if query["bucket"] == ["history"] else [self.order]
                    respond({"enabled": True, "accountingEnabled": True, "data": rows, "meta": {"total": len(rows), "page": 1, "limit": 30}})
                return
            if path == ORDER_PATH:
                if self.fail_detail:
                    self.fail_detail = False
                    expected_error("yandex_service_unavailable", 503)
                else:
                    respond({"data": self.order})
                return
            if path == "/api/admin/yandex/products":
                query = parse_qs(target.query)
                assert set(query) == {"search", "limit"} and len(query["search"][0]) <= 120
                assert query["limit"] == ["30"]
                respond({"items": [PRODUCTS["magnesium"]]})
                return

        if request.method in ("PUT", "POST") and path in (f"{ORDER_PATH}/items", f"{ORDER_PATH}/decision"):
            body = request.post_data_json
            assert request.headers.get("x-fh-csrf") == "local-fixture-csrf"
            assert isinstance(body["reason"], str) and len(body["reason"]) <= 300
            assert not set(body) & {"actor", "role", "price", "unitPrice", "name"}
            self.writes.append({"method": request.method, "path": path, "body": deepcopy(body)})
            if path.endswith("/items"):
                assert request.method == "PUT"
                assert set(body) == {"items", "expectedItemsRevision", "reason"}
                assert not self.order["itemsFrozen"]
                assert len(body["items"]) <= 100
                assert len({item["billzProductId"] for item in body["items"]}) == len(body["items"])
                for item in body["items"]:
                    assert set(item) == {"billzProductId", "quantity"}
                    assert item["billzProductId"] in PRODUCTS
                    assert type(item["quantity"]) is int and 1 <= item["quantity"] <= 10000
                if self.stale_next:
                    self.stale_next = False
                    self.order["revision"] += 1
                    self.order["itemsRevision"] += 1
                    self.order["items"][0]["quantity"] = 1
                    self.retotal()
                if body["expectedItemsRevision"] != self.order["itemsRevision"]:
                    expected_error("yandex_items_revision_conflict", 409)
                    return
                self.order["items"] = [{**item, "name": PRODUCTS[item["billzProductId"]]["name"], "unitPrice": PRODUCTS[item["billzProductId"]]["unitPrice"]} for item in body["items"]]
                self.order["itemsRevision"] += 1
                self.retotal()
            else:
                assert request.method == "POST"
                action = body["action"]
                assert action in self.order["actions"]
                assert body["expectedRevision"] == self.order["revision"]
                assert set(body) == {"action", "expectedRevision", "reason"} | ({"expectedItemsRevision"} if action == "accept" else set())
                if action == "accept":
                    assert body["expectedItemsRevision"] == self.order["itemsRevision"]
                    assert self.order["items"]
                    self.order.update(status="ACCEPTED_BY_RESTAURANT", accountingStatus="reserved", itemsFrozen=True, actions=["cooking", "ready", "reject"])
                elif action == "cooking":
                    self.order.update(status="COOKING", actions=["ready", "reject"])
                elif action == "ready":
                    self.order.update(status="READY", accountingStatus="sold", actions=["reject"])
                elif action == "reject":
                    assert body["reason"].strip()
                    self.order.update(status="CANCELLED", reconciliationRequired=self.order["accountingStatus"] == "sold", actions=[])
            self.order["revision"] += 1
            respond({"order": self.order, "idempotent": False})
            return

        self.unexpected_api.append(f"{request.method} {path}")
        respond({"error": "unexpected_fixture_api"}, 404)

    def retotal(self):
        self.order["totalAmount"] = sum(item["quantity"] * item["unitPrice"] for item in self.order["items"])


def inspect(page, output, name, screenshot=False):
    page.wait_for_load_state("networkidle")
    dom = page.locator("body").evaluate("""body => ({
        headings: [...body.querySelectorAll('h1,h2,h3')].map(el => ({level: el.tagName, name: el.textContent})),
        controls: [...body.querySelectorAll('input,textarea,button')].map(el => ({
            role: el.getAttribute('role') || el.tagName.toLowerCase(),
            name: el.getAttribute('aria-label') || [...(el.labels || [])].map(label => label.textContent).join(' ') || el.textContent,
            disabled: el.disabled
        })),
        viewport: innerWidth, documentWidth: document.documentElement.scrollWidth
    })""")
    (output / f"{name}-dom.json").write_text(json.dumps(dom, ensure_ascii=False, indent=2), encoding="utf-8")
    assert dom["documentWidth"] <= dom["viewport"], f"Horizontal overflow: {dom}"
    if screenshot:
        page.screenshot(path=str(output / f"{name}.png"), full_page=True)


def open_yandex(page, output, name):
    inspect(page, output, f"{name}-sources")
    page.get_by_role("button", name="Yandex", exact=True).click()
    expect(page.get_by_role("button", name=f"Открыть {EXTERNAL_ID}", exact=True)).to_be_visible()
    inspect(page, output, f"{name}-list", screenshot=True)
    page.get_by_role("button", name=f"Открыть {EXTERNAL_ID}", exact=True).click()
    expect(page.get_by_role("heading", name=f"Yandex · {EXTERNAL_ID}", exact=True, level=2)).to_be_visible()
    inspect(page, output, f"{name}-detail", screenshot=True)


def confirm_action(page, output, name, label, meaning):
    page.get_by_role("button", name=label, exact=True).click()
    expect(page.get_by_role("dialog")).to_contain_text(meaning)
    inspect(page, output, f"{name}-confirmation")
    page.get_by_role("button", name="Подтвердить", exact=True).click()
    expect(page.get_by_role("dialog")).to_have_count(0)


def exercise(page, fixture, output, width):
    prefix = str(width)
    page.goto(f"{fixture.origin}/orders")
    open_yandex(page, output, prefix)
    quantity = page.get_by_role("spinbutton", name="Количество: Витамин", exact=True)
    quantity.fill("2")
    page.get_by_role("button", name="Удалить Цинк", exact=True).click()
    page.get_by_role("textbox", name="Поиск замены", exact=True).fill("маг")
    expect(page.get_by_role("button", name="Добавить Магний", exact=True)).to_be_visible()
    inspect(page, output, f"{prefix}-replacement")
    page.get_by_role("button", name="Добавить Магний", exact=True).click()
    page.get_by_role("textbox", name="Причина изменения состава", exact=True).fill("Локальная замена")
    expect(page.get_by_text("Загружено: 3", exact=True)).to_be_visible()
    expect(page.get_by_text("Удалено из сборки", exact=True)).to_be_visible()
    inspect(page, output, f"{prefix}-edited", screenshot=True)
    confirm_action(page, output, f"{prefix}-save", "Сохранить состав", "проверит товары и цены на сервере")
    expect(page.get_by_text("Версия состава: 4", exact=True)).to_be_visible()
    expect(page.get_by_text("135 000 UZS", exact=True)).to_be_visible()
    assert fixture.writes[0]["body"] == {"items": [{"billzProductId": "vitamin", "quantity": 2}, {"billzProductId": "magnesium", "quantity": 1}], "expectedItemsRevision": 3, "reason": "Локальная замена"}

    page.reload()
    open_yandex(page, output, f"{prefix}-reloaded")
    expect(quantity).to_have_value("2")
    expect(page.get_by_role("spinbutton", name="Количество: Цинк", exact=True)).to_have_count(0)
    fixture.stale_next = True
    quantity.fill("1")
    confirm_action(page, output, f"{prefix}-stale", "Сохранить состав", "проверит товары и цены на сервере")
    expect(page.get_by_role("alert")).to_contain_text("Конфликт версий")
    expect(page.get_by_text("Версия состава: 5", exact=True)).to_be_visible()
    expect(quantity).to_have_value("1")
    assert len(fixture.writes) == 2
    inspect(page, output, f"{prefix}-conflict", screenshot=True)

    confirm_action(page, output, f"{prefix}-accept", "Принять", "зарезервирует товары")
    expect(page.get_by_text("Учёт: Зарезервирован", exact=True)).to_be_visible()
    expect(page.get_by_role("spinbutton")).to_have_count(0)
    expect(page.get_by_text(re.compile("Состав зафиксирован"))).to_be_visible()
    inspect(page, output, f"{prefix}-frozen", screenshot=True)
    confirm_action(page, output, f"{prefix}-cooking", "Начать сборку", "начало сборки")
    expect(page.get_by_text("Выдача: Собирается", exact=True)).to_be_visible()
    inspect(page, output, f"{prefix}-cooking")
    confirm_action(page, output, f"{prefix}-ready", "Готов", "завершит продажу")
    expect(page.get_by_text("Учёт: Продажа завершена", exact=True)).to_be_visible()
    inspect(page, output, f"{prefix}-ready", screenshot=True)
    page.get_by_role("button", name="К списку Yandex", exact=True).click()
    expect(page.get_by_text("Выдача: Готов · ожидает курьера", exact=True)).to_be_visible()
    expect(page.get_by_role("button", name="Активные", exact=True)).to_have_attribute("aria-pressed", "true")
    inspect(page, output, f"{prefix}-ready-active", screenshot=True)
    page.get_by_role("button", name="История", exact=True).click()
    expect(page.get_by_role("heading", name="Заказов Yandex пока нет", exact=True, level=2)).to_be_visible()
    page.get_by_role("button", name="Все", exact=True).click()
    expect(page.get_by_role("button", name=f"Открыть {EXTERNAL_ID}", exact=True)).to_be_visible()
    inspect(page, output, f"{prefix}-all")
    page.get_by_role("button", name=f"Открыть {EXTERNAL_ID}", exact=True).click()
    expect(page.get_by_role("heading", name=f"Yandex · {EXTERNAL_ID}", exact=True, level=2)).to_be_visible()
    inspect(page, output, f"{prefix}-before-cancel")
    page.get_by_role("button", name="Отклонить", exact=True).click()
    expect(page.get_by_role("dialog")).to_contain_text("не оформляет возврат денег")
    expect(page.get_by_role("button", name="Подтвердить", exact=True)).to_be_disabled()
    inspect(page, output, f"{prefix}-cancel-confirmation")
    page.get_by_role("textbox", name="Причина отклонения", exact=True).fill("Синтетическая отмена после продажи")
    page.get_by_role("button", name="Подтвердить", exact=True).click()
    expect(page.get_by_role("dialog")).to_have_count(0)
    expect(page.get_by_text(re.compile("Нужна сверка учёта"))).to_be_visible()
    expect(page.get_by_text("Выдача: Отменён", exact=True)).to_be_visible()
    expect(page.get_by_text("Учёт: Продажа завершена", exact=True)).to_be_visible()
    expect(page.get_by_role("button", name="Отклонить", exact=True)).to_have_count(0)
    inspect(page, output, f"{prefix}-cancelled-reconciliation", screenshot=True)

    fixture.fail_detail = True
    page.get_by_role("button", name="Обновить заказ", exact=True).click()
    expect(page.get_by_role("alert")).to_be_visible()
    inspect(page, output, f"{prefix}-detail-error", screenshot=True)
    page.get_by_role("button", name="Обновить заказ", exact=True).click()
    expect(page.get_by_role("alert")).to_have_count(0)
    page.get_by_role("button", name="К списку Yandex", exact=True).click()
    fixture.fail_list = True
    page.get_by_role("button", name="Обновить Yandex", exact=True).click()
    expect(page.get_by_role("alert")).to_be_visible()
    inspect(page, output, f"{prefix}-list-error", screenshot=True)
    page.get_by_role("button", name="Uzum", exact=True).click()
    expect(page.get_by_role("region", name="Заказы Uzum", exact=True)).to_be_visible()
    inspect(page, output, f"{prefix}-uzum")
    page.get_by_role("button", name="Medicalka", exact=True).click()
    expect(page.get_by_role("heading", name="Medicalka zayavkalari", exact=True, level=2)).to_be_visible()
    inspect(page, output, f"{prefix}-medicalka")
    page.get_by_role("button", name="FairHaven", exact=True).click()
    expect(page.get_by_role("heading", name="Очередь спокойна", exact=True, level=2)).to_be_visible()
    inspect(page, output, f"{prefix}-fairhaven")
    assert len(fixture.writes) == 6, fixture.writes
    assert not fixture.unexpected_api, fixture.unexpected_api
    assert not fixture.fixture_errors, fixture.fixture_errors


def run(origin, output):
    output.mkdir(parents=True, exist_ok=True)
    report = {"result": "running", "origin": origin, "fixture_only": True, "viewports": [], "browser_error": None}
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            try:
                for width, height in ((1440, 1000), (390, 844)):
                    fixture = Fixtures(origin)
                    evidence = {"width": width, "height": height, "page_errors": [], "console_errors": [], "result": "running"}
                    report["viewports"].append(evidence)
                    context = browser.new_context(viewport={"width": width, "height": height}, service_workers="block")
                    context.route("**/*", fixture.route)
                    # Keep sockets disconnected. Synchronous socket.close deadlocks.
                    context.route_web_socket("**/*", lambda socket: None)
                    page = context.new_page()
                    page.on("pageerror", lambda error: evidence["page_errors"].append(str(error)))
                    page.on("console", lambda message: evidence["console_errors"].append(message.text) if message.type == "error" else None)
                    try:
                        exercise(page, fixture, output, width)
                        assert not evidence["page_errors"], evidence["page_errors"]
                        evidence["result"] = "passed"
                    finally:
                        evidence.update(writes=fixture.writes, unexpected_api=fixture.unexpected_api, blocked_external=fixture.blocked_external,
                                        expected_errors=fixture.expected_errors, fixture_errors=fixture.fixture_errors)
                        context.close()
                report["result"] = "passed"
            finally:
                browser.close()
    except Exception as error:
        report["result"] = "failed"
        report["browser_error"] = str(error)
        raise
    finally:
        report["screenshots"] = sorted(file.name for file in output.glob("*.png"))
        (output / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(report, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", type=local_origin, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    run(args.url, args.output_dir)


if __name__ == "__main__":
    main()
