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
  tg.setHeaderColor('#DC143C');
  tg.setBackgroundColor('#FFFFFF');
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
  tg.MainButton.color = '#DC143C';
  tg.MainButton.textColor = '#FFFFFF';
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

export function showBackButton(callback) {
  if (!tg) return;
  tg.BackButton.show();
  tg.BackButton.onClick(callback);
}

export function hideBackButton() {
  if (!tg) return;
  tg.BackButton.hide();
  tg.BackButton.offClick(() => {});
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
