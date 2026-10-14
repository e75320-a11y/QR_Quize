const db = firebase.database();

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

let pid = localStorage.getItem('pid');
let myRef = pid ? db.ref('players/' + pid) : null;

let game = { status: 'waiting' };
let current = null;   // /game/current (정답 없음)
let me = null;        // 내 플레이어 노드

let renderedQid = null;
let answered = false;
let correctHandled = false;
let wrongHandled = false;

function show(active) {
  Object.entries(screens).forEach(([key, el]) => {
    el.hidden = key !== active;
  });
}

/* ---------- Firebase 리스너 ---------- */
db.ref('game/status').on('value', (s) => {
  game.status = s.val() || 'waiting';
  render();
});

db.ref('game/current').on('value', (s) => {
  current = s.val();
  render();
});

function attachMe() {
  if (!myRef) return;
  myRef.on('value', (s) => {
    me = s.val();
    if (!me) {
      // 초기화 등으로 내 노드가 삭제됨
      localStorage.removeItem('pid');
      myRef.off();
      myRef = null;
      me = null;
      renderedQid = null;
      show('name');
      return;
    }
    render();
  });
}
attachMe();

/* ---------- 이름 입력 ---------- */
joinBtn.addEventListener('click', () => {
  const name = nameInput.value.trim();
  if (!name) {
    joinError.textContent = '이름을 입력해주세요.';
    return;
  }
  joinError.textContent = '';
  joinBtn.disabled = true;

  db.ref('players').push({
    name,
    alive: true,
    answer: null,
    result: null,
    correctAnswer: null,
  }).then((ref) => {
    pid = ref.key;
    localStorage.setItem('pid', pid);
    myRef = db.ref('players/' + pid);
    attachMe();
    joinBtn.disabled = false;
  }).catch(() => {
    joinError.textContent = '참가에 실패했습니다. 다시 시도해주세요.';
    joinBtn.disabled = false;
  });
});

nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinBtn.click();
});

/* ---------- 렌더링 ---------- */
function render() {
  if (!me) { show('name'); return; }
  if (game.status === 'waiting') { show('waiting'); return; }
  if (game.status === 'finished') { show(me.alive ? 'won' : 'lost'); return; }

  // playing 상태
  if (!current) { show('waiting'); return; }

  // 새 문제 렌더링
  if (renderedQid !== current.qid) {
    renderedQid = current.qid;
    answered = false;
    correctHandled = false;
    wrongHandled = false;
    qNum.textContent = `문제 ${current.number}`;
    qProgress.textContent = `${current.number} / ${current.total}`;
    qText.textContent = current.question;
    renderOptions(current.options);
    show('question');
  }

  // 오답 처리
  if (me.result === 'wrong' && !wrongHandled) {
    wrongHandled = true;
    markOptions(me.answer, true);
    resultCard.className = 'p-overlay-card wrong';
    resultEmoji.textContent = '😢';
    resultTitle.textContent = '아쉽지만 오답입니다';
    resultSub.textContent = `정답은 ${me.correctAnswer} 입니다`;
    lostAnswer.textContent = me.correctAnswer;
    resultOverlay.hidden = false;
    setTimeout(() => {
      resultOverlay.hidden = true;
      show('lost');
    }, 2000);
    return;
  }

  // 정답 처리
  if (me.result === 'correct' && !correctHandled) {
    correctHandled = true;
    markOptions(me.answer, false);
    resultCard.className = 'p-overlay-card correct';
    resultEmoji.textContent = '🎉';
    resultTitle.textContent = '정답입니다!';
    resultSub.textContent = '다음 문제를 기다려주세요';
    resultOverlay.hidden = false;
    setTimeout(() => { resultOverlay.hidden = true; }, 1500);
    return;
  }

  // 응답 제출 후 결과 대기
  if (me.answer != null || me.result) {
    answered = true;
    disableOptions();
  }
}

function renderOptions(opts) {
  options.innerHTML = '';
  opts.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'p-option';
    btn.innerHTML = `<span class="o-num">${i + 1}</span><span>${escapeHtml(opt)}</span>`;
    btn.addEventListener('click', () => {
      if (answered || me.answer != null) return;
      answered = true;
      disableOptions();
      myRef.update({ answer: i });
    });
    options.appendChild(btn);
  });
}

function disableOptions() {
  options.querySelectorAll('.p-option').forEach((b) => b.classList.add('disabled'));
}

function markOptions(chosen, isWrong) {
  options.querySelectorAll('.p-option').forEach((b, i) => {
    if (i === chosen) b.classList.add(isWrong ? 'wrong' : 'correct');
    b.classList.add('disabled');
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

show('name');
