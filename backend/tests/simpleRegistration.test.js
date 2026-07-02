const assert = require('node:assert/strict');
const test = require('node:test');

const {
  acceptConsent,
  applyVerifiedContact,
  escapeRegistrationName,
  syncRegistrationUser,
} = require('../utils/registration');

function makeUser(overrides = {}) {
  return {
    username: '',
    languageCode: 'ru',
    firstName: '',
    lastName: '',
    phone: '',
    consentAccepted: false,
    consentAcceptedAt: null,
    registrationStep: 'awaiting_name',
    ...overrides,
  };
}

test('incomplete registration starts at phone and copies missing Telegram profile data', () => {
  const user = makeUser();

  syncRegistrationUser(user, {
    username: 'customer',
    language_code: 'uz',
    first_name: 'Ali',
    last_name: 'Karimov',
  });

  assert.equal(user.registrationStep, 'awaiting_phone');
  assert.equal(user.username, 'customer');
  assert.equal(user.languageCode, 'uz');
  assert.equal(user.firstName, 'Ali');
  assert.equal(user.lastName, 'Karimov');
});

test('incomplete registration with an existing phone resumes at consent', () => {
  const user = makeUser({
    phone: '+998901234567',
    registrationStep: 'awaiting_year',
  });

  syncRegistrationUser(user, {});

  assert.equal(user.registrationStep, 'awaiting_consent');
});

test('registered user remains registered and saved names are not overwritten', () => {
  const user = makeUser({
    firstName: 'Saved',
    lastName: 'Name',
    consentAccepted: true,
    registrationStep: 'done',
  });

  syncRegistrationUser(user, {
    first_name: 'Telegram',
    last_name: 'Profile',
  });

  assert.equal(user.registrationStep, 'done');
  assert.equal(user.firstName, 'Saved');
  assert.equal(user.lastName, 'Name');
});

test('only the sender own Telegram contact advances registration', () => {
  const user = makeUser({ registrationStep: 'awaiting_phone' });

  assert.equal(applyVerifiedContact(user, 111, {
    user_id: 222,
    phone_number: '998901234567',
  }), false);
  assert.equal(user.phone, '');
  assert.equal(user.registrationStep, 'awaiting_phone');

  assert.equal(applyVerifiedContact(user, 111, {
    user_id: 111,
    phone_number: '998901234567',
  }), true);
  assert.equal(user.phone, '+998901234567');
  assert.equal(user.registrationStep, 'awaiting_consent');
});

test('consent advances only a consent-ready user to done', () => {
  const user = makeUser({ registrationStep: 'awaiting_phone' });

  assert.equal(acceptConsent(user), false);
  assert.equal(user.consentAccepted, false);

  user.registrationStep = 'awaiting_consent';
  assert.equal(acceptConsent(user), true);
  assert.equal(user.registrationStep, 'done');
  assert.equal(user.consentAccepted, true);
  assert.ok(user.consentAcceptedAt instanceof Date);
});

test('registration name is escaped before insertion into Telegram HTML', () => {
  assert.equal(
    escapeRegistrationName('Ali & <Admin>'),
    'Ali &amp; &lt;Admin&gt;'
  );
});
