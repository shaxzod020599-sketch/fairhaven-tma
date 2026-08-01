# Fairhaven Health — API для Uzum Tezkor

Документ для интеграционной команды Uzum Tezkor.
Версия 1 · 01.08.2026

Мы — сторона поставщика (Retail API, семейство Yandex Eats). Вы опрашиваете наши
эндпоинты и присылаете нам заказы.

---

## Базовый адрес

```
https://api.fairhaven.uz/uzum
https://api.fairhaven.uz/uzum/v1
```

Оба префикса работают и отвечают одинаково — это один и тот же маршрутизатор.
Выберите любой и придерживайтесь его.

Только HTTPS, адрес выдаётся по домену, не по IP.

---

## Шаг 1. Получение токена

OAuth2, `client_credentials`. Мы выдаём `client_id` и `client_secret`.

```bash
curl -X POST https://api.fairhaven.uz/uzum/security/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=<ID>&client_secret=<SECRET>"
```

HTTP Basic тоже принимается:

```bash
curl -X POST https://api.fairhaven.uz/uzum/security/oauth/token \
  -u "<ID>:<SECRET>" \
  -d "grant_type=client_credentials"
```

```json
{
  "access_token": "eyJjIjoi….K8vQ…",
  "token_type": "bearer",
  "expires_in": 3600,
  "scope": "nomenclature orders"
}
```

Дальше — `Authorization: Bearer <access_token>` на каждом запросе.

**Время жизни — 1 час.** Refresh-токена нет намеренно: `client_credentials`
переполучается теми же учётными данными, и второй долгоживущий секрет ничего
дополнительно не защищал бы.

**Отзыв действует немедленно.** Токен проверяется по учётной записи при каждом
запросе, а не только при выдаче. Если мы отзовём клиента, выданные токены
перестанут работать на следующем же запросе, а не по истечении часа.

Ошибки этого шага — в формате OAuth2 (`{"error":"invalid_client"}`), остальные
эндпоинты используют формат ниже.

---

## Формат ошибок

Массив, даже если ошибка одна:

```json
[{ "code": 404, "description": "Order UZ-1001 not found" }]
```

`description` содержит настоящую причину, а не общую фразу.

---

## Шаг 2. Каталог

```bash
curl "https://api.fairhaven.uz/uzum/v1/nomenclature/<STORE_ID>/composition" \
  -H "Authorization: Bearer <TOKEN>"
```

`Content-Type: application/vnd.eda.picker.nomenclature.v1+json`

```json
{
  "categories": [
    { "id": "erkaklar", "parentId": null, "name": "Erkaklar", "sortOrder": 1 }
  ],
  "items": [
    {
      "id": "0f9c2e5a-…",
      "categoryId": "erkaklar",
      "name": "FertilAid for Men",
      "description": "…",
      "price": 300000,
      "oldPrice": 350000,
      "vendorCode": "FH-001",
      "barcodes": ["4808000000000"],
      "measure": { "value": 1, "unit": "PCS" },
      "isCatchWeight": false,
      "images": [
        { "url": "https://fairhaven.uz/uploads/1754…-a1b2.jpg", "hash": "9c1185a5c5e9fc54612808977ee8f548b2258d31" }
      ],
      "inStock": 12,
      "serviceCodesUz": { "mxikCodeUz": "02106999028000000" }
    }
  ]
}
```

Замечания:

- `id` — стабильный идентификатор товара, он же используется в заказе.
- `oldPrice` присылается только когда он действительно выше `price`.
- `hash` — SHA-1 самих байтов картинки. Если байты не менялись, хеш тот же:
  можно не перекачивать.
- Товар без пригодной картинки в выдачу **не попадает**. Пустой массив картинок
  показал бы покупателю пустую плитку, поэтому мы предпочитаем не показывать
  товар вовсе.
- `serviceCodesUz.mxikCodeUz` ведётся на нашей стороне: в учётной системе кода
  ИКПУ нет ни у одного товара. У товара может быть свой код, остальные получают
  значение по умолчанию.

Рекомендуемая частота: **раз в час**.

---

## Шаг 3. Остатки

