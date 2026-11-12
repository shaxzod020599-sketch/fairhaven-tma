# FairHaven Partner API · v1

Краткое руководство для разработчиков партнёра: каталог и остатки аптеки
FairHaven Health, отправка заказов, статусы и уведомления.

Обычный HTTPS + JSON. Полный контракт (OpenAPI 3) —
`https://api.fairhaven.uz/partner/openapi.yaml` (открывается без ключа,
импортируется в Postman / Swagger). Готовый модуль на Python —
`partner_client.py`.

---

## 1. Подключение

| Что | Значение |
|---|---|
| Базовый адрес | `https://api.fairhaven.uz/partner/v1` |
| Токен чтения `fhp_t_…` | `/me`, каталог, остатки, просмотр заказов |
| Секрет заказов `fhp_s_…` | всё то же **плюс** создание, отмена, завершение заказов и `/webhook/test` |
| Секрет подписи webhook `whsec_…` | выдаётся, когда вы сообщите адрес webhook |

Ключ передаётся в заголовке `Authorization: Bearer <ключ>` (или
`X-Api-Key: <ключ>`); в адресе (`?token=`) не принимается. Ключи приходят
отдельным сообщением — храните их в переменных окружения, не в коде и не в
логах. Если ключ мог утечь, напишите нам: выпустим новую пару, старая сразу
перестанет работать.

```bash
export FAIRHAVEN_TOKEN='fhp_t_…'   # токен чтения
export FAIRHAVEN_SECRET='fhp_s_…'  # секрет заказов
export FH='https://api.fairhaven.uz/partner/v1'
```

```bash
curl -s "$FH/me" -H "Authorization: Bearer $FAIRHAVEN_TOKEN"
```

`GET /me` возвращает ваш код, название и режим (`partner.mode`), тип ключа
(`key`: `token` / `secret`) и `webhook_configured`.

### Режимы

| Режим | Что происходит |
|---|---|
| `test` | Весь API работает, каталог и остатки настоящие. Заказы проходят все статусы, но **не трогают** склад и учёт; решение принимает робот через ~10–15 с. |
| `live` | Заказы получает оператор аптеки, товар резервируется, после `complete` проводится продажа. |
| `off` | Любой запрос — `403 partner_disabled`. |

Все начинают в `test`. После тестов (раздел 6) мы переключаем вас в `live`;
ключи не меняются. У каждого заказа есть поле `test: true/false`.

---

## 2. Общие правила

- **Формат** — JSON в UTF-8, для `POST` с телом — `Content-Type: application/json`.
  Тело больше 256 КБ — `413` (ответ может быть не в JSON).
- **Деньги** — целые сумы (UZS): `145000` = 145 000 сум. **Количество** — штуки.
  **Время** — ISO 8601 UTC (Ташкент — UTC+5).
- **Списки** (`/products`, `/stock`, `/orders`) — `limit` 1–500 (по умолчанию
  100) и `offset` с 0; ответ `{"items": [...], "total", "limit", "offset"}`.
  Забирайте страницы, пока `offset < total`.
- **Ошибки** — `{"error": {"code", "message", "details"?}}`. Решения
  принимайте по `error.code` (раздел 4).
- **Лимиты** — 240 запросов в минуту на ключ (`429` с `Retry-After`) и 300 в
  минуту на IP для всех ключей вместе (`429` без `Retry-After` — подождите
  1–5 с). Отказов по неверному ключу — не более 300 за 5 минут с одного IP.
  При опросе по этому руководству лимиты не достигаются.

---

## 3. Каталог и остатки

### `GET /products`, `GET /products/{id}`

Параметры списка: `limit`, `offset`, `search` (название, бренд, артикул или
штрихкод, до 100 символов). Сортировка по названию. Нет товара — `404
product_not_found`. Карточки меняются редко: полной выгрузки раз в час или в
сутки достаточно.

```bash
curl -s "$FH/products?limit=100&offset=0" -H "Authorization: Bearer $FAIRHAVEN_TOKEN"
```

