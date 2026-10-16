import { supabase } from './supabase-config.js';

/* 로컬 상태 */
let questions = []; // {id, question, options, answer}
let players = {};   // id -> {id, name, alive, answer, result, correct_answer}
let game = {
  status: 'waiting',
  current_number: 0,
  question_order: [],
  target_remaining: 5,
  shuffle: true,
};
let current = null; // game.current

/* DOM */
const $ = (id) => document.getElementById(id);
const statusBadge = $('statusBadge');
const statusText = $('statusText');

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
const statCorrect = $('statCorrect');
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

/* ---------- 데이터 로드 ---------- */
async function loadQuestions() {
  const { data, error } = await supabase.from('questions').select('*').order('id', { ascending: true });
  if (error) console.error(error);
  questions = data || [];
  render();
}

async function refreshPlayers() {
  const { data } = await supabase.from('players').select('*');
  players = {};
  (data || []).forEach((p) => { players[p.id] = p; });
  await checkAnswers();
  render();
}

async function refreshGame() {
  const { data } = await supabase.from('game').select('*').eq('id', 1).maybeSingle();
  const v = data || {};
  game = {
    status: v.status || 'waiting',
    current_number: v.current_number || 0,
    question_order: v.question_order || [],
    target_remaining: v.target_remaining || 5,
    shuffle: typeof v.shuffle === 'undefined' ? true : v.shuffle,
  };
  current = v.current || null;
  render();
}

/* 실시간 구독 */
supabase
  .channel('admin-players')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => { refreshPlayers(); })
  .subscribe();

supabase
  .channel('admin-game')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'game' }, () => { refreshGame(); })
  .subscribe();

/* ---------- 정답 검사 (관리자 브라우저가 수행) ---------- */
let checking = false;
async function checkAnswers() {
  if (checking) return;
  if (game.status !== 'playing' || !current) return;
  const q = questions.find((x) => x.id === current.qid);
  if (!q) return;

  checking = true;
  try {
    let changed = false;
    for (const p of Object.values(players)) {
      if (p.alive && p.answer != null && !p.result) {
        const correct = Number(p.answer) === Number(q.answer);
        const upd = { result: correct ? 'correct' : 'wrong' };
        if (!correct) {
          upd.alive = false;
          upd.correct_answer = q.options[q.answer];
        }
        await supabase.from('players').update(upd).eq('id', p.id);
        changed = true;
      }
    }
    if (changed) await checkFinish();
  } finally {
    checking = false;
  }
}

async function checkFinish() {
  if (game.status !== 'playing') return;
  const alive = Object.values(players).filter((p) => p.alive);
  if (alive.length > 0 && alive.length <= game.target_remaining) {
    await supabase.from('game').update({ status: 'finished' }).eq('id', 1);
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

async function startGame() {
  if (questions.length === 0) { alert('먼저 문제를 추가해주세요.'); return; }
  if (Object.keys(players).length === 0) { alert('참가자가 없습니다.'); return; }

  const order = game.shuffle ? shuffle(questions.map((q) => q.id)) : questions.map((q) => q.id);

  // 모든 플레이어 초기화
  for (const p of Object.values(players)) {
    await supabase.from('players').update({
      alive: true, answer: null, result: null, correct_answer: null,
    }).eq('id', p.id);
  }

  await supabase.from('game').update({
    question_order: order, current_number: 0, status: 'playing', current: null,
  }).eq('id', 1);

  game.question_order = order;
  game.current_number = 0;
  game.status = 'playing';
  await nextQuestion();
}

async function nextQuestion() {
  if (game.status !== 'playing') return;
  const num = game.current_number + 1;
  if (num > game.question_order.length) { await finishGame(); return; }

  const qid = game.question_order[num - 1];
  const q = questions.find((x) => x.id === qid);
  if (!q) { await finishGame(); return; }

  const cur = { number: num, total: game.question_order.length, question: q.question, options: q.options, qid };
  await supabase.from('game').update({ current_number: num, current: cur }).eq('id', 1);
  game.current_number = num;
}

async function finishGame() {
  await supabase.from('game').update({ status: 'finished' }).eq('id', 1);
}

async function resetGame() {
  await supabase.from('players').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('game').update({
    status: 'waiting', current_number: 0, question_order: [], current: null,
  }).eq('id', 1);
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
  supabase.from('game').update({ target_remaining: v }).eq('id', 1);
}
targetMinus.addEventListener('click', () => setTarget(Math.max(1, Number(targetInput.value) - 1)));
targetPlus.addEventListener('click', () => setTarget(Number(targetInput.value) + 1));
targetInput.addEventListener('change', () => setTarget(Math.max(1, Number(targetInput.value))));
shuffleToggle.addEventListener('change', () => {
  supabase.from('game').update({ shuffle: shuffleToggle.checked }).eq('id', 1);
});

/* ---------- 문제 관리 ---------- */
function updateAnswerSelect() {
  const vals = optInputs.map((i) => i.value.trim());
  const options = answerSelect.options;
  for (let i = 0; i < optInputs.length; i++) {
    options[i].textContent = vals[i] ? `정답: ${vals[i]}` : `정답: 보기 ${i + 1}`;
  }
}
optInputs.forEach((i) => i.addEventListener('input', updateAnswerSelect));

addQuestionBtn.addEventListener('click', async () => {
  const options = optInputs.map((i) => i.value.trim()).filter(Boolean);
  const question = qText.value.trim();
  const answer = Number(answerSelect.value);

  if (!question || options.length < 2) {
    alert('문제 내용과 보기(2개 이상)를 입력해주세요.');
    return;
  }

  const { error } = await supabase.from('questions').insert({ question, options, answer });
  if (error) { alert('문제 저장 실패: ' + error.message); return; }

  qText.value = '';
  optInputs.forEach((i) => (i.value = ''));
  answerSelect.value = '0';
  updateAnswerSelect();
  await loadQuestions();
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
  const correctCount = arr.filter((p) => p.result === 'correct').length;
  const answeredTotal = arr.filter((p) => p.answer != null).length;

  statPlayers.textContent = playerCount;
  statQuestion.textContent = game.status === 'waiting' ? '-' : `${game.current_number} / ${game.question_order.length}`;
  statCorrect.textContent = correctCount;
  statEliminated.textContent = playerCount - aliveCount;
  statAlive.textContent = aliveCount;

  // 현재 출제 중인 문제
  if (game.status === 'playing' && current) {
    liveQuestionCard.hidden = false;
    liveQuestionText.textContent = `Q${current.number}. ${current.question}`;
    const q = questions.find((x) => x.id === current.qid);
    liveAnswerText.textContent = q ? q.options[q.answer] : '-';
    answeredCount.textContent = `(정답 ${correctCount} · 응답 ${answeredTotal}/${aliveCount})`;
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
  targetInput.value = game.target_remaining;
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
    btn.addEventListener('click', async () => {
      await supabase.from('questions').delete().eq('id', btn.dataset.id);
      await loadQuestions();
    });
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* 초기 로드 */
loadQuestions();
refreshPlayers();
refreshGame();
