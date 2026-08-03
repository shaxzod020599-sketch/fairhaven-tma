"""
Клиент FairHaven Health API — готовый модуль для интеграции.

Зеркалит структуру вашего medicalka_client.py: те же имена методов, та же
обработка ошибок, тот же приём с 404 → None на остатках. Зависимость одна —
requests.

    pip install requests
    python fairhaven_client.py     # прогонит полный цикл вживую

Ключи берутся из переменных окружения FAIRHAVEN_TOKEN и FAIRHAVEN_SECRET,
либо передаются в конструктор.
"""
from __future__ import annotations

import os
import time
import uuid
from decimal import Decimal
from typing import Any, Dict, List, Optional

import requests

# Переопределяется через FAIRHAVEN_BASE_URL — пригодится, если мы дадим вам
# тестовый контур до подключения к боевому.
BASE_URL = os.environ.get("FAIRHAVEN_BASE_URL", "https://api.fairhaven.uz/medicalka/v1")

# Статусы, которые принимает наш эндпоинт обновления.
PAID = "paid"
PAYMENT_CONFIRMED = "payment_confirmed"
CANCELLED = "cancelled"
CANCELLED_BY_BUYER = "cancelled_by_buyer"


class FairHavenError(Exception):
    """Любой ответ API, который не 2xx.

    .status  — HTTP-код
    .payload — тело ответа (dict), чтобы не гадать по строке
    """

    def __init__(self, status: int, payload: Any):
        self.status = status
        self.payload = payload
        detail = ""
        if isinstance(payload, dict):
            detail = payload.get("detail") or payload.get("code") or ""
        super().__init__(f"{status} {detail}".strip())


class FairHavenClient:
    def __init__(
        self,
        token: Optional[str] = None,
        secret: Optional[str] = None,
        base_url: str = BASE_URL,
        timeout: int = 30,
    ):
        self.token = token or os.environ.get("FAIRHAVEN_TOKEN", "")
        self.secret = secret or os.environ.get("FAIRHAVEN_SECRET", "")
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.session = requests.Session()

    # ── низкий уровень ──────────────────────────────────────────────────────

    def _request(
        self,
        method: str,
        path: str,
        *,
        use_secret: bool = False,
        params: Optional[Dict[str, Any]] = None,
        json_body: Optional[Dict[str, Any]] = None,
        allow_404: bool = False,
    ):
        key_name = "secret" if use_secret else "token"
        key_value = self.secret if use_secret else self.token
        if not key_value:
            raise FairHavenError(0, {"detail": f"{key_name} не задан"})

        query = dict(params or {})
        query[key_name] = key_value

        # 429 обрабатывается здесь, чтобы вызывающий код о нём не думал.
        for attempt in range(3):
            response = self.session.request(
                method,
                f"{self.base_url}{path}",
                params=query,
                json=json_body,
                timeout=self.timeout,
            )
            if response.status_code == 429 and attempt < 2:
                time.sleep(2 ** attempt)
                continue
            break

        if allow_404 and response.status_code == 404:
            return None
        if not response.ok:
            try:
                payload = response.json()
            except ValueError:
                payload = {"detail": response.text[:300]}
            raise FairHavenError(response.status_code, payload)
        return response.json()

    # ── шаг 1: доступ ───────────────────────────────────────────────────────

    def list_pharmacies(self) -> Dict[str, Any]:
        """Проверка ключа. Филиал один, поэтому в items всегда одна запись."""
        return self._request("GET", "/pharmacies")

    # ── шаг 2-3: каталог ────────────────────────────────────────────────────

    def list_products(self, skip: int = 0, limit: int = 50) -> Dict[str, Any]:
        """Каталог постранично. limit — максимум 1000."""
        return self._request("GET", "/products", params={"skip": skip, "limit": limit})

    def iter_products(self, page_size: int = 200):
        """Весь каталог одним проходом — генератор, без загрузки всего в память."""
        skip = 0
        while True:
            page = self.list_products(skip=skip, limit=page_size)
            items = page.get("items", [])
            if not items:
                return
            for item in items:
                yield item
            skip += len(items)
            if skip >= page.get("total", 0):
                return

    def search_products(self, query: str, skip: int = 0, limit: int = 50) -> Dict[str, Any]:
        """Поиск по названию, бренду, артикулу и штрихкоду одновременно."""
        return self._request(
            "GET", "/products/search", params={"q": query, "skip": skip, "limit": limit}
        )

    def get_product(self, product_id: int) -> Dict[str, Any]:
        return self._request("GET", f"/products/{int(product_id)}")

    # ── шаг 4: остатки ──────────────────────────────────────────────────────

    def list_inventory(self, skip: int = 0, limit: int = 100) -> Dict[str, Any]:
        """Только то, что реально есть в наличии. Отсутствующих в списке нет."""
        return self._request("GET", "/inventory", params={"skip": skip, "limit": limit})

    def get_stock(self, product_id: int, pharmacy_id: Optional[int] = None) -> Optional[Dict[str, Any]]:
        """Остаток одного товара.

        Нет в наличии → API отдаёт 404, метод возвращает None. Так не нужно
        ловить исключение на каждый отсутствующий товар.
        """
        params: Dict[str, Any] = {"product_id": int(product_id)}
        if pharmacy_id is not None:
            params["pharmacy_id"] = int(pharmacy_id)
        return self._request("GET", "/stock", params=params, allow_404=True)

    # ── шаг 5-6: заказы ─────────────────────────────────────────────────────

    def create_order(self, order: Dict[str, Any]) -> Dict[str, Any]:
        """Оформление заказа. Отправляется с секретом, а не с токеном.

        Повторная отправка того же order_id вернёт тот же wc_order_id и не
        создаст второй заказ — ретраить по таймауту безопасно.
        """
        return self._request("POST", "/orders", use_secret=True, json_body=order)

    def update_order_status(self, order_id: str, status: str) -> Dict[str, Any]:
        """Обновление статуса по ВАШЕМУ order_id — тому, что вы сгенерировали.

        Наш wc_order_id здесь тоже принимается, но хранить достаточно свой.
        """
        return self._request(
            "POST", f"/orders/{order_id}/status", use_secret=True, json_body={"status": status}
        )


