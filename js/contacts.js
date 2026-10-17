// «Подробнее» в карточке направления ведёт к контактам и запоминает тему:
// над кнопками появляется плашка с выбранным направлением, в письмо подставляется тема.
// Ничего не отправляется — это только подсказка для первого сообщения.

const EMAIL = 'yakobsonv@icloud.com';

export function initTopics() {
  const note = document.querySelector('[data-topic-note]');
  const text = note?.querySelector('[data-topic-text]');
  const reset = note?.querySelector('[data-topic-reset]');
  const mail = document.querySelector('[data-mail]');
  if (!note || !text || !reset || !mail) return;

  const setTopic = (topic) => {
    if (topic) {
      text.textContent = `Направление: ${topic}`;
      mail.href = `mailto:${EMAIL}?subject=${encodeURIComponent(`Обсуждение: ${topic}`)}`;
      note.hidden = false;
    } else {
      note.hidden = true;
      text.textContent = '';
      mail.href = `mailto:${EMAIL}`;
    }
  };

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-topic]');
    if (!link || event.defaultPrevented) return;
    setTopic(link.dataset.topic);
  });
  reset.addEventListener('click', () => {
    setTopic('');
    mail.focus();
  });
}
