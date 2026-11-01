import React, { useId } from 'react';
import { m } from 'motion/react';
import { useI18n } from '../../i18n/index.jsx';
import { SPRING } from '../../motion/easings.js';
import './LanguageSwitch.css';

const LANGS = [
  { code: 'ru', label: 'RU', name: 'Русский' },
  { code: 'uz', label: 'UZ', name: 'O‘zbekcha' },
];

/**
 * RU / UZ pill; the fill glides to the chosen language. Each instance has its own fill, so the header,
 * the phone menu and the footer never fight over one shared element.
 */
export default function LanguageSwitch({ className = '', size = 'md' }) {
  const { lang, setLang, t } = useI18n();
  const fillId = `lang-${useId()}`;
  return (
    <div role="group" aria-label={t('shell.language')} className={`sh-lang sh-lang--${size} ${className}`}>
      {LANGS.map((l) => {
        const on = l.code === lang;
        return (
          <button
            key={l.code}
            type="button"
            lang={l.code}
            aria-pressed={on}
            title={l.name}
            className={`sh-lang-btn${on ? ' is-on' : ''}`}
            onClick={() => setLang(l.code)}
          >
            {on && <m.span className="sh-lang-fill" layoutId={fillId} transition={SPRING.snappy} aria-hidden="true" />}
            <span className="sh-lang-label">{l.label}</span>
          </button>
        );
      })}
    </div>
  );
}
