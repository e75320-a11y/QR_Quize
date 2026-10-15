const socket = io();

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

const aliveChips = $('aliveChips');
const aliveEmpty = $('aliveEmpty');

const qText = $('qText');
const optInputs = ['opt0', 'opt1', 'opt2', 'opt3'].map((id) => $(id));
const answerSelect = $('answerSelect');
const addQuestionBtn = $('addQuestionBtn');
const questionList = $('questionList');

/* QR 로드 */
async function loadQR() {
  try {
    const res = await fetch('/api/qr');
    const data = await res.json();
    qrImage.src = data.dataUrl;
    qrUrl.value = data.url;
  } catch (e) {
    console.error(e);
  }
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

/* 설정 */
function setTarget(v) {
  targetInput.value = v;
  socket.emit('admin:setTarget', v);
}
targetMinus.addEventListener('click', () => setTarget(Math.max(1, Number(targetInput.value) - 1)));
targetPlus.addEventListener('click', () => setTarget(Number(targetInput.value) + 1));
targetInput.addEventListener('change', () => setTarget(Math.max(1, Number(targetInput.value))));
shuffleToggle.addEventListener('change', () => socket.emit('admin:toggleShuffle'));

/* 게임 컨트롤 */
startBtn.addEventListener('click', () => socket.emit('admin:start'));
nextBtn.addEventListener('click', () => socket.emit('admin:next'));
resetBtn.addEventListener('click', () => socket.emit('admin:reset'));
finishBtn.addEventListener('click', () => socket.emit('admin:finish'));

/* 문제 관리 */
function updateAnswerSelect() {
  const vals = optInputs.map((i) => i.value.trim());
  const options = answerSelect.options;
  for (let i = 0; i < optInputs.length; i++) {
    const label = vals[i] ? `정답: ${vals[i]}` : `정답: 보기 ${i + 1}`;
    options[i].textContent = label;
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

  socket.emit('admin:addQuestion', { question, options, answer }, (res) => {
    if (res && res.ok) {
      qText.value = '';
      optInputs.forEach((i) => (i.value = ''));
      answerSelect.value = '0';
      updateAnswerSelect();
    } else if (res) {
      alert(res.message);
    }
  });
});

/* 상태 렌더링 */
function render(state) {
  // 상태 배지
  statusBadge.className = 'badge ' + state.status;
  const statusMap = { waiting: '대기 중', playing: '게임 진행 중', finished: '게임 종료' };
  statusText.textContent = statusMap[state.status] || state.status;

  // 통계
  statPlayers.textContent = state.playerCount;
  statQuestion.textContent = state.status === 'waiting' ? '-' : `${state.currentQuestion} / ${state.totalQuestions}`;
  statEliminated.textContent = state.eliminatedCount;
  statAlive.textContent = state.aliveCount;

  // 남은 인원 명단
  aliveChips.innerHTML = '';
  if (state.aliveNames.length === 0) {
    aliveEmpty.style.display = 'block';
  } else {
    aliveEmpty.style.display = 'none';
    state.aliveNames.forEach((name) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = `<span class="avatar">${escapeHtml(name[0] || '?')}</span>${escapeHtml(name)}`;
      aliveChips.appendChild(chip);
    });
  }

  // 컨트롤 버튼
  const playing = state.status === 'playing';
  const waiting = state.status === 'waiting';
  startBtn.disabled = !waiting || state.playerCount === 0 || state.questions.length === 0;
  nextBtn.disabled = !playing;
  finishBtn.disabled = !playing;
  resetBtn.disabled = false;

  // 문제 목록
  questionList.innerHTML = '';
  state.questions.forEach((q, i) => {
    const item = document.createElement('div');
    item.className = 'q-item';
    item.innerHTML = `
      <span class="qnum">${i + 1}</span>
      <div class="qtext">
        ${escapeHtml(q.question)}
        <div class="ans">✔ 정답: ${escapeHtml(q.options[q.answer] || '')}</div>
      </div>
      <button class="del" data-idx="${i}" title="삭제">🗑</button>
    `;
    questionList.appendChild(item);
  });
  questionList.querySelectorAll('.del').forEach((btn) => {
    btn.addEventListener('click', () => socket.emit('admin:deleteQuestion', btn.dataset.idx));
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* 소켓 */
socket.on('connect', () => socket.emit('admin:join'));
socket.on('state', (state) => {
  targetInput.value = state.targetRemaining;
  shuffleToggle.checked = state.shuffle;
  render(state);
});
