import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { fetchSiteContent, saveSiteContent } from '../api.js';
import { DEFAULT_CONTENT, mergeContent } from '../content/defaults.js';
import { HOME } from '../content/home.js';
import { useSeo } from '../seo/useSeo.js';
import { ArrowUpRight, Bottle, Check, ChevronRight, Info, Leaf, ShieldCheck, Sun, User } from '../components/Icons.jsx';
import { Field, LangTabs } from './admin/fields.jsx';
import { HeroEditor, TrustEditor } from './admin/HomeEditors.jsx';
import ShowcaseEditor, { SHOWCASE_MAX } from './admin/ShowcaseEditor.jsx';
import ReviewsEditor, { cleanReviews } from './admin/ReviewsEditor.jsx';
import BlogEditor from './admin/BlogEditor.jsx';
import '../styles/admin.css';

/**
 * Site admin: a list of sections on the left, one focused editor at a time, one save for everything.
 * Only Telegram admins (ADMIN_TELEGRAM_IDS) signed in through the bot handshake get in.
 * The saved document is the whole site content ({announce, home, blog}); the site deep-merges it over
 * the defaults in content/, so the home shape here must match content/home.js exactly.
 */

const SECTIONS = [
  { id: 'announce', Icon: Info, ru: 'Бегущая строка' },
  { id: 'hero', Icon: Sun, ru: 'Главный экран' },
  { id: 'trust', Icon: ShieldCheck, ru: 'Факты доверия' },
  { id: 'showcase', Icon: Bottle, ru: 'Витрина' },
  { id: 'reviews', Icon: User, ru: 'Отзывы' },
  { id: 'blog', Icon: Leaf, ru: 'Блог' },
];

const TRUST_SLOTS = 4;

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

/**
 * The editable document in the current shape. Only the keys the site reads are kept, so fields of the
 * old home (testimonials, 3D bottles, the old hero) disappear with the next save.
 */
function toEditable(saved) {
  const merged = clone(mergeContent(DEFAULT_CONTENT, saved || null));
  const home = merged.home || {};
  const heroLang = (l) => ({ ...HOME.hero[l], ...(home.hero?.[l] || {}) });
  const trust = Array.isArray(home.trust) ? home.trust : [];
  return {
    announce: merged.announce,
    blog: Array.isArray(merged.blog) ? merged.blog : [],
    home: {
      hero: { ru: heroLang('ru'), uz: heroLang('uz') },
      trust: Array.from({ length: TRUST_SLOTS }, (_, i) => ({ ru: trust[i]?.ru || '', uz: trust[i]?.uz || '' })),
      showcase: {
        productIds: (Array.isArray(home.showcase?.productIds) ? home.showcase.productIds : []).map(String),
      },
      reviews: Array.isArray(home.reviews) ? home.reviews : [],
    },
  };
}

/** What goes to the server: trimmed, deduplicated, no empty review versions. */
function toSaved(data) {
  const out = clone(data);
  out.home.showcase.productIds = [...new Set(out.home.showcase.productIds.map(String))].slice(0, SHOWCASE_MAX);
  out.home.reviews = cleanReviews(out.home.reviews);
  return out;
}

