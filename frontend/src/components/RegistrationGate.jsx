import React from 'react';
import { closeMiniApp, hapticFeedback, getTelegram } from '../utils/telegram';

export default function RegistrationGate({ reason }) {
  const isInTelegram = !!getTelegram();
  const isNotStarted = reason === 'not_started';

  // Inside Telegram: close the mini app — user returns to the bot chat where
  // registration is waiting. Outside Telegram: no-op (we're in dev/browser).
  const returnToBot = () => {
    hapticFeedback('medium');
    closeMiniApp();
  };

  return (
    <div className="gate-overlay" id="registration-gate">
      <div className="gate-card">
        <div className="gate-leaf one" aria-hidden="true">🌿</div>
        <div className="gate-leaf two" aria-hidden="true">🌱</div>

        <div className="gate-eyebrow">FAIRHAVEN · РЕГИСТРАЦИЯ</div>
        <h1 className="gate-title">
          {isNotStarted ? (
            <>
              Нужна <em>регистрация</em>
            </>
          ) : (
            <>
              Завершите <em>регистрацию</em>
            </>
          )}
        </h1>

        <p className="gate-desc">
          {isNotStarted ? (
            <>
              Чтобы открыть магазин, сначала зарегистрируйтесь в нашем
              Telegram-боте и примите условия оферты.
              <br /><br />
              <span className="gate-desc-uz">
                Do‘konni ochish uchun avval Telegram botimizda ro‘yxatdan
                o‘ting va oferta shartlarini qabul qiling.
              </span>
            </>
          ) : (
            <>
              Вы начали регистрацию, но не завершили её. Вернитесь в бот —
              ваш прогресс сохранён.
              <br /><br />
              <span className="gate-desc-uz">
                Siz ro‘yxatdan o‘tishni boshladingiz, lekin yakunlamagansiz.
                Botga qayting — jarayon saqlangan.
              </span>
            </>
          )}
        </p>

        <ol className="gate-steps">
          <li>
            <span className="gate-step-num">1</span>
            <span className="gate-step-text">
              <strong>Ism, familya, tug‘ilgan yil, jins</strong>
              <span className="gate-step-ru">Имя, фамилия, год рождения, пол</span>
            </span>
          </li>
          <li>
            <span className="gate-step-num">2</span>
            <span className="gate-step-text">
              <strong>Telefon raqam</strong>
              <span className="gate-step-ru">Номер телефона</span>
            </span>
          </li>
          <li>
            <span className="gate-step-num">3</span>
            <span className="gate-step-text">
              <strong>Ommaviy oferta bilan tanishish</strong>
              <span className="gate-step-ru">Согласие с публичной офертой</span>
            </span>
          </li>
        </ol>

        {isInTelegram ? (
          <button
            className="gate-cta"
            onClick={returnToBot}
            id="gate-return-to-bot"
          >
            <span aria-hidden="true">✈</span>
            {isNotStarted
              ? 'Вернуться к боту'
              : 'Продолжить в боте'}
            <span className="arrow" aria-hidden="true">→</span>
          </button>
        ) : (
          <div className="gate-cta-disabled">
            Откройте магазин через Telegram-бот FairHaven
          </div>
        )}
      </div>
    </div>
  );
}
