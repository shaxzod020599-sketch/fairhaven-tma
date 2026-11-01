import React, { useRef, useState } from 'react';
import { adminUploadVideo } from '../../api.js';
import { Close } from '../../components/Icons.jsx';
import { Field, LangTabs } from './fields.jsx';

const VIDEO_MAX = 100 * 1024 * 1024;

const toParagraphs = (text) => text.split(/\n\s*\n+/).map((s) => s.trim()).filter(Boolean);

// The raw text stays local while typing: rebuilding it from the parsed paragraphs would eat the Enter that
// starts a new paragraph.
function BodyField({ label, body, onChange }) {
  const [text, setText] = useState(() => (body || []).join('\n\n'));
  return (
    <Field
      label={label}
      area
      rows={8}
      value={text}
      onChange={(v) => {
        setText(v);
        onChange(toParagraphs(v));
      }}
    />
  );
}

/** «Блог»: the journal posts kept in site content, with an optional uploaded video per post. */
export default function BlogEditor({ blog, lang, setLang, patch }) {
  const inputRef = useRef(null);
  const cbRef = useRef(null);
  const [progress, setProgress] = useState(null); // null | 0..100

  const pickVideo = (cb) => {
    cbRef.current = cb;
    inputRef.current?.click();
  };

  const onVideoChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > VIDEO_MAX) {
      alert('Видео больше 100 МБ. Сожмите его или загрузите короче.');
      return;
    }
    setProgress(0);
    try {
      const res = await adminUploadVideo(file, setProgress);
      cbRef.current?.(res.data.url);
    } catch (err) {
      alert('Не удалось загрузить видео: ' + (err.message || ''));
    } finally {
      setProgress(null);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        hidden
        onChange={onVideoChange}
      />
      <LangTabs lang={lang} setLang={setLang} />
      {blog.map((post, i) => (
        <div className="ap-card" key={i}>
          <div className="ap-card-head">
            <strong>{post.slug}</strong>
            <div className="ap-card-tools">
              <button
                type="button"
                className="ap-icon ap-danger"
                aria-label={`Удалить статью ${post.slug}`}
                title="Удалить статью"
                onClick={() => {
                  if (window.confirm('Удалить статью «' + post.slug + '»?')) {
                    patch((d) => { d.blog.splice(i, 1); });
                  }
                }}
              >
                <Close size={18} />
              </button>
            </div>
          </div>
          <div className="ap-video-row">
            {post.video ? (
              <>
                <video src={post.video} className="ap-video-preview" muted playsInline preload="metadata" />
                <button
                  type="button"
                  className="ap-mini ap-danger"
                  onClick={() => patch((d) => { d.blog[i].video = ''; })}
                >Убрать видео</button>
              </>
            ) : (
              <span className="ap-hint ap-hint-inline">Видео не добавлено</span>
            )}
            <button
              type="button"
              className="ap-mini"
              disabled={progress !== null}
              onClick={() => pickVideo((url) => patch((d) => { d.blog[i].video = url; }))}
            >
              {progress !== null ? `Загрузка… ${progress}%` : (post.video ? 'Заменить видео' : 'Загрузить видео')}
            </button>
          </div>
          {progress !== null && (
            <div className="ap-progress"><span style={{ width: progress + '%' }} /></div>
          )}
          <div className="ap-row3">
            <Field label="Slug (латиницей, для ссылки)" value={post.slug} onChange={(v) => patch((d) => { d.blog[i].slug = v.replace(/[^a-z0-9-]/g, ''); })} />
            <Field label="Минут чтения" value={String(post.read)} onChange={(v) => patch((d) => { d.blog[i].read = Number(v) || 1; })} />
            <Field label={`Рубрика (${lang.toUpperCase()})`} value={post[lang]?.tag} onChange={(v) => patch((d) => { d.blog[i][lang].tag = v; })} />
          </div>
          <Field label={`Заголовок (${lang.toUpperCase()})`} value={post[lang]?.title} onChange={(v) => patch((d) => { d.blog[i][lang].title = v; })} />
          <Field label={`Анонс (${lang.toUpperCase()})`} area rows={2} value={post[lang]?.excerpt} onChange={(v) => patch((d) => { d.blog[i][lang].excerpt = v; })} />
          <BodyField
            key={`${post.slug}-${i}-${lang}`}
            label={`Текст (${lang.toUpperCase()}): каждый абзац через пустую строку`}
            body={post[lang]?.body}
            onChange={(paras) => patch((d) => { d.blog[i][lang].body = paras; })}
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
        Добавить статью
      </button>
    </>
  );
}
