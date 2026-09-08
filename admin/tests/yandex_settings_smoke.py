#!/usr/bin/env python3
"""Exercise the local admin UI with synthetic API fixtures and no backend.

Run with system Python and an already running local admin preview/dev server:
  python3 admin/tests/yandex_settings_smoke.py --url http://127.0.0.1:4173 \
      --output-dir /tmp/yandex-settings-proof
The script never starts a server, authenticates remotely, or issues credentials.
"""

import argparse
from copy import deepcopy
import json
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit

from playwright.sync_api import expect, sync_playwright


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
        raise argparse.ArgumentTypeError("Use a localhost/127.0.0.1 origin with an explicit port and no credentials, path or query")
    return f"{parsed.scheme}://{parsed.hostname}:{port}"


def fixture_product():
    return {
        "_id": "fixture-product", "name": "Local packaging fixture", "brand": "Fixture",
        "category": "vitamins", "price": 40000, "oldPrice": 0, "images": [], "imageUrl": "",
        "sku": "LOCAL-01", "barcode": "1234567890128", "mxikCode": "", "packageCode": "",
        "billzProductId": "fixture-billz", "isAvailable": False,
        "billz": {
            "name": "Local warehouse fixture", "sku": "LOCAL-01", "barcode": "1234567890128",
            "retailPrice": 40000, "stock": 12, "available": 12, "reservedQty": 0,
            "pendingQty": 0, "deletedInBillz": False, "syncedAt": "2026-09-08T00:00:00Z",
        },
        "channels": {
            "medicalka": {"enabled": True, "price": 51000, "oldPrice": 55000, "forceStatus": "auto", "minStock": 1, "live": False},
            "uzum": {"enabled": True, "price": 62000, "oldPrice": 66000, "forceStatus": "out", "minStock": 2, "live": False},
            "yandex": {"enabled": False, "price": 73000, "oldPrice": 79000, "forceStatus": "out", "minStock": 4, "live": False, "measure": None, "barcodeType": ""},
        },
    }


class Fixtures:
    def __init__(self, origin):
        self.origin = origin
        self.product = fixture_product()
        self.original_channels = deepcopy(self.product["channels"])
        self.fail_next_save = False
        self.writes = []
        self.blocked_external = []
        self.unexpected_api = []

    def route(self, route):
        request = route.request
        target = urlsplit(request.url)
        if f"{target.scheme}://{target.netloc}" != self.origin:
            self.blocked_external.append(f"{target.scheme}://{target.netloc}{target.path}")
            route.abort()
            return
        path = unquote(target.path)
        if path != "/api" and not path.startswith("/api/"):
            route.continue_()
            return

        # Every API URL is intercepted, including unexpected endpoints. Nothing
        # can fall through to a dev-server proxy or a local backend.
        def respond(data=None, status=200):
            body = {"success": status < 400, "data": data, "meta": {"total": 1}}
            if status >= 400:
                body["error"] = "fixture_unavailable"
            route.fulfill(status=status, content_type="application/json", body=json.dumps(body))

        reads = {
            "/api/admin/auth/whoami": {"isAdmin": True, "firstName": "Fixture admin", "telegramId": 901, "csrfToken": "local-fixture-csrf"},
            "/api/admin/channels/settings": {"defaultMxikCode": "12345678901234567", "defaultPackageCode": "1234567", "channels": ["medicalka", "uzum", "yandex"]},
            "/api/admin/channels/summary": {"counts": {"total": 1, "no_mxik": 1, "no_package": 1}},
            "/api/admin/channels/sync": {"mirrorTotal": 1, "last": None},
            "/api/admin/channels/keys": [{"id": "fixture-yandex-key", "channel": "yandex", "kind": "oauth", "active": True, "label": "Synthetic fixture", "fingerprint": "fixture…0000", "clientId": "fixture-client-id"}],
            "/api/admin/channels/medicalka/partner": {"activeEnvironment": "", "profiles": []},
            "/api/admin/channels/products": [self.product],
        }
        if request.method == "GET" and path in reads:
            respond(reads[path])
        elif request.method == "PATCH" and path == "/api/admin/channels/products/fixture-product/yandex":
            patch = request.post_data_json
            self.writes.append({"path": path, "body": deepcopy(patch)})
            assert request.headers.get("x-fh-csrf") == "local-fixture-csrf"
            assert set(patch) <= {"enabled", "price", "minStock", "forceStatus", "measure", "barcodeType"}
            if "measure" in patch and patch["measure"] is not None:
                measure = patch["measure"]
                assert set(measure) == {"unit", "value"}
                assert measure["unit"] in ("GRM", "MLT")
                assert type(measure["value"]) is int and measure["value"] > 0
            if "barcodeType" in patch:
                assert patch["barcodeType"] in ("", "code128b")
            if self.fail_next_save:
                self.fail_next_save = False
                respond(status=503)
            else:
                self.product["channels"]["yandex"].update(patch)
                respond(self.product)
        else:
            self.unexpected_api.append(f"{request.method} {path}")
            respond(status=404)

    def assert_other_channels_unchanged(self):
        for channel in ("medicalka", "uzum"):
            assert self.product["channels"][channel] == self.original_channels[channel]
        assert self.product["price"] == 40000
        assert self.product["channels"]["yandex"]["oldPrice"] == 79000