export default function AdminPanel() {
  useSeo();
  const { t } = useI18n();
  const { user, isLoading } = useAuth();
  const [data, setData] = useState(null);
  const [section, setSection] = useState('announce');
  const [lang, setLang] = useState('ru');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchSiteContent()
      .then((res) => { if (!cancelled) setData(toEditable(res?.data)); })
      .catch(() => { if (!cancelled) setData(toEditable(null)); });
    return () => { cancelled = true; };
  }, []);

  // Leaving with unsaved edits asks first; the editor holds a whole document, so a lost tab loses a lot.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    if (!savedFlash) return undefined;
    const id = setTimeout(() => setSavedFlash(false), 2200);
    return () => clearTimeout(id);
  }, [savedFlash]);

  const isAdmin = user?.role === 'admin';

  const save = async () => {
    setSaving(true);
    try {
      const payload = toSaved(data);
      await saveSiteContent(payload);
      setData(toEditable(payload));
      setDirty(false);
      setSavedFlash(true);
    } catch (err) {
      alert('Ошибка сохранения: ' + (err.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const patch = (updater) => {
    setData((d) => {
      const next = clone(d);
      updater(next);
      return next;
    });
    setDirty(true);
    setSavedFlash(false);
  };

  if (isLoading) return <div className="container ap-page"><p>{t('loading')}</p></div>;

  if (!user) {
    return (
      <div className="container ap-page ap-gate">
        <h1 className="page-title">Админ-панель</h1>
        <p>Войдите через Telegram. Доступ только для администраторов.</p>
        <Link to="/account" className="btn btn-primary">{t('signIn')}</Link>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container ap-page ap-gate">
        <h1 className="page-title">Доступ ограничен</h1>
        <p>Ваш Telegram-аккаунт не входит в список администраторов.</p>
        <Link to="/" className="btn btn-outline">{t('goHome')}</Link>
      </div>
    );
  }

  const current = SECTIONS.find((s) => s.id === section);
  const editorProps = { lang, setLang, patch };
  let body = null;
  if (data) {
    if (section === 'announce') {
      body = (
        <>
          <LangTabs lang={lang} setLang={setLang} />
          {data.announce[lang].map((line, i) => (
            <Field
              key={`${lang}-${i}`}
              label={`Строка ${i + 1}`}
              value={line}
              onChange={(v) => patch((d) => { d.announce[lang][i] = v; })}
            />
          ))}
        </>
      );
    } else if (section === 'hero') {
      body = <HeroEditor hero={data.home.hero} {...editorProps} />;
    } else if (section === 'trust') {
      body = <TrustEditor trust={data.home.trust} patch={patch} />;
    } else if (section === 'showcase') {
      body = <ShowcaseEditor ids={data.home.showcase.productIds} patch={patch} />;
    } else if (section === 'reviews') {
      body = <ReviewsEditor reviews={data.home.reviews} {...editorProps} />;
    } else if (section === 'blog') {
      body = <BlogEditor blog={data.blog} {...editorProps} />;
    }
  }

  return (
    <div className="container ap-page">
      <div className="ap-topbar">
        <h1 className="page-title">Админ-панель</h1>
        <div className="ap-topbar-actions">
          <span className="ap-state" role="status">
            {dirty ? 'Есть несохранённые изменения' : savedFlash ? 'Сохранено, уже на сайте' : ''}
          </span>
          <a className="btn btn-outline" href="/" target="_blank" rel="noopener noreferrer">
            Открыть сайт <ArrowUpRight size={16} />
          </a>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving || !data}>
            {saving ? 'Сохраняю…' : savedFlash && !dirty ? <><Check size={16} /> Сохранено</> : 'Сохранить изменения'}
          </button>
        </div>
      </div>

      <div className="ap-layout">
        <nav className="ap-nav" aria-label="Разделы">
          {SECTIONS.map(({ id, Icon, ru }) => (
            <button
              key={id}
              type="button"
              aria-current={section === id ? 'true' : undefined}
              className={`ap-nav-item ${section === id ? 'active' : ''}`}
              onClick={() => setSection(id)}
            >
              <Icon size={20} className="ap-nav-icon" />
              {ru}
              <ChevronRight size={16} className="ap-nav-chev" />
            </button>
          ))}
          <div className="ap-nav-note">
            Изменения появятся на сайте сразу после «Сохранить».
          </div>
        </nav>

        <section className="ap-editor" aria-labelledby="ap-editor-title">
          <h2 id="ap-editor-title" className="ap-editor-title">{current.ru}</h2>
          {body || <p>{t('loading')}</p>}
        </section>
      </div>
    </div>
  );
}
