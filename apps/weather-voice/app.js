'use strict';

const cities = {
  tokyo: [35.6762, 139.6503],
  osaka: [34.6937, 135.5023],
  yokohama: [35.4437, 139.6380]
};
const weatherGroups = [
  [[0], '晴れ'], [[1, 2], '晴れ時々曇り'], [[3], '曇り'],
  [[45, 48], '霧'], [[51, 53, 55, 56, 57], '霧雨'],
  [[61, 63, 65, 66, 67], '雨'], [[71, 73, 75, 77], '雪'],
  [[80, 81, 82], 'にわか雨'], [[85, 86], 'にわか雪'],
  [[95, 96, 99], '雷雨']
];
const fields = ['weather_code', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_probability_max'];
const get = (id) => document.getElementById(id);
const city = get('city');
const status = get('status');
const speak = get('speak');
const stop = get('stop');
const speechStatus = get('speech-status');
const synthesis = window.speechSynthesis;
const speechAvailable = Boolean(synthesis && window.SpeechSynthesisUtterance);
let reading = '';
let utterance;
let requestId = 0;
let controller;

function read(key) {
  try {
    return JSON.parse(localStorage.getItem('weather-voice:' + key));
  } catch {
    return null;
  }
}

function save(key, value) {
  try {
    localStorage.setItem('weather-voice:' + key, JSON.stringify(value));
  } catch {
    // 保存領域が利用できなくても、取得した天気は表示する。
  }
}

function stopReading() {
  if (utterance) {
    utterance = undefined;
    synthesis.cancel();
  }
  stop.disabled = true;
}

function render(data, cached = false) {
  stopReading();
  const weather = data && weatherGroups.find(([codes]) => codes.includes(data.code))?.[1];
  const day = data ? data.date.replace(/-/g, '/') + ' の天気' : '今日の天気';
  get('date').textContent = day;
  get('heading').textContent = weather || (data ? '天気不明' : '天気情報なし');

  const parts = [];
  if (weather) parts.push((cached ? day : '今日の天気') + 'は' + weather + '。');
  for (const [id, label, unit, spokenUnit] of [
    ['high', '最高気温', '℃', '度'],
    ['low', '最低気温', '℃', '度'],
    ['rain', '降水確率', '%', 'パーセント']
  ]) {
    const value = data?.[id];
    get(id).textContent = Number.isFinite(value) ? value + unit : '—';
    if (Number.isFinite(value)) parts.push(label + 'は' + value + spokenUnit + '。');
  }
  reading = parts.length ? (cached ? '保存済みの天気です。' : '') + parts.join('') : '';
  get('speech-text').textContent = reading || '読み上げられる天気情報がありません。';
  speak.disabled = !speechAvailable || !reading;
  const timestamp = get('timestamp');
  timestamp.hidden = !data;
  timestamp.textContent = data ? '取得日時：' + new Date(data.fetchedAt).toLocaleString('ja-JP') : '';
}

function coordinates(selection) {
  if (selection !== 'current') return cities[selection];
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('位置情報を利用できません'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve([coords.latitude, coords.longitude]), reject, { timeout: 10000 }
    );
  });
}

async function update() {
  const id = ++requestId;
  controller?.abort();
  controller = new AbortController();
  const { signal } = controller;
  const selection = city.value;
  const cached = read('forecast:' + selection);
  render(cached, true);
  const cacheMessage = cached ? ' 保存済みの天気を表示しています。' : '';
  if (!navigator.onLine) {
    status.textContent = 'オフラインのため天気を取得できません。' + cacheMessage;
    return;
  }

  status.textContent = (selection === 'current' ? '現在地を確認しています。' : '天気を取得しています。') + cacheMessage;
  let point;
  try {
    point = await coordinates(selection);
  } catch {
    if (id === requestId) status.textContent = '位置情報を取得できません。地点から都市を選んでください。' + cacheMessage;
    return;
  }
  if (id !== requestId) return;
  status.textContent = '天気を取得しています。' + cacheMessage;
  try {
    const params = new URLSearchParams({
      latitude: point[0], longitude: point[1], daily: fields.join(','),
      timezone: 'auto', forecast_days: '1'
    });
    const response = await fetch('https://api.open-meteo.com/v1/forecast?' + params, { signal });
    if (!response.ok) throw new Error('Forecast request failed');
    const { daily } = await response.json();
    if (id !== requestId) return;
    const [code, high, low, rain] = fields.map((field) => daily?.[field]?.[0]);
    const date = daily?.time?.[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || ![code, high, low, rain].some(Number.isFinite)) {
      status.textContent = '天気データが不足しています。' + cacheMessage;
      return;
    }
    const data = { date, code, high, low, rain, fetchedAt: Date.now() };
    save('forecast:' + selection, data);
    render(data);
    status.textContent = weatherGroups.some(([codes]) => codes.includes(code)) &&
      [high, low, rain].every(Number.isFinite) ? '' : '一部の天気データが不足しています。';
  } catch {
    if (id === requestId) status.textContent = '天気を取得できませんでした。通信を確認して再度お試しください。' + cacheMessage;
  }
}

if (!speechAvailable) {
  speechStatus.hidden = false;
  speechStatus.textContent = 'この環境では音声読み上げを利用できません。';
}
speak.addEventListener('click', () => {
  stopReading();
  speechStatus.hidden = true;
  const next = new SpeechSynthesisUtterance(reading);
  next.lang = 'ja-JP';
  const voice = synthesis.getVoices().find(({ lang, localService }) => /^ja\b/i.test(lang) && localService)
    || synthesis.getVoices().find(({ lang }) => /^ja\b/i.test(lang));
  if (voice) next.voice = voice;
  next.onend = next.onerror = (event) => {
    if (utterance !== next) return;
    utterance = undefined;
    stop.disabled = true;
    if (event.type === 'error') {
      speechStatus.hidden = false;
      speechStatus.textContent = '音声を再生できませんでした。';
    }
  };
  utterance = next;
  stop.disabled = false;
  synthesis.speak(next);
});
stop.addEventListener('click', stopReading);

const savedCity = read('city');
if (Object.hasOwn(cities, savedCity)) city.value = savedCity;
city.addEventListener('change', () => {
  save('city', city.value);
  update();
});
get('location').addEventListener('submit', (event) => {
  event.preventDefault();
  update();
});
window.addEventListener('offline', update);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(() => {});
update();
