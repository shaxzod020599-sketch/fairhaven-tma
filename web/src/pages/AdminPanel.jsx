import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { fetchSiteContent, saveSiteContent, adminUploadImage } from '../api.js';
import { DEFAULT_CONTENT, mergeContent } from '../content/defaults.js';

/**
 * Site admin — Telegram-simple: a list of sections on the left, one focused
 * editor at a time, a single save per section. Only Telegram admins
 * (ADMIN_TELEGRAM_IDS) signed in through the bot handshake get in.
 */

const SECTIONS = [
  { id: 'announce', icon: '📣', ru: 'Бегущая строка' },
  { id: 'hero', icon: '🏠', ru: 'Главный экран' },
  { id: 'testimonials', icon: '💬', ru: 'Отзывы (главная)' },
  { id: 'products3d', icon: '🧴', ru: '3D товары' },
  { id: 'blog', icon: '📝', ru: 'Блог' },
];

const KINDS = [
  ['quote', 'Цитата'],
  ['research', 'Исследование'],
  ['award', 'Награда'],
  ['family', 'Семья'],
];
const ACCENTS = ['pink', 'mint', 'blue', 'lavender'];

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function useImagePicker() {
  const inputRef = useRef(null);
  const cbRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const pick = (cb) => {
    cbRef.current = cb;
    inputRef.current?.click();
  };

  const onChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const res = await adminUploadImage(dataUrl);
      cbRef.current?.(res.data.url);
    } catch (err) {
      alert('Не удалось загрузить изображение: ' + (err.message || ''));
    } finally {
      setBusy(false);
    }
  };

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept="image/png,image/jpeg,image/webp"
      style={{ display: 'none' }}
      onChange={onChange}
    />
  );
  return { pick, input, busy };
}