| Поле | Что это |
|---|---|
| `id` | Номер товара — используйте его в заказе как `product_id`. |
| `name`, `name_uz`, `description`, `description_uz` | Название и описание (RU/UZ, могут быть пустыми). |
| `brand`, `category`, `category_name` | Категории: `cosmetics`, `parapharmaceuticals`, `supplements`, `vitamins`, `hygiene`, `drinks`. |
| `barcode`, `sku`, `images` | Штрихкод, артикул, фото (первое — главное). |
| `mxik`, `package_code` | ИКПУ и код упаковки для чека. |
| `price`, `old_price` | Цена за штуку; цена до скидки или `null`. |
| `quantity`, `available` | Сколько можно заказать сейчас (как в `/stock`). |
| `updated_at` | Когда карточка менялась. |

### `GET /stock` — остатки и цены

```bash
curl -s "$FH/stock?limit=500" -H "Authorization: Bearer $FAIRHAVEN_TOKEN"
```

```json
{
  "items": [
    { "product_id": 701, "quantity": 12, "available": true,  "price": 145000 },
    { "product_id": 702, "quantity": 0,  "available": false, "price": 89000 }
  ],
  "total": 2, "limit": 500, "offset": 0, "generated_at": "2026-11-12T08:00:01.000Z"
}
```

- В ответе **все** товары каталога, включая закончившиеся (`quantity: 0`).
  Пропавший из списка товар убран из каталога — снимите его с витрины.
- `quantity` — сколько можно продать именно вам; заказывать больше нельзя.
- Опрашивайте раз в 1–5 минут и показывайте цену из последнего ответа.
  Окончательную проверку делает `POST /orders`.

---

## 4. Заказы

### Создание: `POST /orders` (секрет заказов)

```bash
curl -s -X POST "$FH/orders" \
  -H "Authorization: Bearer $FAIRHAVEN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
        "order_id": "A-100045",
        "items": [ { "product_id": 701, "quantity": 2 } ],
        "customer": { "name": "Тестовый покупатель", "phone": "+998900000000" },
        "delivery": { "type": "courier", "address": "Ташкент, тестовый адрес, 1" },
        "comment": "Позвонить за 15 минут"
      }'
```

| Поле | Что это |
|---|---|
| `order_id` * | **Ваш** уникальный номер: до 64 печатных ASCII-символов без пробелов. |
| `items[]` * | 1–50 строк `{product_id, quantity}`, `quantity` 1–999. |
| `customer.name`, `customer.phone` | До 100 и 32 символов. |
| `delivery.type` | `courier` (по умолчанию) или `pickup` (самовывоз из аптеки). |
| `delivery.address`, `delivery.comment`, `comment` | До 300, 500 и 500 символов. |
| `test_outcome` | Только в `test`: `"reject"` — робот отклонит заказ. |

\* — обязательно. Цены не передаются: заказ считается по нашему каталогу, цены
и суммы строк возвращаются в ответе — сверьте их со своими.

Ответ `201` — заказ создан. Повтор с тем же `order_id` безопасен (например,
если ответ не дошёл): `200` и **тот же** заказ, второго не будет, новое тело не
применяется. Если первая попытка вернула ошибку, заказ не создан и номер
свободен.

```json
{
  "id": 1042, "order_id": "A-100045", "status": "new", "reason": null, "test": true,
  "items": [ { "product_id": 701, "name": "Витамин D3 2000 МЕ, 60 капсул", "quantity": 2, "price": 145000, "total": 290000 } ],
  "total": 290000,
  "customer": { "name": "Тестовый покупатель", "phone": "+998900000000" },
  "delivery": { "type": "courier", "address": "Ташкент, тестовый адрес, 1", "comment": "" },
  "comment": "Позвонить за 15 минут",
  "decision_deadline": "2026-11-12T08:05:00.000Z",
  "created_at": "2026-11-12T08:00:00.000Z", "updated_at": "2026-11-12T08:00:00.000Z",
  "history": [ { "status": "new", "at": "2026-11-12T08:00:00.000Z", "reason": null } ]
}
```

`id` — наш номер заказа (назовите его, если звоните в аптеку).
`decision_deadline` — до какого времени аптека ответит (только у `new`).
Изменить заказ нельзя: отмените его и отправьте новый с новым `order_id`.

### Статусы

