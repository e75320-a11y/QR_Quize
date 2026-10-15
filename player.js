const socket = io();

const $ = (id) => document.getElementById(id);
const screens = {
  name: $('nameScreen'),
  waiting: $('waitingScreen'),
  question: $('questionScreen'),
  lost: $('lostScreen'),
  won: $('wonScreen'),
};

const nameInput = $('nameInput');
const joinBtn = $('joinBtn');
const joinError = $('joinError');
const waitName = $('waitName');
const qNum = $('qNum');
const qProgress = $('qProgress');
const qText = $('qText');
const options = $('options');
const resultOverlay = $('resultOverlay');
const resultCard = $('resultCard');
const resultEmoji = $('resultEmoji');
const resultTitle = $('resultTitle');
const resultSub = $('resultSub');
const lostAnswer = $('lostAnswer');

function show(active) {
  Object.entries(screens).forEach(([key, el]) => {
    el.hidden = key !== active;
  });
}

/* 이름 입력 */
joinBtn.addEventListener('click', () => {
  const name = nameInput.value.trim();
  if (!name) {
    joinError.textContent = '이름을 입력해주세요.';
    return;
  }
  joinError.textContent = '';
  joinBtn.disabled = true;
  socket.emit('player:join', name);
});

nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinBtn.click();
});

/* 소켓 이벤트 */
socket.on('joined', (data) => {
  waitName.textContent = data.name;
  show('waiting');
});

socket.on('error', (msg) => {
  joinError.textContent = msg;
  joinBtn.disabled = false;
});

socket.on('question', (data) => {
  qNum.textContent = `문제 ${data.number}`;
  qProgress.textContent = `${data.number} / ${data.total}`;
  qText.textContent = data.question;
  renderOptions(data.options);
  show('question');
});

socket.on('result', (data) => {
  markOptions(data.correctAnswer, data.correct);
  if (data.correct) {
    resultCard.className = 'p-overlay-card correct';
    resultEmoji.textContent = '🎉';
    resultTitle.textContent = '정답입니다!';
    resultSub.textContent = '다음 문제를 기다려주세요';
    showResultOverlay();
    setTimeout(() => {
      resultOverlay.hidden = true;
    }, 1500);
  } else {
    resultCard.className = 'p-overlay-card wrong';
    resultEmoji.textContent = '😢';
    resultTitle.textContent = '아쉽지만 오답입니다';
    resultSub.textContent = `정답은 ${data.answerText} 입니다`;
    lostAnswer.textContent = data.answerText;
    showResultOverlay();
    setTimeout(() => {
      resultOverlay.hidden = true;
      show('lost');
    }, 2000);
  }
});

socket.on('won', () => show('won'));
socket.on('lost', () => show('lost'));

function renderOptions(opts) {
  options.innerHTML = '';
  opts.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'p-option';
    btn.innerHTML = `<span class="o-num">${i + 1}</span><span>${escapeHtml(opt)}</span>`;
    btn.addEventListener('click', () => {
      // 이미 응답했다면 무시
      if (options.dataset.answered === '1') return;
      options.dataset.answered = '1';
      disableOptions();
      socket.emit('player:answer', i);
    });
    options.appendChild(btn);
  });
  options.dataset.answered = '0';
}

function disableOptions() {
  options.querySelectorAll('.p-option').forEach((b) => b.classList.add('disabled'));
}

function markOptions(correctIdx, correct) {
  options.querySelectorAll('.p-option').forEach((b, i) => {
    if (i === correctIdx) b.classList.add('correct');
    if (!correct && i !== correctIdx) b.classList.add('disabled');
  });
}

function showResultOverlay() {
  resultOverlay.hidden = false;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

show('name');