```bash
curl "https://api.fairhaven.uz/uzum/v1/nomenclature/<STORE_ID>/availability" \
  -H "Authorization: Bearer <TOKEN>"
```

`Content-Type: application/vnd.eda.picker.availability.v1+json`

```json
{
  "items": [
    { "id": "0f9c2e5a-…", "stock": 12, "available": true },
    { "id": "7b3d1f80-…", "stock": 0,  "available": false }
  ]
}
```

`stock` — количество, которое **можно продать вам**: складской остаток минус уже
забронированное другими каналами, минус страховой запас магазина.

Рекомендуемая частота: **раз в 5 минут**.

---

## Шаг 4. Заказ

```bash
curl -X POST https://api.fairhaven.uz/uzum/v1/order \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "eatsId": "UZ-1001",
    "items": [{ "id": "0f9c2e5a-…", "quantity": 2 }],
    "customer": { "name": "Ali", "phone": "+998900000000" },
    "deliveryAddress": "Ташкент, …"
  }'
```

```json
{ "orderId": "3f7e1c92-…", "result": "OK" }
```

**Повторная отправка того же `eatsId` вернёт тот же `orderId` и тот же 200.**
`eatsId` — ключ идемпотентности; повторов можно не бояться.

**Мы отвечаем до обращения к учётной системе.** Бронирование остатка происходит
сразу после ответа. Так медленная учётная система стоит нам брони, а не
пятнадцатиминутного дедлайна.

Цена берётся из нашего каталога. Поле `price` в позиции, если оно придёт, будет
прочитано и проигнорировано — при расхождении корректнее перечитать каталог.

Ошибки:

| Код | Когда |
|---|---|
| 400 | нет `eatsId`, пустой список позиций, некорректное количество |
| 404 | товара нет в продаже у нас |
| 401 | токен отсутствует, истёк или отозван |

---

## Шаг 5. Статус

```bash
curl "https://api.fairhaven.uz/uzum/v1/order/UZ-1001/status" \
  -H "Authorization: Bearer <TOKEN>"
```

```json
{ "status": "ACCEPTED_BY_RESTAURANT", "comment": "", "updatedAt": "2026-08-01T09:14:02.881Z" }
```

Можно запрашивать и по `orderId`, и по `eatsId`.

| Наш статус | Что означает |
|---|---|
| `NEW` | заказ принят и записан, остаток ещё не забронирован |
| `ACCEPTED_BY_RESTAURANT` | остаток забронирован — это и есть подтверждение |
| `DELIVERED` | продажа проведена |
| `CANCELLED` | отменён, остаток возвращён |

Мы сообщаем самый дальний статус, который можем подтвердить, и никогда дальше:
курьер не должен приехать за товаром, которого нет.

Рекомендуемая частота: **раз в минуту** по открытым заказам.

---

## Шаг 6. Изменение статуса и отмена

```bash
curl -X PUT https://api.fairhaven.uz/uzum/v1/order/UZ-1001 \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{ "status": "DELIVERED" }'
```

Принимаются: `NEW`, `ACCEPTED_BY_RESTAURANT`, `COOKING`, `READY`,
`TAKEN_BY_COURIER`, `POSTPONED`, `DELIVERED`, `CANCELLED`.

На остаток влияют только два: `DELIVERED` проводит продажу, `CANCELLED`
возвращает бронь. Остальные принимаются как подтверждения курьерского процесса и
ничего у нас не меняют.

Неизвестный статус вернёт 400, а не 200. Молча принять его значило бы потерять
настоящее изменение состояния.

Отмена:

```bash
curl -X DELETE https://api.fairhaven.uz/uzum/v1/order/UZ-1001 \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{ "comment": "покупатель отказался" }'
```

Отмена уже проведённого заказа вернёт **409**: это возврат, другая бухгалтерия, и
мы не проводим его молча.

---

## Ограничения частоты

| Ограничение | Значение |
|---|---|
| На ключ | 240 запросов в минуту |
| Отклонённые запросы, на IP | 300 за 5 минут |

Оба с большим запасом покрывают рекомендованные выше частоты. При превышении —
429; повторите после паузы.

---

## Контакты

Технические вопросы по интеграции — через менеджера Fairhaven Health.