| Статус | Что значит | Товар (в `live`) | Ваши действия |
|---|---|---|---|
| `new` | Аптека решает (обычно до 5 минут, срок — в `decision_deadline`). | Снят с продажи в других каналах. | Ждать; можно отменить. |
| `accepted` | Аптека приняла. | В резерве. | Доставить, затем `complete` или `cancel`. |
| `rejected` | Отклонён (`reason: rejected_by_shop`) или аптека не ответила вовремя (`timeout`). | Вернулся в продажу. | Сообщить покупателю. |
| `cancelled` | Отменён вами (ваш текст или `cancelled_by_partner`) или аптекой (`cancelled_by_shop`). | Вернулся в продажу. | — |
| `completed` | Вы подтвердили доставку и оплату. | Продан. | — |

`rejected`, `cancelled` и `completed` — финальные. Резерв принятого заказа
держится, пока вы не вызовете `complete` или `cancel`, — закрывайте заказы сразу.

### Просмотр: `GET /orders/{order_id}`, `GET /orders`

```bash
curl -s "$FH/orders/A-100045" -H "Authorization: Bearer $FAIRHAVEN_TOKEN"
curl -s "$FH/orders?status=accepted&limit=100" -H "Authorization: Bearer $FAIRHAVEN_TOKEN"
```

По **вашему** `order_id`, любым ключом; нет заказа — `404 order_not_found`.
Список — новые сверху, фильтр `status` необязателен. Показываются заказы
текущего режима: после перехода в `live` тестовые не видны.

### Завершение: `POST /orders/{order_id}/complete` (секрет заказов)

```bash
curl -s -X POST "$FH/orders/A-100045/complete" -H "Authorization: Bearer $FAIRHAVEN_SECRET"
```

Только из `accepted` и только когда заказ **доставлен и оплачен**: в этот
момент проводится продажа, отменить её через API нельзя. Повторный `complete`
отвечает `409 invalid_status` с `details.status: "completed"` — считайте это
успехом.

### Отмена: `POST /orders/{order_id}/cancel` (секрет заказов)

```bash
curl -s -X POST "$FH/orders/A-100045/cancel" \
  -H "Authorization: Bearer $FAIRHAVEN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Покупатель отказался"}'
```

Из `new` и `accepted`; `reason` необязателен (до 200 символов). Резерв
снимается. Из других статусов — `409 invalid_status`.

### Ошибки

| HTTP `error.code` | Что значит / что делать |
|---|---|
| `400 invalid_json` | Тело не JSON — проверьте тело и `Content-Type`. |
| `401 unauthorized` | Нет ключа, ключ неверен или на метод заказов отправлен токен чтения. Не повторяйте в цикле. |
| `403 partner_disabled` | Доступ выключен — свяжитесь с нами. |
| `404 product_not_found` / `order_not_found` / `not_found` | Нет товара (`details.product_id`) / заказа / адреса API. |
| `409 insufficient_stock` | Не хватает остатка: `details.items[] = {product_id, requested, available}`. Ничего не зарезервировано — предложите покупателю доступное количество. |
| `409 invalid_status` | Действие недоступно в текущем статусе (`details.status`). |
| `409 order_busy` | Заказ меняется другим действием — повторите через несколько секунд. |
| `409 webhook_not_configured` | Адрес webhook ещё не задан. |
| `413 payload_too_large` | Тело больше 256 КБ. |
| `422 validation_error` | Ошибка в данных, `message` назовёт поле. Повтор без изменений не поможет. |
| `429` | Лимит запросов — ждите `Retry-After` (или 1–5 с). |
| `500 internal_error` | Повторите позже; если повторяется — напишите нам. |
| `503 billz_unavailable`, `billz_writes_disabled`, `release_failed` | Учёт аптеки временно недоступен — повторите через минуту. |
| `503 sale_pending_review` | Продажу проверяет аптека. **Не повторяйте сразу**: после проверки заказ сам станет `completed`; если через 15 минут он всё ещё `accepted` — повторите `complete` (продажа не задвоится). |

---

## 5. Уведомления (webhook)

Сообщите нам адрес `https://…` (без логина и пароля, до 500 символов) — мы
пришлём секрет подписи `whsec_…`. На каждую смену статуса (`accepted`,
`rejected`, `cancelled`, `completed`, в том числе после ваших `cancel` /
`complete`) приходит `POST`:

```
X-FairHaven-Event: order.status_changed
X-FairHaven-Event-Id: 6733a1f0c2e4b5a6d7e8f901
X-FairHaven-Timestamp: 1762934400
X-FairHaven-Signature: v1=5d41402abc4b2a76b9719d911017c592…
```

```json
{
  "id": "6733a1f0c2e4b5a6d7e8f901",
  "type": "order.status_changed",
  "created_at": "2026-11-12T08:02:10.000Z",
  "data": { "order_id": "A-100045", "status": "accepted", "…": "заказ целиком, как в GET /orders/{order_id}" }
}
```

- Ответьте любым `2xx` в течение 10 секунд (тело не читается), тяжёлую
  обработку делайте после ответа. Иначе — повторы через 10 с, 1 мин, 5 мин,
  15 мин, 1 ч, 3 ч, 6 ч, 12 ч; перенаправления не выполняются.
- Одно событие может прийти дважды — пропускайте уже обработанные `id`.
  Порядок событий сохраняется. `created_at` — время события.
- События, возникшие до того, как адрес был задан, не досылаются — сверяйтесь
  через `GET /orders`.

**Подпись** считается от **сырого тела** (байты как пришли, не заново
сериализованный JSON):
`v1=` + hex(HMAC-SHA256(`whsec_…`, `"<X-FairHaven-Timestamp>.<сырое тело>"`)).
Сравнивайте за постоянное время и отклоняйте запросы старше ~5 минут.

```python
import hashlib, hmac, time

def verify(secret: str, timestamp: str, raw_body: bytes, signature: str, max_age: int = 300) -> bool:
    try:
        ts = int(timestamp)
    except (TypeError, ValueError):
        return False
    if abs(time.time() - ts) > max_age:
        return False
    expected = hmac.new(secret.encode(), timestamp.encode() + b"." + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(f"v1={expected}", signature or "")
```

Проверка адреса — `POST /webhook/test` (секрет заказов): мы сразу отправим
подписанное событие `ping` и вернём `{"delivered": true|false, "status_code",
"error"}`.

```bash
curl -s -X POST "$FH/webhook/test" -H "Authorization: Bearer $FAIRHAVEN_SECRET"
```

**Без webhook** опрашивайте `GET /orders/{order_id}` раз в 10–30 секунд, пока
статус `new` (решение придёт не позже `decision_deadline`), а заказы в
`accepted` — раз в несколько минут. Даже с webhook полезно раз в 10–15 минут
сверять открытые заказы через `GET /orders?status=new` и `?status=accepted`.

---

## 6. Тестирование и запуск

В режиме `test` проверьте (тестовым заказам удобно давать префикс `TEST-`):

1. `GET /me` обоими ключами; запрос без ключа и `POST /orders` токеном чтения — `401`.
2. Полная выгрузка `/products` и `/stock`; товары с `quantity: 0` помечены «нет в наличии».
3. Заказ → `accepted` (~10–15 с) → `complete` → `completed`; повторный `complete` — `409`, ваш код считает это успехом.
4. Заказ с `"test_outcome": "reject"` → `rejected`; покупатель видит отказ.
5. `cancel` в статусах `new` и `accepted` → `cancelled`.
6. Повтор `POST /orders` с тем же `order_id` → `200`, тот же заказ.
7. Ошибки: количество больше остатка (`409`), чужой `product_id` (`404`), пустой `items` (`422`).
8. `POST /webhook/test` → `delivered: true`; поддельная подпись и повтор события отклоняются; при `500` с вашей стороны событие приходит повторно.

Перед `live`: ключи только в хранилище секретов, секрет заказов — только у
сервиса заказов; витрина обновляет `/stock` не реже раза в 5 минут; `complete`
— только после доставки и оплаты; есть контакт ответственного. Затем вместе
проводим первый реальный заказ и переключаем режим. Тестовые и боевые заказы
ведутся раздельно: номер из теста в `live` создаст новый заказ.

---

FairHaven Health · Partner API v1. Вопросы — вашему контакту в FairHaven.
