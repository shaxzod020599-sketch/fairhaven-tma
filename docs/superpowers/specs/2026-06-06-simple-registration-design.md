# Simple Registration Design

## Goal

Reduce customer registration to two actions:

1. Send own Telegram contact using contact-share button.
2. Accept public offer.

After acceptance, customer enters store. Telegram first and last name populate
profile automatically and may be edited later inside Profile.

## Compatibility

- Existing registered customers remain registered and receive no messages.
- Existing incomplete registrations move to `awaiting_phone` on next `/start`.
- Existing saved names, phone numbers, consent, orders, addresses, roles, and
  notification settings remain unchanged.
- No database migration deletes or rewrites users.

## Bot Flow

On `/start`, bot creates or refreshes customer from trusted Telegram sender
data. For a new customer, first and last name come from `ctx.from`. For any
incomplete customer, bot sets registration step to `awaiting_phone` unless
customer already has a verified phone, in which case it sets
`awaiting_consent`.

`awaiting_phone` accepts only Telegram contact whose `user_id` matches sender.
Manual text never becomes phone. After contact, bot moves to
`awaiting_consent`. After consent callback, bot sets `done` and opens shop.

Legacy name, surname, year, and gender handlers remain harmless for old update
events but no normal flow routes customers into those steps.

## Profile Name Editing

Profile shows current first and last name plus an Edit action. Edit mode uses
two bounded text inputs and Save/Cancel actions. Save calls existing signed
self-update endpoint. Backend allowlists `firstName` and `lastName`, validates
letters, spaces, apostrophes, and hyphens, and limits each value to 40
characters. Role, phone, Telegram ID, consent, and registration step remain
immutable through this API.

Successful save updates local Profile state through parent callback so visible
name changes without reload. No unrelated visual sections change.

## Testing

- Bot tests prove new and incomplete users start at phone, Telegram names are
  copied, verified contact advances to consent, and consent advances to done.
- API tests prove signed self-update accepts valid names and still ignores role,
  phone, consent, registration step, and Telegram ID.
- Existing notification/security tests remain green.
- Frontend production build must pass.
- Production verification compares DB counts and recent-order fingerprint,
  checks health and auth, and monitors logs. Verification sends no Telegram
  messages and creates no orders.
