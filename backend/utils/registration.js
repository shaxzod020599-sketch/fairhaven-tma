function cleanProfileText(value, maxLength = 40) {
  return (value || '').toString().trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function escapeRegistrationName(value) {
  return (value || '').toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function isRegistered(user) {
  return user.registrationStep === 'done' && user.consentAccepted === true;
}

function syncRegistrationUser(user, telegramUser = {}) {
  if (telegramUser.username) user.username = telegramUser.username;
  if (telegramUser.language_code) user.languageCode = telegramUser.language_code;

  if (!user.firstName && telegramUser.first_name) {
    user.firstName = cleanProfileText(telegramUser.first_name);
  }
  if (!user.lastName && telegramUser.last_name) {
    user.lastName = cleanProfileText(telegramUser.last_name);
  }

  if (!isRegistered(user)) {
    user.registrationStep = user.phone ? 'awaiting_consent' : 'awaiting_phone';
  }

  return user;
}

function applyVerifiedContact(user, senderId, contact) {
  if (user.registrationStep !== 'awaiting_phone') return false;
  if (!contact?.phone_number || String(contact.user_id) !== String(senderId)) return false;

  const phone = contact.phone_number.toString().trim();
  if (!phone) return false;

  user.phone = phone.startsWith('+') ? phone : `+${phone}`;
  user.registrationStep = 'awaiting_consent';
  return true;
}

function acceptConsent(user) {
  if (user.registrationStep !== 'awaiting_consent') return false;

  user.consentAccepted = true;
  user.consentAcceptedAt = new Date();
  user.registrationStep = 'done';
  return true;
}

module.exports = {
  acceptConsent,
  applyVerifiedContact,
  escapeRegistrationName,
  syncRegistrationUser,
};
