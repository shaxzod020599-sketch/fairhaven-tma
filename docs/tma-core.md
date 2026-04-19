# Telegram Mini App (TMA) - Core API Reference

## Initialization

### Script Injection
```html
<script src="https://telegram.org/js/telegram-web-app.js?62"></script>
```
Must be placed in `<head>` before any other scripts.

### WebApp Object
After script loads, `window.Telegram.WebApp` is available with:

```js
const tg = window.Telegram.WebApp;
tg.ready(); // Signal that the Mini App is ready to be displayed
```

## Key Properties

| Property | Type | Description |
|----------|------|-------------|
| `initData` | String | Raw init data (query string) for backend validation |
| `initDataUnsafe` | Object | Parsed init data (user, chat, query_id, etc.) |
| `version` | String | Bot API version |
| `platform` | String | Platform identifier |
| `colorScheme` | String | `"light"` or `"dark"` |
| `themeParams` | Object | Current theme colors (see ThemeParams) |
| `isExpanded` | Boolean | Whether the Mini App is expanded |
| `viewportHeight` | Float | Current viewport height |
| `viewportStableHeight` | Float | Stable viewport height |
| `headerColor` | String | Current header color |
| `backgroundColor` | String | Current background color |
| `bottomBarColor` | String | Current bottom bar color |
| `isFullscreen` | Boolean | Whether in fullscreen mode |
| `isActive` | Boolean | Whether app is active |
| `safeAreaInset` | Object | System safe area insets (top, bottom, left, right) |
| `contentSafeAreaInset` | Object | Content safe area insets |

## ThemeParams (CSS Variables)

| CSS Variable | Property |
|---|---|
| `--tg-theme-bg-color` | `bg_color` |
| `--tg-theme-text-color` | `text_color` |
| `--tg-theme-hint-color` | `hint_color` |
| `--tg-theme-link-color` | `link_color` |
| `--tg-theme-button-color` | `button_color` |
| `--tg-theme-button-text-color` | `button_text_color` |
| `--tg-theme-secondary-bg-color` | `secondary_bg_color` |
| `--tg-theme-header-bg-color` | `header_bg_color` |
| `--tg-theme-bottom-bar-bg-color` | `bottom_bar_bg_color` |
| `--tg-theme-accent-text-color` | `accent_text_color` |
| `--tg-theme-section-bg-color` | `section_bg_color` |
| `--tg-theme-section-header-text-color` | `section_header_text_color` |
| `--tg-theme-subtitle-text-color` | `subtitle_text_color` |
| `--tg-theme-destructive-text-color` | `destructive_text_color` |

## MainButton (BottomButton)

The primary action button at the bottom of the Mini App.

```js
const btn = tg.MainButton;

btn.text = "Оформить заказ";       // Set button text
btn.color = "#DC143C";              // Set button background color
btn.textColor = "#FFFFFF";          // Set button text color
btn.isVisible = true;               // Show the button
btn.isActive = true;                // Enable the button
btn.isProgressVisible = false;      // Hide/show loading spinner

btn.setText("New Text");            // Set text (chainable)
btn.show();                         // Show button (chainable)
btn.hide();                         // Hide button (chainable)
btn.enable();                       // Enable button (chainable)
btn.disable();                      // Disable button (chainable)
btn.showProgress(leaveActive);      // Show spinner
btn.hideProgress();                 // Hide spinner
btn.onClick(callback);              // Add click handler
btn.offClick(callback);             // Remove click handler
```

### Event Listener
```js
tg.onEvent('mainButtonClicked', () => { /* handle click */ });
```

## BackButton

```js
tg.BackButton.show();
tg.BackButton.hide();
tg.BackButton.onClick(callback);
tg.BackButton.offClick(callback);
```

### Event
```js
tg.onEvent('backButtonClicked', callback);
```

## Data Passing

### sendData(data)
Sends string data to the bot. Only available for Mini Apps launched via **keyboard button**.
```js
tg.sendData(JSON.stringify({
  items: cartItems,
  total: totalAmount,
  location: { lat, lng, address }
}));
```
- Data arrives as a `web_app_data` service message in the bot.
- Max data size: 4096 bytes.
- After calling, the Mini App closes.

