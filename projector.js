import { supabase } from './supabase-config.js';

/* 프로젝터 화면: QR + 통계 + 남은 인원 명단 (읽기 전용) */

let players = {}; // id -> {id, name, alive, answer, result}
let game = { status: 'waiting', current_number: 0, question_order: [] };

const $ = (id) => document.getElementById(id);
const statusBadge = $('statusBadge');
const statusText = $('statusText');

const statPlayers = $('statPlayers');
const statQuestion = $('statQuestion');
const statCorrect = $('statCorrect');
const statEliminated = $('statEliminated');
const statAlive = $('statAlive');

const aliveChips = $('aliveChips');
const aliveEmpty = $('aliveEmpty');
const refreshNamesBtn = $('refreshNamesBtn');

async function refreshPlayers() {
  const { data } = await supabase.from('players').select('*');
  players = {};
  (data || []).forEach((p) => { players[p.id] = p; });
  render();
}

async function refreshGame() {
  const { data } = await supabase.from('game').select('*').eq('id', 1).maybeSingle();
  const v = data || {};
  game = {
    status: v.status || 'waiting',
    current_number: v.current_number || 0,
    question_order: v.question_order || [],
  };
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

/* 명단 새로고침 버튼 */
refreshNamesBtn.addEventListener('click', async () => {
  refreshNamesBtn.textContent = '🔄 새로고침 중...';
  await refreshPlayers();
  setTimeout(() => { refreshNamesBtn.textContent = '🔄 새로고침'; }, 500);
});

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
refreshPlayers();
refreshGame();

/* 폴링 안전장치 */
setInterval(refreshPlayers, 2500);
setInterval(refreshGame, 2500);
