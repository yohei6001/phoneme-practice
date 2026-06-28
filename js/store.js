const SCORES_KEY = 'phoneme-scores';
const SETTINGS_KEY = 'azure-speech-settings';

function loadScores() {
  try { return JSON.parse(localStorage.getItem(SCORES_KEY)) || {}; }
  catch { return {}; }
}

function saveScores(data) {
  localStorage.setItem(SCORES_KEY, JSON.stringify(data));
}

export function addScore(symbol, score) {
  const data = loadScores();
  if (!data[symbol]) data[symbol] = [];
  data[symbol].push(score);
  saveScores(data);
}

// 直近5回の平均スコアを返す（記録がなければnull）
export function getRecentAverage(symbol, n = 5) {
  const data = loadScores();
  const list = data[symbol];
  if (!list || list.length === 0) return null;
  const recent = list.slice(-n);
  const sum = recent.reduce((a, b) => a + b, 0);
  return Math.round(sum / recent.length);
}

// 直近n回のスコア一覧を、新しい順で返す
export function getRecentScores(symbol, n = 5) {
  const data = loadScores();
  const list = data[symbol];
  if (!list || list.length === 0) return [];
  return list.slice(-n).reverse();
}

export function getSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; }
  catch { return {}; }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
