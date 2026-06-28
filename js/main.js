import { PHONEMES } from './phonemes.js';
import { addScore, getRecentAverage, getRecentScores, getSettings, saveSettings } from './store.js';
import { startPronunciationSession } from './azure.js';

let sortMode = 'category'; // 'category' | 'score'
let activeSymbol = null;
let activeSession = null;

const grid = document.getElementById('grid');
const sortCategoryBtn = document.getElementById('sortCategoryBtn');
const sortScoreBtn = document.getElementById('sortScoreBtn');
const practicePanel = document.getElementById('practicePanel');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const settingsForm = document.getElementById('settingsForm');
const settingsCloseBtn = document.getElementById('settingsCloseBtn');

function scoreColor(score) {
  if (score === null) return 'gray';
  if (score >= 80) return 'green';
  if (score >= 50) return 'yellow';
  return 'red';
}

function getSortedPhonemes() {
  const list = [...PHONEMES];
  if (sortMode === 'score') {
    list.sort((a, b) => {
      const sa = getRecentAverage(a.symbol);
      const sb = getRecentAverage(b.symbol);
      const va = sa === null ? -1 : sa;
      const vb = sb === null ? -1 : sb;
      return va - vb;
    });
  } else {
    list.sort((a, b) => (a.category === b.category ? 0 : a.category === 'vowel' ? -1 : 1));
  }
  return list;
}

function renderGrid() {
  grid.innerHTML = '';
  for (const p of getSortedPhonemes()) {
    const avg = getRecentAverage(p.symbol);
    const card = document.createElement('button');
    card.className = `phoneme-card ${scoreColor(avg)}`;
    card.innerHTML = `
      <div class="symbol">/${p.symbol}/</div>
      <div class="word">${p.word}</div>
      <div class="score">${avg === null ? '-' : avg + '点'}</div>
    `;
    card.addEventListener('click', () => openPractice(p.symbol));
    grid.appendChild(card);
  }
}

function openPractice(symbol) {
  activeSymbol = symbol;
  const p = PHONEMES.find((x) => x.symbol === symbol);
  practicePanel.classList.remove('hidden');
  practicePanel.innerHTML = `
    <div class="practice-header">
      <div class="symbol-large">/${p.symbol}/</div>
      <div class="word-large">${p.word}</div>
      <button id="closePracticeBtn" class="icon-btn">✕</button>
    </div>
    <p class="tip">${p.tip}</p>
    <div class="practice-actions">
      <button id="playSampleBtn">🔊 お手本を聞く</button>
      <button id="recordBtn">🎙️ 発音する</button>
    </div>
    <div id="resultArea" class="result-area"></div>
    <div class="history-area">
      <div class="history-label">過去5回のスコア</div>
      <div id="historyList" class="history-list"></div>
    </div>
  `;
  document.getElementById('closePracticeBtn').addEventListener('click', closePractice);
  document.getElementById('playSampleBtn').addEventListener('click', () => playSample(p.word));
  document.getElementById('recordBtn').addEventListener('click', () => toggleRecording(p.word));
  renderHistory(symbol);
}

function renderHistory(symbol) {
  const historyList = document.getElementById('historyList');
  if (!historyList) return;
  const scores = getRecentScores(symbol);
  if (scores.length === 0) {
    historyList.innerHTML = '<span class="history-empty">まだ記録がありません</span>';
    return;
  }
  historyList.innerHTML = scores
    .map((s) => `<span class="history-chip ${scoreColor(s)}">${s}</span>`)
    .join('');
}

function closePractice() {
  if (activeSession) {
    activeSession.stop();
    activeSession = null;
  }
  activeSymbol = null;
  practicePanel.classList.add('hidden');
  practicePanel.innerHTML = '';
}

function playSample(word) {
  const utter = new SpeechSynthesisUtterance(word);
  utter.lang = 'en-US';
  speechSynthesis.speak(utter);
}

function toggleRecording(word) {
  const settings = getSettings();
  if (!settings.key || !settings.region) {
    alert('先にAzureのAPIキーとリージョンを設定してください（右上の⚙️ボタン）');
    openSettings();
    return;
  }

  const recordBtn = document.getElementById('recordBtn');
  const resultArea = document.getElementById('resultArea');

  if (activeSession) {
    // 録音中 → ユーザーの操作で発音終了を確定させる
    recordBtn.disabled = true;
    recordBtn.classList.remove('recording');
    recordBtn.textContent = '🎙️ 判定中...';
    activeSession.stop();
    return;
  }

  resultArea.innerHTML = '';
  recordBtn.classList.add('recording');
  recordBtn.textContent = '⏹ ここまでで終了';

  activeSession = startPronunciationSession(word, settings.key, settings.region, {
    onResult: ({ score, recognizedText }) => {
      activeSession = null;
      addScore(activeSymbol, score);
      resultArea.innerHTML = `
        <div class="result-score ${scoreColor(score)}">${score}点</div>
        <div class="result-text">認識結果: ${recognizedText}</div>
      `;
      renderGrid();
      renderHistory(activeSymbol);
      recordBtn.disabled = false;
      recordBtn.textContent = '🎙️ 発音する';
    },
    onError: (err) => {
      activeSession = null;
      resultArea.innerHTML = `<div class="result-error">エラー: ${err.message}</div>`;
      recordBtn.disabled = false;
      recordBtn.textContent = '🎙️ 発音する';
    },
  });
}

function openSettings() {
  const settings = getSettings();
  document.getElementById('keyInput').value = settings.key || '';
  document.getElementById('regionInput').value = settings.region || '';
  settingsModal.classList.remove('hidden');
}

function closeSettings() {
  settingsModal.classList.add('hidden');
}

settingsBtn.addEventListener('click', openSettings);
settingsCloseBtn.addEventListener('click', closeSettings);
settingsForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const key = document.getElementById('keyInput').value.trim();
  const region = document.getElementById('regionInput').value.trim();
  saveSettings({ key, region });
  closeSettings();
});

sortCategoryBtn.addEventListener('click', () => {
  sortMode = 'category';
  sortCategoryBtn.classList.add('active');
  sortScoreBtn.classList.remove('active');
  renderGrid();
});

sortScoreBtn.addEventListener('click', () => {
  sortMode = 'score';
  sortScoreBtn.classList.add('active');
  sortCategoryBtn.classList.remove('active');
  renderGrid();
});

renderGrid();
if (!getSettings().key) openSettings();
