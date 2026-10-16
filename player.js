import { supabase } from './supabase-config.js';

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

let myId = localStorage.getItem('pid');
let me = null;        // 내 플레이어 행
let game = { status: 'waiting' };
let current = null;   // game.current (정답 없음)

let renderedQid = null;
let answered = false;
let correctHandled = false;
let wrongHandled = false;

function show(active) {
  Object.entries(screens).forEach(([key, el]) => {
    el.hidden = key !== active;
  });
}

/* ---------- 실시간 구독 ---------- */
supabase
  .channel('player-game')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'game' }, () => { refreshGame(); })
  .subscribe();

let meChannel = null;
function subscribeMe() {
  if (meChannel) { supabase.removeChannel(meChannel); meChannel = null; }
  if (!myId) return;
  meChannel = supabase
    .channel('me-' + myId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: 'id=eq.' + myId }, () => { refreshMe(); })
    .subscribe();
}

async function refreshGame() {
  const { data } = await supabase.from('game').select('status, current').eq('id', 1).maybeSingle();
  if (data) {
    game.status = data.status || 'waiting';
    current = data.current || null;
  }
  render();
}

async function refreshMe() {
  if (!myId) return;
  const { data } = await supabase.from('players').select('*').eq('id', myId).maybeSingle();
  me = data || null;
  if (!me) {
    localStorage.removeItem('pid');
    myId = null;
    renderedQid = null;
    show('name');
    return;
  }
  render();
}

/* ---------- 이름 입력 ---------- */
function generateId() {
  if (window.crypto && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // 구형 브라우저 대비 UUID 생성
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

joinBtn.addEventListener('click', async () => {
  const name = nameInput.value.trim();
  if (!name) {
    joinError.textContent = '이름을 입력해주세요.';
    return;
  }
  joinError.textContent = '';
  joinBtn.disabled = true;

  try {
    const id = generateId();
    const { error } = await supabase.from('players').insert({
      id, name, alive: true, answer: null, result: null, correct_answer: null,
    });

    if (error) throw error;

    localStorage.setItem('pid', id);
    myId = id;
    subscribeMe();      // 내 행 실시간 구독 재설정
    await refreshMe();  // 대기 화면으로 전환
    joinBtn.disabled = false;
  } catch (err) {
    console.error(err);
    joinError.textContent = '참가에 실패했습니다. 잠시 후 다시 시도해주세요.';
    joinBtn.disabled = false;
  }
});

nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinBtn.click();
});

/* ---------- 렌더링 ---------- */
function render() {
  if (!me) { show('name'); return; }
  if (game.status === 'waiting') { waitName.textContent = me.name; show('waiting'); return; }
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
    resultSub.textContent = `정답은 ${me.correct_answer} 입니다`;
    lostAnswer.textContent = me.correct_answer;
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
    btn.addEventListener('click', async () => {
      if (answered || me.answer != null) return;
      answered = true;
      disableOptions();
      await supabase.from('players').update({ answer: i }).eq('id', myId);
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

/* 초기 로드 */
if (myId) {
  subscribeMe();
  refreshMe();
}
refreshGame();
show('name');

/* 폴링 안전장치: 실시간 구독이 동작하지 않아도 일정 간격으로 갱신 */
setInterval(refreshGame, 2500);
setInterval(() => { if (myId) refreshMe(); }, 2500);
