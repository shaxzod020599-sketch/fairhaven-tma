import React from 'react';
import { useI18n } from '../i18n/index.jsx';

const REVIEWS_RU = [
  { name: 'Анна, Ташкент', rating: 5, text: 'Принимали FertilAid с мужем три месяца — результат превзошёл ожидания. Спасибо за оригинал!' },
  { name: 'Дилфуза, Самарканд', rating: 5, text: 'PeaPod пью всю беременность. Доставка быстрая, всё оригинальное.' },
  { name: 'Елена, Ташкент', rating: 5, text: 'Nursing Blend реально помог с лактацией. Консультант помог подобрать дозировку.' },
];

const REVIEWS_UZ = [
  { name: 'Anna, Toshkent', rating: 5, text: 'Erim bilan FertilAid ni uch oy qabul qildik — natija kutganimizdan ham yaxshi bo‘ldi. Original uchun rahmat!' },
  { name: 'Dilfuza, Samarqand', rating: 5, text: 'PeaPod ni butun homiladorlik davomida ichdim. Yetkazib berish tez, hammasi original.' },
  { name: 'Yelena, Toshkent', rating: 5, text: 'Nursing Blend emizishda haqiqatdan yordam berdi. Mutaxassis dozani tanlashga yordam berdi.' },
];

export default function Reviews() {
  const { t, lang } = useI18n();
  const list = lang === 'uz' ? REVIEWS_UZ : REVIEWS_RU;

  return (
    <div className="reviews-grid">
      {list.map((r, i) => (
        <figure className="review-card" key={i}>
          <div className="review-stars" aria-label={`${r.rating}/5`}>
            {'★★★★★'.slice(0, r.rating)}
          </div>
          <blockquote className="review-text">"{r.text}"</blockquote>
          <figcaption className="review-author">{r.name}</figcaption>
        </figure>
      ))}
    </div>
  );
}
