import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { useContacts } from '../../components/shell/contacts.js';
import { Button } from '../../components/ui/index.js';
import { Clock, Phone, Telegram } from '../../components/Icons.jsx';
import './TelegramBlock.css';

// A sentence from the dictionary with one live value (a node) in place of its {token}.
function withNode(text, token, node) {
  const [before, after = ''] = text.split(`{${token}}`);
  return (
    <>
      {before}
      {node}
      {after}
    </>
  );
}

/** Ordering through the store's Telegram, with the real handle, hours and phone from public settings. */
export default function TelegramBlock() {
  const { t } = useI18n();
  const { tg, tgUrl, hours, phone, tel } = useContacts();
  if (!tgUrl) return null;

  return (
    <section className="hm-tg section" aria-labelledby="hm-tg-title">
      <div className="container">
        <div className="hm-tg-card stage">
          <span className="hm-tg-sun" aria-hidden="true" />
          <div className="hm-tg-copy">
            <h2 id="hm-tg-title" className="hm-tg-title t-h1">
              {t('home.tg.title')}
            </h2>
            <p className="hm-tg-text">{withNode(t('home.tg.text'), 'tg', <strong key="tg">{tg}</strong>)}</p>
            <ul className="hm-tg-facts">
              {hours && (
                <li>
                  <Clock size={18} />
                  {hours}
                </li>
              )}
              {phone && tel && (
                <li>
                  <Phone size={18} />
                  {withNode(
                    t('home.tg.call'),
                    'phone',
                    <a key="phone" href={tel} className="hm-tg-phone">
                      {phone}
                    </a>
                  )}
                </li>
              )}
            </ul>
          </div>
          <div className="hm-tg-actions">
            <Button
              variant="primary"
              size="lg"
              magnetic
              href={tgUrl}
              target="_blank"
              rel="noopener noreferrer"
              iconStart={<Telegram size={20} />}
            >
              {t('home.tg.write')}
            </Button>
            <Button variant="ghost" size="lg" to="/account">
              {t('home.tg.login')}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
