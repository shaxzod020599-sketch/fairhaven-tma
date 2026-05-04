/**
 * Telegram WebApp utility wrapper
 * Provides safe access to TMA APIs with fallbacks for browser dev
 */

const tg = window.Telegram?.WebApp;

export function getTelegram() {
  return tg || null;
}

export function initTelegram() {
  if (!tg) {
    console.warn('[TMA] Not running inside Telegram. Using dev fallbacks.');
    return null;
  }
  tg.ready();
  tg.expand();
  tg.disableVerticalSwipes();
  tg.setHeaderColor('#F6F1E6');
  tg.setBackgroundColor('#F6F1E6');
  return tg;
}

export function getTelegramUser() {
  if (!tg) {
    return {
      id: 0,
      first_name: 'Dev',
      last_name: 'User',
      username: 'devuser',
      language_code: 'ru',
      photo_url: '',
    };
  }
  return tg.initDataUnsafe?.user || {};
}

export function getThemeParams() {
  if (!tg) {
    return {
      bg_color: '#FFFFFF',
      text_color: '#1A1A2E',
      button_color: '#DC143C',
      button_text_color: '#FFFFFF',
    };
  }
  return tg.themeParams || {};
}

export function showMainButton(text, callback) {
  if (!tg) {
    console.log('[TMA Dev] MainButton would show:', text);
    return;
  }
  tg.MainButton.setText(text);
  tg.MainButton.color = '#0E2B1F';
  tg.MainButton.textColor = '#F6F1E6';
  tg.MainButton.show();
  tg.MainButton.onClick(callback);
}

export function hideMainButton() {
  if (!tg) return;
  tg.MainButton.hide();
  tg.MainButton.offClick(() => {});
}

export function setMainButtonLoading(loading) {
  if (!tg) return;
  if (loading) {
    tg.MainButton.showProgress();
    tg.MainButton.disable();
  } else {
    tg.MainButton.hideProgress();
    tg.MainButton.enable();
  }
}

export function sendData(data) {
  if (!tg) {
    console.log('[TMA Dev] sendData:', data);
    alert('Dev mode: Data would be sent to bot:\n' + JSON.stringify(data, null, 2));
    return;
  }
  tg.sendData(JSON.stringify(data));
}

// Stack of registered back-button handlers. The top of the stack is the
// active handler; pushing a new one (e.g. when a modal opens) overrides
// the previous handler so back-press closes the modal instead of the
// whole admin app. Popping restores the prior handler.
const backStack = [];
let activeHandler = null;

function applyTopHandler() {
  if (!tg) return;
  if (activeHandler) {
    tg.BackButton.offClick(activeHandler);
    activeHandler = null;
  }
  const top = backStack[backStack.length - 1];
  if (top) {
    tg.BackButton.show();
    tg.BackButton.onClick(top);
    activeHandler = top;
  } else {
    tg.BackButton.hide();
  }
}

export function showBackButton(callback) {
  // Legacy: replaces existing single handler. New code should prefer
  // pushBackButton/popBackButton so stacking works correctly.
  if (!tg) return;
  if (activeHandler) tg.BackButton.offClick(activeHandler);
  tg.BackButton.show();
  tg.BackButton.onClick(callback);
  activeHandler = callback;
}

export function hideBackButton() {
  if (!tg) return;
  if (activeHandler) {
    tg.BackButton.offClick(activeHandler);
    activeHandler = null;
  }
  tg.BackButton.hide();
}

export function pushBackButton(callback) {
  backStack.push(callback);
  applyTopHandler();
}

export function popBackButton(callback) {
  // Remove the most recent occurrence of the callback (or the top if no
  // callback is provided). This guards against unmount-order races.
  if (callback) {
    const idx = backStack.lastIndexOf(callback);
    if (idx !== -1) backStack.splice(idx, 1);
  } else {
    backStack.pop();
  }
  applyTopHandler();
}

export function hapticFeedback(type = 'light') {
  if (!tg?.HapticFeedback) return;
  tg.HapticFeedback.impactOccurred(type);
}

export function hapticNotification(type = 'success') {
  if (!tg?.HapticFeedback) return;
  tg.HapticFeedback.notificationOccurred(type);
}

export function showAlert(message) {
  if (!tg) {
    alert(message);
    return;
  }
  tg.showAlert(message);
}

export function showConfirm(message, callback) {
  if (!tg) {
    const result = confirm(message);
    callback(result);
    return;
  }
  tg.showConfirm(message, callback);
}

export function closeMiniApp() {
  if (!tg) {
    console.log('[TMA Dev] Would close Mini App');
    return;
  }
  tg.close();
}