function Field({ label, value, onChange, area = false, rows = 3 }) {
  return (
    <label className="ap-field">
      <span>{label}</span>
      {area ? (
        <textarea value={value || ''} rows={rows} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input type="text" value={value || ''} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}

function LangTabs({ lang, setLang }) {
  return (
    <div className="ap-langtabs" role="tablist">
      {['ru', 'uz'].map((l) => (
        <button
          key={l}
          type="button"
          role="tab"
          aria-selected={lang === l}
          className={lang === l ? 'active' : ''}
          onClick={() => setLang(l)}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export default function AdminPanel() {
  const { t } = useI18n();
  const { user, isLoading } = useAuth();
  const [data, setData] = useState(null);
  const [section, setSection] = useState('announce');
  const [lang, setLang] = useState('ru');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const picker = useImagePicker();

  useEffect(() => {
    let cancelled = false;
    fetchSiteContent()
      .then((res) => {
        if (cancelled) return;
        setData(clone(mergeContent(DEFAULT_CONTENT, res?.data || null)));
      })
      .catch(() => setData(clone(DEFAULT_CONTENT)));
    return () => { cancelled = true; };
  }, []);

  const isAdmin = user?.role === 'admin';

  const save = async () => {
    setSaving(true);
    try {
      await saveSiteContent(data);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2200);
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
  };

  const body = useMemo(() => {
    if (!data) return null;

    if (section === 'announce') {
      return (
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
    }

    if (section === 'hero') {
      const h = data.hero[lang];
      return (
        <>
          <LangTabs lang={lang} setLang={setLang} />
          <div className="ap-row3">
            <Field label="Заголовок — начало" value={h.titlePre} onChange={(v) => patch((d) => { d.hero[lang].titlePre = v; })} />
            <Field label="Акцентное слово (с подчёркиванием)" value={h.titleEm} onChange={(v) => patch((d) => { d.hero[lang].titleEm = v; })} />
            <Field label="Заголовок — конец" value={h.titlePost} onChange={(v) => patch((d) => { d.hero[lang].titlePost = v; })} />
          </div>
          <Field label="Описание" area rows={3} value={h.desc} onChange={(v) => patch((d) => { d.hero[lang].desc = v; })} />
          <Field label="Кнопка" value={h.cta} onChange={(v) => patch((d) => { d.hero[lang].cta = v; })} />

          <h3 className="ap-subhead">Цифры</h3>
          {data.hero.stats.map((st, i) => (
            <div className="ap-row3" key={i}>
              <Field label="Значение" value={st.value} onChange={(v) => patch((d) => { d.hero.stats[i].value = v; })} />
              <Field label="Подпись RU" value={st.ru} onChange={(v) => patch((d) => { d.hero.stats[i].ru = v; })} />
              <Field label="Подпись UZ" value={st.uz} onChange={(v) => patch((d) => { d.hero.stats[i].uz = v; })} />
            </div>
          ))}

          <h3 className="ap-subhead">Бейджи доверия</h3>
          {data.hero.chips.map((chip, i) => (
            <Field key={i} label={`Бейдж ${i + 1}`} value={chip} onChange={(v) => patch((d) => { d.hero.chips[i] = v; })} />
          ))}
        </>
      );
    }

    if (section === 'testimonials') {
      return (
        <>
          <LangTabs lang={lang} setLang={setLang} />
          {data.testimonials.map((item, i) => (
            <div className="ap-card" key={i}>
              <div className="ap-card-head">
                <strong>#{i + 1}</strong>
                <div className="ap-card-tools">
                  <select
                    value={item.kind}
                    onChange={(e) => patch((d) => { d.testimonials[i].kind = e.target.value; })}
                  >
                    {KINDS.map(([v, label]) => <option value={v} key={v}>{label}</option>)}
                  </select>
                  <select
                    value={item.accent}
                    onChange={(e) => patch((d) => { d.testimonials[i].accent = e.target.value; })}
                  >
                    {ACCENTS.map((a) => <option value={a} key={a}>{a}</option>)}
                  </select>
                  <button
                    type="button"
                    className="ap-mini"
                    disabled={i === 0}
                    onClick={() => patch((d) => {
                      const [x] = d.testimonials.splice(i, 1);
                      d.testimonials.splice(i - 1, 0, x);
                    })}
                  >↑</button>
                  <button
                    type="button"
                    className="ap-mini"
                    disabled={i === data.testimonials.length - 1}
                    onClick={() => patch((d) => {
                      const [x] = d.testimonials.splice(i, 1);
                      d.testimonials.splice(i + 1, 0, x);
                    })}
                  >↓</button>
                  <button
                    type="button"
                    className="ap-mini ap-danger"
                    onClick={() => {
                      if (confirm('Удалить отзыв #' + (i + 1) + '?')) {
                        patch((d) => { d.testimonials.splice(i, 1); });
                      }
                    }}
                  >✕</button>
                </div>
              </div>

              <div className="ap-avatar-row">
                <img
                  src={item.avatar || '/assets/avatars/anna.svg'}
                  alt=""
                  width="46"
                  height="46"
                  style={{ borderRadius: '50%', opacity: item.avatar ? 1 : 0.3 }}
                />
                <button
                  type="button"
                  className="ap-mini"
                  disabled={picker.busy}
                  onClick={() => picker.pick((url) => patch((d) => { d.testimonials[i].avatar = url; }))}
                >
                  {picker.busy ? '…' : 'Фото автора'}
                </button>
                {item.avatar && (
                  <button
                    type="button"
                    className="ap-mini"
                    onClick={() => patch((d) => { d.testimonials[i].avatar = ''; })}
                  >без фото</button>
                )}
              </div>

              {item.kind === 'research' && (
                <div className="ap-row3">
                  <Field label="Крупная цифра" value={item.stat} onChange={(v) => patch((d) => { d.testimonials[i].stat = v; })} />
                  <Field label={`Подпись цифры (${lang.toUpperCase()})`} value={item[lang]?.statLabel} onChange={(v) => patch((d) => { d.testimonials[i][lang].statLabel = v; })} />
                </div>
              )}
              <Field label={`Текст (${lang.toUpperCase()})`} area rows={3} value={item[lang]?.text} onChange={(v) => patch((d) => { d.testimonials[i][lang].text = v; })} />
              <div className="ap-row3">
                <Field label={`Имя (${lang.toUpperCase()})`} value={item[lang]?.name} onChange={(v) => patch((d) => { d.testimonials[i][lang].name = v; })} />
                <Field label={`Роль (${lang.toUpperCase()})`} value={item[lang]?.role} onChange={(v) => patch((d) => { d.testimonials[i][lang].role = v; })} />
              </div>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => patch((d) => {
              d.testimonials.push({
                kind: 'quote',
                accent: 'pink',
                avatar: '',
                ru: { text: '', name: '', role: '' },
                uz: { text: '', name: '', role: '' },
              });
            })}
          >
            + Добавить отзыв
          </button>
        </>
      );
    }

    if (section === 'products3d') {
      const labels = ['Главный экран (большая)', 'Отзыв 1', 'Отзыв 2', 'Отзыв 3', 'Отзыв 4', 'Отзыв 5'];
      return (
        <>
          <p className="ap-hint">
            Бутылки на главной. Загружайте фото товара на прозрачном или белом фоне —
            позиции и анимация подставятся автоматически.
          </p>
          <div className="ap-p3d-grid">
            {data.products3d.map((slot, i) => (
              <div className="ap-p3d-cell" key={i}>
                <div className="ap-p3d-frame">
                  <img src={slot.img} alt="" />
                </div>
                <span>{labels[i] || `Слот ${i + 1}`}</span>
                <button
                  type="button"
                  className="ap-mini"
                  disabled={picker.busy}
                  onClick={() => picker.pick((url) => patch((d) => { d.products3d[i].img = url; }))}
                >
                  {picker.busy ? '…' : 'Заменить'}
                </button>
              </div>
            ))}
          </div>
        </>
      );
    }

    if (section === 'blog') {
      return (
        <>
          <LangTabs lang={lang} setLang={setLang} />
          {data.blog.map((post, i) => (
            <div className="ap-card" key={i}>
              <div className="ap-card-head">
                <strong>{post.slug}</strong>
                <div className="ap-card-tools">
                  <button
                    type="button"
                    className="ap-mini ap-danger"
                    onClick={() => {
                      if (confirm('Удалить статью «' + post.slug + '»?')) {
                        patch((d) => { d.blog.splice(i, 1); });
                      }
                    }}
                  >✕</button>
                </div>
              </div>
              <div className="ap-row3">
                <Field label="Slug (латиницей, для ссылки)" value={post.slug} onChange={(v) => patch((d) => { d.blog[i].slug = v.replace(/[^a-z0-9-]/g, ''); })} />
                <Field label="Минут чтения" value={String(post.read)} onChange={(v) => patch((d) => { d.blog[i].read = Number(v) || 1; })} />
                <Field label={`Рубрика (${lang.toUpperCase()})`} value={post[lang]?.tag} onChange={(v) => patch((d) => { d.blog[i][lang].tag = v; })} />
              </div>
              <Field label={`Заголовок (${lang.toUpperCase()})`} value={post[lang]?.title} onChange={(v) => patch((d) => { d.blog[i][lang].title = v; })} />
              <Field label={`Анонс (${lang.toUpperCase()})`} area rows={2} value={post[lang]?.excerpt} onChange={(v) => patch((d) => { d.blog[i][lang].excerpt = v; })} />
              <Field
                label={`Текст (${lang.toUpperCase()}) — каждый абзац с новой строки`}
                area
                rows={8}
                value={(post[lang]?.body || []).join('\n\n')}
                onChange={(v) => patch((d) => {
                  d.blog[i][lang].body = v.split(/\n\n+/).map((s) => s.trim()).filter(Boolean);
                })}
              />
            </div>
          ))}
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => patch((d) => {
              d.blog.push({
                slug: 'new-post-' + (d.blog.length + 1),
                read: 5,
                ru: { tag: '', title: '', excerpt: '', body: [] },
                uz: { tag: '', title: '', excerpt: '', body: [] },
              });
            })}
          >
            + Добавить статью
          </button>
        </>
      );
    }

    return null;
  }, [data, section, lang, picker.busy]);

  if (isLoading) return <div className="container ap-page"><p>{t('loading')}</p></div>;

  if (!user) {
    return (
      <div className="container ap-page ap-gate">
        <h1 className="page-title">Админ-панель</h1>
        <p>Войдите через Telegram — доступ только для администраторов.</p>
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

  return (
    <div className="container ap-page">
      {picker.input}
      <div className="ap-topbar">
        <h1 className="page-title">Админ-панель</h1>
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving || !data}>
          {saving ? 'Сохраняю…' : savedFlash ? '✓ Сохранено' : 'Сохранить изменения'}
        </button>
      </div>

      <div className="ap-layout">
        <nav className="ap-nav">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`ap-nav-item ${section === s.id ? 'active' : ''}`}
              onClick={() => setSection(s.id)}
            >
              <span className="ap-nav-icon" aria-hidden="true">{s.icon}</span>
              {s.ru}
              <span className="ap-nav-chev" aria-hidden="true">›</span>
            </button>
          ))}
          <div className="ap-nav-note">
            Изменения появятся на сайте сразу после «Сохранить».
          </div>
        </nav>

        <section className="ap-editor">
          {body || <p>{t('loading')}</p>}
        </section>
      </div>
    </div>
  );
}
