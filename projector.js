import { supabase } from './supabase-config.js';

/* 프로젝터 화면: QR + 통계 + 명단 + 게임 설정/컨트롤 (정답 검사도 수행) */

let questions = []; // {id, question, options, answer}
let players = {};   // id -> {id, name, alive, answer, result, correct_answer}
let game = {
  status: 'waiting',
  current_number: 0,
  question_order: [],
  target_remaining: 5,
  shuffle: true,
};
let current = null;

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

const aliveChips = $('aliveChips');
const aliveEmpty = $('aliveEmpty');
const refreshNamesBtn = $('refreshNamesBtn');

/* ---------- 데이터 로드 ---------- */
async function loadQuestions() {
  const { data, error } = await supabase.from('questions').select('*').order('id', { ascending: true });
  if (error) console.error(error);
  questions = data || [];
  render(); // 문제 로드 즉시 버튼 상태 갱신
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
  .channel('proj-players')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => { refreshPlayers(); })
  .subscribe();

supabase
  .channel('proj-game')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'game' }, () => { refreshGame(); })
  .subscribe();

supabase
  .channel('proj-questions')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'questions' }, () => { loadQuestions(); })
  .subscribe();

/* ---------- 정답 검사 ---------- */
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

/* 명단 새로고침 버튼 */
refreshNamesBtn.addEventListener('click', async () => {
  refreshNamesBtn.textContent = '🔄 새로고침 중...';
  await refreshPlayers();
  setTimeout(() => { refreshNamesBtn.textContent = '🔄 새로고침'; }, 500);
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

  statPlayers.textContent = playerCount;
  statQuestion.textContent = game.status === 'waiting' ? '-' : `${game.current_number} / ${game.question_order.length}`;
  statCorrect.textContent = correctCount;
  statEliminated.textContent = playerCount - aliveCount;
  statAlive.textContent = aliveCount;

  // 컨트롤 버튼
  const playing = game.status === 'playing';
  const waiting = game.status === 'waiting';
  startBtn.disabled = !waiting || playerCount === 0 || questions.length === 0;
  nextBtn.disabled = !playing;
  finishBtn.disabled = !playing;

  // 설정 반영
  targetInput.value = game.target_remaining;
  shuffleToggle.checked = game.shuffle;

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

      const del = document.createElement('button');
      del.className = 'chip-del';
      del.textContent = '✕';
      del.title = '삭제';
      del.addEventListener('click', async () => {
        if (confirm(`'${p.name}' 님을 삭제할까요?`)) {
          await supabase.from('players').delete().eq('id', p.id);
          await refreshPlayers();
        }
      });

      chip.appendChild(del);
      aliveChips.appendChild(chip);
    });
  }
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
