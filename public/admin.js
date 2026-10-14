const db = firebase.database();

const refs = {
  questions: db.ref('questions'),
  players: db.ref('players'),
  game: db.ref('game'),
};

/* 로컬 상태 (DB와 동기화) */
let questions = []; // {id, question, options, answer}
let players = {};   // pid -> {name, alive, answer, result, correctAnswer}
let game = {
  status: 'waiting',
  currentNumber: 0,
  order: [],
  targetRemaining: 5,
  shuffle: true,
};
let current = null; // /game/current

/* DOM */
const $ = (id) => document.getElementById(id);
const statusBadge = $('statusBadge');
const statusText = $('statusText');
const qrImage = $('qrImage');
const qrUrl = $('qrUrl');
const copyBtn = $('copyBtn');

const targetInput = $('targetInput');
const targetMinus = $('targetMinus');
const targetPlus = $('targetPlus');
const shuffleToggle = $('shuffleToggle');

const startBtn = $('startBtn');
const nextBtn = $('nextBtn');
const resetBtn = $('resetBtn');
const finishBtn = $('finishBtn');

const statPlayers = $('statPlayers');
const statQuestion = $('statQuestion');
const statEliminated = $('statEliminated');
const statAlive = $('statAlive');

const liveQuestionCard = $('liveQuestionCard');
const liveQuestionText = $('liveQuestionText');
const liveAnswerText = $('liveAnswerText');
const answeredCount = $('answeredCount');

const aliveChips = $('aliveChips');
const aliveEmpty = $('aliveEmpty');

const qText = $('qText');
const optInputs = ['opt0', 'opt1', 'opt2', 'opt3'].map((id) => $(id));
const answerSelect = $('answerSelect');
const addQuestionBtn = $('addQuestionBtn');
const questionList = $('questionList');

/* ---------- QR ---------- */
function loadQR() {
  const url = location.origin + '/player.html';
  qrUrl.value = url;
  QRCode.toDataURL(url, { width: 480, margin: 2, color: { dark: '#111827', light: '#ffffff' } })
    .then((dataUrl) => { qrImage.src = dataUrl; })
    .catch(() => { qrImage.alt = 'QR 생성 실패'; });
}
loadQR();

copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(qrUrl.value);
    copyBtn.textContent = '복사됨!';
    setTimeout(() => (copyBtn.textContent = '복사'), 1500);
  } catch (e) {
    qrUrl.select();
    document.execCommand('copy');
  }
});

/* ---------- 데이터 리스너 ---------- */
refs.questions.on('value', (snap) => {
  questions = [];
  snap.forEach((c) => questions.push({ id: c.key, ...c.val() }));
  render();
});

refs.players.on('value', (snap) => {
  players = {};
  snap.forEach((c) => { players[c.key] = c.val(); });
  checkAnswers();
  render();
});

refs.game.on('value', (snap) => {
  const v = snap.val() || {};
  game = {
    status: v.status || 'waiting',
    currentNumber: v.currentNumber || 0,
    order: v.order || [],
    targetRemaining: v.targetRemaining || 5,
    shuffle: typeof v.shuffle === 'undefined' ? true : v.shuffle,
  };
  current = v.current || null;
  render();
});

// 최초 실행 시 게임 노드 초기화
refs.game.once('value', (snap) => {
  const v = snap.val() || {};
  const updates = {};
  if (!v.status) updates.status = 'waiting';
  if (!v.targetRemaining) updates.targetRemaining = 5;
  if (typeof v.shuffle === 'undefined') updates.shuffle = true;
  if (Object.keys(updates).length) refs.game.update(updates);
});

/* ---------- 정답 검사 (관리자 브라우저가 수행) ---------- */
function checkAnswers() {
  if (game.status !== 'playing' || !current) return;
  const q = questions.find((x) => x.id === current.qid);
  if (!q) return;

  let changed = false;
  Object.entries(players).forEach(([pid, p]) => {
    if (p.alive && p.answer != null && !p.result) {
      const correct = Number(p.answer) === Number(q.answer);
      const upd = { result: correct ? 'correct' : 'wrong' };
      if (!correct) {
        upd.alive = false;
        upd.correctAnswer = q.options[q.answer];
      }
      refs.players.child(pid).update(upd);
      changed = true;
    }
  });

  if (changed) checkFinish();
}

function checkFinish() {
  if (game.status !== 'playing') return;
  const alive = Object.values(players).filter((p) => p.alive);
  if (alive.length > 0 && alive.length <= game.targetRemaining) {
    refs.game.child('status').set('finished');
  }
}

/* ---------- 게임 컨트롤 ---------- */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function startGame() {
  if (questions.length === 0) { alert('먼저 문제를 추가해주세요.'); return; }
  if (Object.keys(players).length === 0) { alert('참가자가 없습니다.'); return; }

  const order = game.shuffle ? shuffle(questions.map((q) => q.id)) : questions.map((q) => q.id);

  // 모든 플레이어 초기화
  const updates = {};
  Object.entries(players).forEach(([pid]) => {
    updates[pid + '/alive'] = true;
    updates[pid + '/answer'] = null;
    updates[pid + '/result'] = null;
    updates[pid + '/correctAnswer'] = null;
  });
  refs.players.update(updates);

  game.order = order;
  game.currentNumber = 0;
  game.status = 'playing';
  refs.game.update({ order, currentNumber: 0, status: 'playing', current: null });

  nextQuestion();
}