# ── вспомогательное ─────────────────────────────────────────────────────────

def price_to_decimal(product: Dict[str, Any]) -> Decimal:
    """price приходит строкой ("301000.00"), не числом.

    Decimal, а не float: деньги на float дают 0.1 + 0.2 = 0.30000000000000004.
    """
    return Decimal(str(product["price"]))


def build_order(
    order_id: str,
    items: List[Dict[str, Any]],
    *,
    first_name: str,
    phone: str,
    address: str,
    last_name: str = "",
    order_number: str = "",
    delivery_type: str = "delivery",
) -> Dict[str, Any]:
    """Собирает тело заказа. pharmacy_id не нужен — филиал один."""
    return {
        "order_id": order_id,
        "order_number": order_number or order_id,
        "customer": {"first_name": first_name, "last_name": last_name, "phone": phone},
        "delivery_type": delivery_type,
        "delivery_address": address,
        "items": items,
    }


# ── полный цикл вживую ──────────────────────────────────────────────────────

def _demo() -> None:
    client = FairHavenClient()

    print("1. Проверка доступа")
    pharmacy = client.list_pharmacies()["items"][0]
    print(f"   {pharmacy['id']} {pharmacy['name']}")

    print("2. Каталог")
    page = client.list_products(limit=5)
    print(f"   всего товаров: {page['total']}")
    for item in page["items"][:3]:
        print(f"   {item['id']:>5}  {item['name'][:44]:<44} {item['price']}")

    if not page["items"]:
        print("   каталог пуст — дальше идти некуда")
        return
    product = page["items"][0]

    print("3. Поиск")
    found = client.search_products(product["name"].split()[0], limit=3)
    print(f"   совпадений: {found['total']}")

    print("4. Остаток")
    stock = client.get_stock(product["id"])
    if stock is None:
        print("   нет в наличии")
        return
    print(f"   {stock['quantity']} шт по {stock['price']}")

    print("5. Заказ")
    order = build_order(
        order_id=str(uuid.uuid4()),
        items=[{"product_id": product["id"], "name": product["name"], "quantity": 1}],
        first_name="Тест",
        phone="+998900000000",
        address="г. Ташкент",
    )
    created = client.create_order(order)
    print(f"   wc_order_id={created['wc_order_id']} status={created['status']}")

    print("6. Статус")
    updated = client.update_order_status(order["order_id"], CANCELLED_BY_BUYER)
    print(f"   {updated['status']}")


if __name__ == "__main__":
    try:
        _demo()
    except FairHavenError as error:
        print(f"\nОшибка API: {error.status}")
        print(f"   {error.payload}")
