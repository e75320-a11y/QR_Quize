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
  time_limit: 30,
  question_started_at: null,
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

const timeLimitInput = $('timeLimitInput');
const timeMinus = $('timeMinus');
const timePlus = $('timePlus');

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
    time_limit: v.time_limit || 30,
    question_started_at: v.question_started_at || null,
  };
  current = v.current || null;
  render();
}

/* 실시간 구독 */
supabase
  .channel('ctrl-players')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => { refreshPlayers(); })
  .subscribe();

supabase
  .channel('ctrl-game')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'game' }, () => { refreshGame(); })
  .subscribe();

/* ---------- 정답 검사 (관리자 화면이 수행) ---------- */
let checking = false;
async function checkAnswers() {
  if (checking) return;
  if (game.status !== 'playing' || !current) return;
  const q = questions.find((x) => x.id === current.qid);
  if (!q) return;

  const aliveArr = Object.values(players).filter((p) => p.alive);
  if (aliveArr.length === 0) return;

  // 시간 초과 여부
  const timeLimit = game.time_limit || 30;
  const timedOut = game.question_started_at
    ? (Date.now() - new Date(game.question_started_at).getTime()) >= timeLimit * 1000
    : false;

  // 모든 응답 또는 시간 초과 시 판정
  const allAnswered = aliveArr.every((p) => p.answer != null);
  if (!allAnswered && !timedOut) return;

  checking = true;
  try {
    let changed = false;
    for (const p of aliveArr) {
      if (p.result != null) continue; // 이미 판정된 경우 건너뜀
      if (p.answer == null) {
        // 시간 초과로 미응답 → 탈락
        const upd = { result: 'timeout', alive: false, correct_answer: q.options[q.answer] };
        await supabase.from('players').update(upd).eq('id', p.id);
        Object.assign(p, upd);
        changed = true;
      } else {
        const correct = Number(p.answer) === Number(q.answer);
        const upd = { result: correct ? 'correct' : 'wrong' };
        if (!correct) {
          upd.alive = false;
          upd.correct_answer = q.options[q.answer];
        }
        await supabase.from('players').update(upd).eq('id', p.id);
        Object.assign(p, upd);
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
  if (alive.length <= game.target_remaining) {
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

  // 모든 플레이어 초기화 (단일 쿼리)
  await supabase.from('players').update({
    alive: true, answer: null, result: null, correct_answer: null,
  }).neq('id', '00000000-0000-0000-0000-000000000000');

  // 로컬 즉시 초기화
  for (const p of Object.values(players)) {
    p.alive = true;
    p.answer = null;
    p.result = null;
    p.correct_answer = null;
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

  // 새 문제로 넘어갈 때 살아있는 플레이어의 응답/결과 초기화 (단일 쿼리)
  await supabase.from('players').update({
    answer: null, result: null, correct_answer: null,
  }).eq('alive', true);

  // 로컬 즉시 초기화 (실시간/폴링 대기 없이 화면 갱신)
  for (const p of Object.values(players)) {
    if (p.alive) {
      p.answer = null;
      p.result = null;
      p.correct_answer = null;
    }
  }

  const cur = { number: num, total: game.question_order.length, question: q.question, options: q.options, qid };
  const startedAt = new Date().toISOString();
  await supabase.from('game').update({ current_number: num, current: cur, question_started_at: startedAt }).eq('id', 1);
  game.current_number = num;
  current = cur;
  game.question_started_at = startedAt;
  render();
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
async function setTarget(v) {
  v = Math.max(1, v);
  game.target_remaining = v; // 로컬 즉시 반영 (render가 되돌리는 것 방지)
  targetInput.value = v;
  await supabase.from('game').update({ target_remaining: v }).eq('id', 1);
}
targetMinus.addEventListener('click', () => setTarget(Number(targetInput.value) - 1));
targetPlus.addEventListener('click', () => setTarget(Number(targetInput.value) + 1));
targetInput.addEventListener('change', () => setTarget(Number(targetInput.value)));
shuffleToggle.addEventListener('change', async () => {
  game.shuffle = shuffleToggle.checked; // 로컬 즉시 반영
  await supabase.from('game').update({ shuffle: shuffleToggle.checked }).eq('id', 1);
});

async function setTimeLimit(v) {
  v = Math.max(5, Math.min(600, v));
  game.time_limit = v; // 로컬 즉시 반영
  timeLimitInput.value = v;
  await supabase.from('game').update({ time_limit: v }).eq('id', 1);
}
timeMinus.addEventListener('click', () => setTimeLimit(Number(timeLimitInput.value) - 5));
timePlus.addEventListener('click', () => setTimeLimit(Number(timeLimitInput.value) + 5));
timeLimitInput.addEventListener('change', () => setTimeLimit(Number(timeLimitInput.value)));

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
  const answeredTotal = arr.filter((p) => p.alive && p.answer != null).length;

  statPlayers.textContent = playerCount;
  statQuestion.textContent = game.status === 'waiting' ? '-' : `${game.current_number} / ${game.question_order.length}`;
  statCorrect.textContent = correctCount;
  statEliminated.textContent = playerCount - aliveCount;
  statAlive.textContent = aliveCount;

  // 현재 출제 중인 문제 (관리자만 보는 정답 포함)
  if (game.status === 'playing' && current) {
    liveQuestionCard.hidden = false;
    liveQuestionText.textContent = `Q${current.number}. ${current.question}`;
    const q = questions.find((x) => x.id === current.qid);
    liveAnswerText.textContent = q ? q.options[q.answer] : '-';
    answeredCount.textContent = `(정답 ${correctCount} · 응답 ${answeredTotal}/${aliveCount})`;
  } else {
    liveQuestionCard.hidden = true;
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
  timeLimitInput.value = game.time_limit;

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

/* 폴링 안전장치 */
setInterval(refreshPlayers, 2500);
setInterval(refreshGame, 2500);
setInterval(loadQuestions, 10000);