def inspect(page, output, name):
    page.wait_for_load_state("networkidle")
    # Capture rendered labels/headings before using the role/label selectors.
    dom = page.locator("body").evaluate("""body => ({
        headings: [...body.querySelectorAll('h1,h2,h3')].map(el => el.textContent),
        controls: [...body.querySelectorAll('input,select,button')].map(el => ({
            role: el.getAttribute('role') || el.tagName.toLowerCase(),
            name: el.getAttribute('aria-label') || [...(el.labels || [])].map(label => label.textContent).join(' ') || el.textContent,
            disabled: el.disabled
        }))
    })""")
    (output / f"{name}-dom.json").write_text(json.dumps(dom, ensure_ascii=False, indent=2), encoding="utf-8")


def run(origin, output):
    output.mkdir(parents=True, exist_ok=True)
    fixtures = Fixtures(origin)
    with sync_playwright() as playwright:
        # A missing browser raises Playwright's exact executable-path error.
        # No download, global installation or site-permission workaround.
        browser = playwright.chromium.launch(headless=True)
        try:
            context = browser.new_context(viewport={"width": 1440, "height": 1000}, service_workers="block")
            context.route("**/*", fixtures.route)
            # No-op routes stay disconnected; synchronous close can deadlock.
            context.route_web_socket("**/*", lambda socket: None)
            page = context.new_page()
            page_errors = []
            page.on("pageerror", lambda error: page_errors.append(str(error)))
            page.goto(f"{origin}/connections")
            inspect(page, output, "connections-desktop")
            expect(page.get_by_role("heading", name="Yandex", exact=True, level=2)).to_be_visible()
            expect(page.get_by_text(re.compile(r"^Запуск не подтверждён\. Yandex выключен"))).to_be_visible()
            expect(page.get_by_role("button", name="Создать доступ Yandex", exact=True)).to_be_visible()
            page.screenshot(path=str(output / "connections-desktop.png"), full_page=True)
            assert not fixtures.writes

            page.get_by_role("link", name="Товары", exact=True).click()
            inspect(page, output, "products-desktop")
            row = page.get_by_role("group", name="Настройки Yandex для Local packaging fixture", exact=True)
            expect(row.get_by_text(re.compile("Для Yandex заполните ИКПУ и код упаковки"))).to_be_visible()
            missing = row.get_by_text(re.compile("Укажите реальный вес или объём упаковки и тип штрихкода"))
            expect(missing).to_be_visible()
            expect(row.get_by_role("checkbox")).not_to_be_checked()
            unit = row.get_by_role("combobox", name="Единица измерения", exact=True)
            value = row.get_by_role("spinbutton", name="Вес или объём упаковки", exact=True)
            barcode = row.get_by_role("combobox", name="Тип штрихкода", exact=True)
            expect(unit).to_be_enabled()
            expect(value).to_have_value("")
            expect(barcode).to_have_value("")
            unit.select_option("MLT")
            value.fill("250")
            barcode.select_option("code128b")
            row.get_by_role("button", name="Сохранить", exact=True).click()
            expect(row.get_by_role("button", name="Сохранить", exact=True)).to_have_count(0)
            expect(row.get_by_role("alert")).to_have_count(0)
            assert fixtures.writes == [{"path": "/api/admin/channels/products/fixture-product/yandex", "body": {
                "enabled": False, "price": 73000, "forceStatus": "out", "minStock": 4,
                "measure": {"unit": "MLT", "value": 250}, "barcodeType": "code128b",
            }}]
            fixtures.assert_other_channels_unchanged()

            page.reload()
            inspect(page, output, "products-saved-desktop")
            expect(unit).to_have_value("MLT")
            expect(value).to_have_value("250")
            expect(barcode).to_have_value("code128b")
            expect(missing).to_have_count(0)
            for channel, price in (("Medicalka", "51000"), ("Uzum Tezkor", "62000")):
                other = page.get_by_role("group", name=f"Настройки {channel} для Local packaging fixture", exact=True)
                expect(other.get_by_role("checkbox")).to_be_checked()
                expect(other.get_by_role("spinbutton", name=re.compile("Цена на этой площадке"))).to_have_value(price)
            page.screenshot(path=str(output / "products-desktop.png"), full_page=True)

            fixtures.fail_next_save = True
            value.fill("300")
            row.get_by_role("button", name="Сохранить", exact=True).click()
            expect(row.get_by_role("alert")).to_contain_text("Не удалось сохранить")
            expect(value).to_have_value("300")
            assert fixtures.product["channels"]["yandex"]["measure"]["value"] == 250
            page.screenshot(path=str(output / "products-error-desktop.png"), full_page=True)
            row.get_by_role("button", name="Сохранить", exact=True).click()
            expect(row.get_by_role("alert")).to_have_count(0)
            expect(row.get_by_role("button", name="Сохранить", exact=True)).to_have_count(0)
            assert fixtures.product["channels"]["yandex"]["measure"] == {"unit": "MLT", "value": 300}

            page.set_viewport_size({"width": 390, "height": 844})
            inspect(page, output, "products-mobile")
            expect(unit).to_be_visible()
            expect(value).to_have_value("300")
            expect(barcode).to_have_value("code128b")
            page.screenshot(path=str(output / "products-390.png"), full_page=True)
            row.get_by_role("button", name="Очистить вес / объём", exact=True).click()
            barcode.select_option("")
            row.get_by_role("button", name="Сохранить", exact=True).click()
            expect(row.get_by_role("button", name="Сохранить", exact=True)).to_have_count(0)
            expect(missing).to_be_visible()
            expect(value).to_have_value("")
            assert fixtures.product["channels"]["yandex"]["measure"] is None
            assert fixtures.product["channels"]["yandex"]["barcodeType"] == ""
            fixtures.assert_other_channels_unchanged()
            assert len(fixtures.writes) == 4
            assert not fixtures.unexpected_api, fixtures.unexpected_api
            assert not page_errors, page_errors
            report = {"result": "passed", "origin": origin, "fixture_only": True,
                      "writes": fixtures.writes, "blocked_external": fixtures.blocked_external,
                      "screenshots": sorted(file.name for file in output.glob("*.png"))}
            (output / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
            print(json.dumps(report, ensure_ascii=False, indent=2))
        finally:
            browser.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", type=local_origin, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    run(args.url, args.output_dir)


if __name__ == "__main__":
    main()