function nextQuestion() {
  if (game.status !== 'playing') return;
  const num = game.currentNumber + 1;
  if (num > game.order.length) { finishGame(); return; }

  const qid = game.order[num - 1];
  const q = questions.find((x) => x.id === qid);
  if (!q) { finishGame(); return; }

  const cur = { number: num, total: game.order.length, question: q.question, options: q.options, qid };
  game.currentNumber = num;
  refs.game.update({ currentNumber: num, current: cur });
}

function finishGame() {
  refs.game.child('status').set('finished');
}

function resetGame() {
  refs.players.remove();
  refs.game.remove();
}

startBtn.addEventListener('click', startGame);
nextBtn.addEventListener('click', nextQuestion);
finishBtn.addEventListener('click', finishGame);
resetBtn.addEventListener('click', () => {
  if (confirm('정말 초기화할까요? 모든 참가자와 게임 진행이 삭제됩니다.')) resetGame();
});

/* ---------- 설정 ---------- */
function setTarget(v) {
  targetInput.value = v;
  refs.game.child('targetRemaining').set(v);
}
targetMinus.addEventListener('click', () => setTarget(Math.max(1, Number(targetInput.value) - 1)));
targetPlus.addEventListener('click', () => setTarget(Number(targetInput.value) + 1));
targetInput.addEventListener('change', () => setTarget(Math.max(1, Number(targetInput.value))));
shuffleToggle.addEventListener('change', () => refs.game.child('shuffle').set(shuffleToggle.checked));

/* ---------- 문제 관리 ---------- */
function updateAnswerSelect() {
  const vals = optInputs.map((i) => i.value.trim());
  const options = answerSelect.options;
  for (let i = 0; i < optInputs.length; i++) {
    options[i].textContent = vals[i] ? `정답: ${vals[i]}` : `정답: 보기 ${i + 1}`;
  }
}
optInputs.forEach((i) => i.addEventListener('input', updateAnswerSelect));

addQuestionBtn.addEventListener('click', () => {
  const options = optInputs.map((i) => i.value.trim()).filter(Boolean);
  const question = qText.value.trim();
  const answer = Number(answerSelect.value);

  if (!question || options.length < 2) {
    alert('문제 내용과 보기(2개 이상)를 입력해주세요.');
    return;
  }

  refs.questions.push({ question, options, answer }).then(() => {
    qText.value = '';
    optInputs.forEach((i) => (i.value = ''));
    answerSelect.value = '0';
    updateAnswerSelect();
  });
});

/* ---------- 렌더링 ---------- */
function render() {
  const statusMap = { waiting: '대기 중', playing: '게임 진행 중', finished: '게임 종료' };
  statusBadge.className = 'badge ' + game.status;
  statusText.textContent = statusMap[game.status] || game.status;

  const arr = Object.values(players);
  const aliveArr = arr.filter((p) => p.alive);
  const aliveCount = aliveArr.length;
  const playerCount = arr.length;

  statPlayers.textContent = playerCount;
  statQuestion.textContent = game.status === 'waiting' ? '-' : `${game.currentNumber} / ${game.order.length}`;
  statEliminated.textContent = playerCount - aliveCount;
  statAlive.textContent = aliveCount;

  // 현재 출제 중인 문제
  if (game.status === 'playing' && current) {
    liveQuestionCard.hidden = false;
    liveQuestionText.textContent = `Q${current.number}. ${current.question}`;
    const q = questions.find((x) => x.id === current.qid);
    liveAnswerText.textContent = q ? q.options[q.answer] : '-';
    const answered = arr.filter((p) => p.alive && p.answer != null).length;
    answeredCount.textContent = `(응답 ${answered}/${aliveCount})`;
  } else {
    liveQuestionCard.hidden = true;
  }

  // 남은 인원 명단
  aliveChips.innerHTML = '';
  if (aliveArr.length === 0) {
    aliveEmpty.style.display = 'block';
  } else {
    aliveEmpty.style.display = 'none';
    aliveArr.forEach((p) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = `<span class="avatar">${escapeHtml(p.name[0] || '?')}</span>${escapeHtml(p.name)}`;
      aliveChips.appendChild(chip);
    });
  }

  // 컨트롤 버튼
  const playing = game.status === 'playing';
  const waiting = game.status === 'waiting';
  startBtn.disabled = !waiting || playerCount === 0 || questions.length === 0;
  nextBtn.disabled = !playing;
  finishBtn.disabled = !playing;

  // 설정 반영
  targetInput.value = game.targetRemaining;
  shuffleToggle.checked = game.shuffle;

  // 문제 목록
  questionList.innerHTML = '';
  questions.forEach((q, i) => {
    const item = document.createElement('div');
    item.className = 'q-item';
    item.innerHTML = `
      <span class="qnum">${i + 1}</span>
      <div class="qtext">
        ${escapeHtml(q.question)}
        <div class="ans">✔ 정답: ${escapeHtml(q.options[q.answer] || '')}</div>
      </div>
      <button class="del" data-id="${q.id}" title="삭제">🗑</button>
    `;
    questionList.appendChild(item);
  });
  questionList.querySelectorAll('.del').forEach((btn) => {
    btn.addEventListener('click', () => refs.questions.child(btn.dataset.id).remove());
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