## Methods

| Method | Description |
|--------|-------------|
| `ready()` | Inform Telegram client the Mini App is ready |
| `expand()` | Expand to maximum height |
| `close()` | Close the Mini App |
| `setHeaderColor(color)` | Set header color (`#RRGGBB` or theme key) |
| `setBackgroundColor(color)` | Set background color |
| `setBottomBarColor(color)` | Set bottom bar color |
| `enableClosingConfirmation()` | Ask confirmation before closing |
| `disableClosingConfirmation()` | Disable closing confirmation |
| `openLink(url, options)` | Open external link |
| `openTelegramLink(url)` | Open Telegram link |
| `openInvoice(url, callback)` | Open payment invoice |
| `showPopup(params, callback)` | Show native popup |
| `showAlert(message, callback)` | Show alert popup |
| `showConfirm(message, callback)` | Show confirm popup |
| `requestContact(callback)` | Request user contact |
| `requestWriteAccess(callback)` | Request write access |
| `switchInlineQuery(query, chatTypes)` | Switch to inline mode |
| `isVersionAtLeast(version)` | Check API version |
| `requestFullscreen()` | Enter fullscreen |
| `exitFullscreen()` | Exit fullscreen |
| `disableVerticalSwipes()` | Prevent swipe-to-close |
| `enableVerticalSwipes()` | Re-enable swipe-to-close |

## WebAppInitData

Available via `tg.initDataUnsafe`:

| Field | Type | Description |
|-------|------|-------------|
| `query_id` | String | Unique session ID for answerWebAppQuery |
| `user` | WebAppUser | Current user data |
| `receiver` | WebAppUser | Bot info (for bot chats) |
| `chat` | WebAppChat | Chat info (for group/channel) |
| `chat_type` | String | Type of chat |
| `chat_instance` | String | Chat instance ID |
| `start_param` | String | Startup parameter from link |
| `can_send_after` | Integer | Seconds before sendData allowed |
| `auth_date` | Integer | Unix timestamp of auth |
| `hash` | String | Init data validation hash |

## WebAppUser

| Field | Type |
|-------|------|
| `id` | Integer |
| `is_bot` | Boolean |
| `first_name` | String |
| `last_name` | String |
| `username` | String |
| `language_code` | String |
| `is_premium` | Boolean |
| `photo_url` | String |

## Data Validation (Backend)

```js
const crypto = require('crypto');

function validateTelegramData(initData, botToken) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const hmac = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  return hmac === hash;
}
```

## Events

| Event | Description |
|-------|-------------|
| `themeChanged` | Theme parameters changed |
| `viewportChanged` | Viewport height changed |
| `mainButtonClicked` | Main button pressed |
| `secondaryButtonClicked` | Secondary button pressed |
| `backButtonClicked` | Back button pressed |
| `settingsButtonClicked` | Settings button pressed |
| `invoiceClosed` | Payment invoice closed |
| `popupClosed` | Popup closed |
| `qrTextReceived` | QR code scanned |
| `clipboardTextReceived` | Clipboard text received |
| `writeAccessRequested` | Write access result |
| `contactRequested` | Contact sharing result |
| `fullscreenChanged` | Fullscreen state changed |
| `homeScreenAdded` | Added to home screen |

## Safe Areas

```css
/* System safe area (notches, navigation bars) */
padding-top: var(--tg-safe-area-inset-top);
padding-bottom: var(--tg-safe-area-inset-bottom);
padding-left: var(--tg-safe-area-inset-left);
padding-right: var(--tg-safe-area-inset-right);

/* Content safe area (Telegram UI elements) */
padding-top: var(--tg-content-safe-area-inset-top);
```

## Best Practices

1. Always call `tg.ready()` after initialization
2. Use `tg.expand()` to maximize viewport
3. Respect theme colors for seamless integration
4. Validate `initData` on backend before trusting user data
5. Use `disableVerticalSwipes()` for scrollable content
6. Respect safe area insets for fullscreen mode
7. Keep `sendData` payload under 4096 bytes
8. Use `MainButton` for primary actions (not custom HTML buttons)
