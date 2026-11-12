"""
Клиент FairHaven Partner API v1 — готовый модуль для интеграции.

Все методы API, понятные исключения с кодом ошибки и проверка подписи
webhook. Зависимость одна — requests.

    pip install requests
    export FAIRHAVEN_TOKEN='fhp_t_…'      # токен чтения
    export FAIRHAVEN_SECRET='fhp_s_…'     # секрет заказов
    python partner_client.py              # тестовый цикл (только в режиме test)

Подробное руководство — partner-api.ru.md, контракт — partner-api.openapi.yaml.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import time
import uuid
from typing import Any, Dict, Iterator, List, Optional

import requests

BASE_URL = os.environ.get("FAIRHAVEN_BASE_URL", "https://api.fairhaven.uz/partner/v1")

# Статусы заказа
NEW = "new"
ACCEPTED = "accepted"
REJECTED = "rejected"
CANCELLED = "cancelled"
COMPLETED = "completed"
FINAL_STATUSES = frozenset({REJECTED, CANCELLED, COMPLETED})


# ── Ошибки ───────────────────────────────────────────────────────────────────

class FairHavenError(Exception):
    """Любой ответ API, кроме 2xx.

    .status   — HTTP-код (None, если ответа не было)
    .code     — error.code из ответа ("insufficient_stock", "invalid_status", …)
    .message  — error.message
    .details  — error.details (dict) или {}
    .retry_after — секунды из Retry-After (для 429), иначе None
    """

    def __init__(self, status: Optional[int], code: str, message: str,
                 details: Optional[Dict[str, Any]] = None, retry_after: Optional[int] = None):
        super().__init__(f"{status} {code}: {message}")
        self.status = status
        self.code = code
        self.message = message
        self.details = details or {}
        self.retry_after = retry_after


class AuthError(FairHavenError):
    """401 unauthorized — ключ не передан, неверен, отозван или не тот."""


class PartnerDisabled(FairHavenError):
    """403 partner_disabled — доступ выключен, свяжитесь с FairHaven."""


class NotFound(FairHavenError):
    """404 — product_not_found, order_not_found, not_found."""


class InsufficientStock(FairHavenError):
    """409 insufficient_stock — .shortages: [{product_id, requested, available}]."""

    @property
    def shortages(self) -> List[Dict[str, int]]:
        return list(self.details.get("items") or [])


class InvalidStatus(FairHavenError):
    """409 invalid_status — действие недоступно; .current_status — текущий статус."""

    @property
    def current_status(self) -> Optional[str]:
        return self.details.get("status")


class OrderBusy(FairHavenError):
    """409 order_busy — заказ меняется другим действием, повторите через секунды."""


class ValidationError(FairHavenError):
    """400 invalid_json, 413 payload_too_large, 422 validation_error — исправьте запрос."""


class RateLimited(FairHavenError):
    """429 — превышен лимит запросов; ждите .retry_after секунд."""


class RetryLater(FairHavenError):
    """5xx — временная ошибка: повторите позже (кроме sale_pending_review)."""


class SalePendingReview(RetryLater):
    """503 sale_pending_review — НЕ повторяйте: статус заказа сменится сам."""


_BY_CODE = {
    "unauthorized": AuthError,
    "partner_disabled": PartnerDisabled,
    "product_not_found": NotFound,
    "order_not_found": NotFound,
    "not_found": NotFound,
    "insufficient_stock": InsufficientStock,
    "invalid_status": InvalidStatus,
    "order_busy": OrderBusy,
    "invalid_json": ValidationError,
    "payload_too_large": ValidationError,
    "validation_error": ValidationError,
    "sale_pending_review": SalePendingReview,
}


def _error_from(resp: requests.Response) -> FairHavenError:
    try:
        body = resp.json()
    except ValueError:
        body = None
    retry_after = None
    if resp.headers.get("Retry-After", "").isdigit():
        retry_after = int(resp.headers["Retry-After"])

    if resp.status_code == 429:
        detail = body.get("detail") if isinstance(body, dict) else None
        return RateLimited(429, "rate_limited", detail or "too many requests", None, retry_after)

    err = body.get("error") if isinstance(body, dict) else None
    if not isinstance(err, dict):
        cls = RetryLater if resp.status_code >= 500 else FairHavenError
        return cls(resp.status_code, f"http_{resp.status_code}", (resp.text or "")[:300])

    code = str(err.get("code") or f"http_{resp.status_code}")
    cls = _BY_CODE.get(code) or (RetryLater if resp.status_code >= 500 else FairHavenError)
    return cls(resp.status_code, code, str(err.get("message") or ""), err.get("details"), retry_after)


# ── Клиент ───────────────────────────────────────────────────────────────────

class PartnerClient:
    """Тонкая обёртка над HTTP API. Методы возвращают разобранный JSON (dict).

    token  — токен чтения fhp_t_… (каталог, остатки, просмотр заказов)
    secret — секрет заказов fhp_s_… (создание, отмена, завершение, /webhook/test)

    Можно передать только secret: он подходит и для чтения.
    """

    def __init__(self, token: Optional[str] = None, secret: Optional[str] = None,
                 base_url: str = BASE_URL, timeout: float = 30.0,
                 session: Optional[requests.Session] = None):
        self.token = token or os.environ.get("FAIRHAVEN_TOKEN") or None
        self.secret = secret or os.environ.get("FAIRHAVEN_SECRET") or None
        if not self.token and not self.secret:
            raise ValueError("нужен хотя бы один ключ: FAIRHAVEN_TOKEN или FAIRHAVEN_SECRET")
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.http = session or requests.Session()
        self.http.headers.update({"Accept": "application/json", "User-Agent": "fairhaven-partner-client/1.0"})

    # ── транспорт ──

    def _key(self, write: bool) -> str:
        if write:
            if not self.secret:
                raise ValueError("для этого метода нужен секрет заказов (FAIRHAVEN_SECRET)")
            return self.secret
        return self.token or self.secret  # type: ignore[return-value]

    def _request(self, method: str, path: str, *, write: bool = False,
                 params: Optional[Dict[str, Any]] = None, body: Optional[Dict[str, Any]] = None) -> Any:
        headers = {"Authorization": f"Bearer {self._key(write)}"}
        resp = self.http.request(method, self.base_url + path, params=params, json=body,
                                 headers=headers, timeout=self.timeout)
        if not 200 <= resp.status_code < 300:
            raise _error_from(resp)
        return resp.json()

    def _pages(self, path: str, page_size: int = 500, **params: Any) -> Iterator[Dict[str, Any]]:
        """Перебирает все страницы списка (/products, /stock, /orders)."""
        offset = 0
        while True:
            page = self._request("GET", path, params={**params, "limit": page_size, "offset": offset})
            items = page.get("items") or []
            yield from items
            offset += len(items)
            if not items or offset >= int(page.get("total") or 0):
                return

    # ── доступ ──

    def me(self) -> Dict[str, Any]:
        """GET /me — проверка ключа; partner.mode = test | live."""
        return self._request("GET", "/me")

    # ── каталог и остатки ──

    def products(self, limit: int = 100, offset: int = 0, search: Optional[str] = None) -> Dict[str, Any]:
        """GET /products — одна страница каталога {items, total, limit, offset}."""
        params: Dict[str, Any] = {"limit": limit, "offset": offset}
        if search:
            params["search"] = search
        return self._request("GET", "/products", params=params)

    def all_products(self, search: Optional[str] = None) -> List[Dict[str, Any]]:
        """Весь каталог, все страницы."""
        return list(self._pages("/products", **({"search": search} if search else {})))

    def product(self, product_id: int) -> Dict[str, Any]:
        """GET /products/{id} — один товар; NotFound, если его больше нет в каталоге."""
        return self._request("GET", f"/products/{int(product_id)}")

    def stock(self, limit: int = 500, offset: int = 0) -> Dict[str, Any]:
        """GET /stock — одна страница остатков (с generated_at)."""
        return self._request("GET", "/stock", params={"limit": limit, "offset": offset})

    def all_stock(self) -> Dict[int, Dict[str, Any]]:
        """Все остатки: {product_id: {quantity, available, price}}.

        Товара нет в результате — он убран из каталога, снимите его с витрины.
        """
        return {row["product_id"]: row for row in self._pages("/stock")}

    # ── заказы ──

    def create_order(self, order_id: str, items: List[Dict[str, int]], *,
                     customer: Optional[Dict[str, str]] = None,
                     delivery: Optional[Dict[str, str]] = None,
                     comment: Optional[str] = None,
                     test_outcome: Optional[str] = None) -> Dict[str, Any]:
        """POST /orders. Повтор с тем же order_id безопасен — вернётся тот же заказ.

        items: [{"product_id": 701, "quantity": 2}, …]
        delivery: {"type": "courier" | "pickup", "address": …, "comment": …}
        test_outcome: "reject" — только в режиме test, робот отклонит заказ.

        Ошибки: InsufficientStock (.shortages), NotFound, ValidationError.
        """
        body: Dict[str, Any] = {"order_id": order_id, "items": items}
        if customer:
            body["customer"] = customer
        if delivery:
            body["delivery"] = delivery
        if comment:
            body["comment"] = comment
        if test_outcome:
            body["test_outcome"] = test_outcome
        return self._request("POST", "/orders", write=True, body=body)

    def order(self, order_id: str) -> Dict[str, Any]:
        """GET /orders/{order_id} — заказ по вашему номеру."""
        return self._request("GET", f"/orders/{_path(order_id)}")

    def orders(self, status: Optional[str] = None, limit: int = 100, offset: int = 0) -> Dict[str, Any]:
        """GET /orders — страница ваших заказов, новые сверху."""
        params: Dict[str, Any] = {"limit": limit, "offset": offset}
        if status:
            params["status"] = status
        return self._request("GET", "/orders", params=params)

    def all_orders(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        return list(self._pages("/orders", **({"status": status} if status else {})))

    def cancel(self, order_id: str, reason: Optional[str] = None) -> Dict[str, Any]:
        """POST /orders/{order_id}/cancel — из new или accepted. reason — до 200 символов."""
        body = {"reason": reason} if reason else {}
        return self._request("POST", f"/orders/{_path(order_id)}/cancel", write=True, body=body)

    def complete(self, order_id: str) -> Dict[str, Any]:
        """POST /orders/{order_id}/complete — заказ доставлен И оплачен; проводит продажу.

        Повторный вызов для уже завершённого заказа считается успехом: вернётся
        текущий заказ. SalePendingReview — не повторять, статус сменится сам.
        """
        try:
            return self._request("POST", f"/orders/{_path(order_id)}/complete", write=True)
        except InvalidStatus as err:
            if err.current_status == COMPLETED:
                return self.order(order_id)
            raise

    def wait_for_decision(self, order_id: str, timeout: float = 600, interval: float = 5) -> Dict[str, Any]:
        """Опрос GET /orders/{order_id}, пока статус new. Без webhook — так.

        Возвращает заказ в accepted / rejected / cancelled. TimeoutError — если
        за timeout секунд решения нет.
        """
        deadline = time.monotonic() + timeout
        while True:
            current = self.order(order_id)
            if current["status"] != NEW:
                return current
            if time.monotonic() >= deadline:
                raise TimeoutError(f"заказ {order_id} всё ещё new после {timeout} с")
            time.sleep(interval)

    # ── webhook ──

    def webhook_test(self) -> Dict[str, Any]:
        """POST /webhook/test — ping на ваш адрес: {delivered, status_code, error}."""
        return self._request("POST", "/webhook/test", write=True)


def _path(order_id: str) -> str:
    return requests.utils.quote(str(order_id), safe="")


# ── Проверка подписи webhook ─────────────────────────────────────────────────

def verify_webhook(secret: str, timestamp: str, raw_body: bytes, signature: str,
                   max_age: int = 300) -> bool:
    """Проверяет, что webhook прислал FairHaven и он не устарел.

    secret    — секрет подписи whsec_…
    timestamp — заголовок X-FairHaven-Timestamp (строка, Unix-секунды)
    raw_body  — СЫРОЕ тело запроса (bytes), до разбора JSON
    signature — заголовок X-FairHaven-Signature ("v1=<hex>")
    max_age   — сколько секунд событие считается свежим (по умолчанию 5 минут)
    """
    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    timestamp = str(timestamp or "").strip()
    try:
        sent_at = int(timestamp)
    except ValueError:
        return False
    if abs(time.time() - sent_at) > max_age:
        return False
    expected = hmac.new(secret.encode("utf-8"), timestamp.encode("ascii") + b"." + raw_body,
                        hashlib.sha256).hexdigest()
    return hmac.compare_digest(f"v1={expected}", str(signature or "").strip())


# ── Демонстрация: тестовый цикл ──────────────────────────────────────────────

def _demo() -> None:
    client = PartnerClient(base_url=os.environ.get("FAIRHAVEN_BASE_URL", BASE_URL))

    me = client.me()
    mode = me["partner"]["mode"]
    print(f"Партнёр: {me['partner']['name']} · режим {mode} · ключ {me['key']}")
    if mode != "test":
        print("Демо создаёт заказы и запускается только в режиме test. Выход.")
        return

    stock = client.all_stock()
    in_stock = [row for row in stock.values() if row["available"]]
    print(f"Товаров в каталоге: {len(stock)}, в наличии: {len(in_stock)}")
    if not in_stock:
        print("Нет товаров в наличии — заказ не на что оформить.")
        return
    pick = in_stock[0]
    print(f"Берём товар {pick['product_id']}: {pick['quantity']} шт. по {pick['price']} сум")

    def new_id() -> str:
        return f"TEST-{uuid.uuid4().hex[:12]}"

    # 1. Принятый заказ → complete
    order_id = new_id()
    created = client.create_order(
        order_id,
        [{"product_id": pick["product_id"], "quantity": 1}],
        customer={"name": "Тестовый покупатель", "phone": "+998900000000"},
        delivery={"type": "courier", "address": "Тестовый адрес, 1"},
    )
    print(f"[1] {order_id}: создан №{created['id']}, {created['status']}, сумма {created['total']},"
          f" решение до {created['decision_deadline']}")
    again = client.create_order(order_id, [{"product_id": pick["product_id"], "quantity": 1}])
    print(f"[1] повтор того же order_id → тот же заказ №{again['id']}")
    decided = client.wait_for_decision(order_id, timeout=120, interval=3)
    print(f"[1] решение: {decided['status']}")
    if decided["status"] == ACCEPTED:
        done = client.complete(order_id)
        print(f"[1] complete → {done['status']}")

    # 2. Отказ робота (test_outcome=reject)
    order_id = new_id()
    client.create_order(order_id, [{"product_id": pick["product_id"], "quantity": 1}], test_outcome="reject")
    decided = client.wait_for_decision(order_id, timeout=120, interval=3)
    print(f"[2] {order_id}: {decided['status']} ({decided['reason']})")

    # 3. Отмена до решения
    order_id = new_id()
    client.create_order(order_id, [{"product_id": pick["product_id"], "quantity": 1}])
    cancelled = client.cancel(order_id, reason="Покупатель отказался")
    print(f"[3] {order_id}: {cancelled['status']} ({cancelled['reason']})")

    # 4. Больше, чем есть
    try:
        client.create_order(new_id(), [{"product_id": pick["product_id"], "quantity": min(pick["quantity"] + 1, 999)}])
        print("[4] неожиданно: заказ принят")
    except InsufficientStock as err:
        print(f"[4] insufficient_stock: {err.shortages}")

    # 5. Webhook (если адрес задан)
    if me.get("webhook_configured"):
        print(f"[5] webhook ping: {client.webhook_test()}")
    else:
        print("[5] webhook не настроен — пропускаем ping")


if __name__ == "__main__":
    try:
        _demo()
    except FairHavenError as err:
        print(f"Ошибка API: {err} {err.details or ''}")
        raise SystemExit(1)
