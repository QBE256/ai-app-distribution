"use strict";
const weatherStatus = get("status");
const get = (id) => document.getElementById(id);
const city = get("city");
const status = get("status");
const speak = get("speak");
const stop = get("stop");
const speechStatus = get("speech-status");
const synthesis = window.speechSynthesis;
const speechAvailable = Boolean(synthesis && window.SpeechSynthesisUtterance);
let bundle = read("published-forecast");
let entry;
let audio;
let utterance;
let controller;
const canPlayAudio = () => Boolean(entry?.audio && navigator.onLine);
const canSpeak = () =>
  speechAvailable &&
  (navigator.onLine || synthesis.getVoices().some(({ lang, localService }) => /^ja\b/i.test(lang) && localService));

function read(key) {
  try {
    return JSON.parse(localStorage.getItem("weather-voice:" + key));
  } catch {
    return null;
  }
}

function save(key, value) {
  try {
    localStorage.setItem("weather-voice:" + key, JSON.stringify(value));
  } catch {
    // 保存領域が利用できなくても、取得した天気は表示する。
  }
}

function stopReading(message = "") {
  if (audio) {
    audio.pause();
    audio = undefined;
  }
  if (utterance) {
    utterance = undefined;
    synthesis.cancel();
  }
  stop.disabled = true;
  speechStatus.textContent = message;
  speechStatus.hidden = !message;
}

function render() {
  stopReading();
  entry = bundle?.regions[city.value];
  const previous = entry && bundle.date !== forecast.dateInTokyo();
  get("date").textContent = entry
    ? (previous ? "前回の予報" : "今日の天気") + "（" + bundle.date.replace(/-/g, "/") + "）"
    : "今日の天気";
  get("heading").textContent = forecast.weather(entry?.code) || (entry ? "天気不明" : "天気情報なし");
  for (const [field, unit] of [
    ["high", "℃"],
    ["low", "℃"],
    ["rain", "%"]
  ]) {
    get(field).textContent = Number.isFinite(entry?.[field]) ? entry[field] + unit : "—";
  }
  get("speech-text").textContent = entry?.script || "予報を取得すると読み上げ文が表示されます。";
  speak.textContent =
    entry && !canPlayAudio() && canSpeak() ? "端末の音声で天気予報を聞く" : "ずんだもんの天気予報を聞く";
  speak.disabled = !entry || (!canPlayAudio() && !canSpeak());
  const timestamp = get("timestamp");
  timestamp.hidden = !entry;
  timestamp.textContent = entry
    ? "更新日時：" + new Date(bundle.updatedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) + "（日本時間）"
    : "";
}

async function update() {
  controller?.abort();
  controller = new AbortController();
  const { signal } = controller;
  weatherStatus.textContent = "天気を取得しています。";
  try {
    const response = await fetch("./forecast.json", { cache: "no-store", signal });
    if (!response.ok) throw new Error("天気の取得に失敗");
    const data = await response.json();
    if (signal.aborted) return;
    if (!forecast.valid(data)) throw new Error("予報データが不足");
    bundle = data;
    save("published-forecast", data);
    render();
    weatherStatus.textContent = "";
  } catch {
    if (signal.aborted) return;
    weatherStatus.textContent =
      (navigator.onLine ? "天気を取得できませんでした。" : "オフラインです。") +
      (bundle ? "保存済みの天気を表示しています。" : "予報の公開後にもう一度お試しください。");
  }
}

speak.addEventListener("click", () => {
  stopReading("音声を準備しています。");
  stop.disabled = false;
  if (canPlayAudio()) {
    const next = new Audio(entry.audio);
    audio = next;
    next.onplaying = () => {
      if (audio === next) speechStatus.textContent = "再生中";
    };
    next.onended = () => {
      if (audio === next) stopReading();
    };
    const fail = () => {
      if (audio === next) stopReading("音声を再生できませんでした。");
    };
    next.onerror = fail;
    next.play().catch(fail);
    return;
  }
  const next = new SpeechSynthesisUtterance(entry.script);
  next.lang = "ja-JP";
  const voices = synthesis.getVoices();
  const voice =
    voices.find(({ lang, localService }) => /^ja\b/i.test(lang) && localService) ||
    (navigator.onLine && voices.find(({ lang }) => /^ja\b/i.test(lang)));
  if (voice) next.voice = voice;
  next.onend = next.onerror = (event) => {
    if (utterance === next) {
      utterance = undefined;
      stopReading(event.type === "error" ? "音声を再生できませんでした。" : "");
    }
  };
  utterance = next;
  speechStatus.textContent = "再生中";
  synthesis.speak(next);
});
stop.addEventListener("click", () => stopReading());

if (!forecast.valid(bundle)) bundle = null;
for (const [id, [label]] of Object.entries(forecast.regions)) city.add(new Option(label, id));
const savedCity = read("city");
city.value = Object.hasOwn(forecast.regions, savedCity) ? savedCity : "tokyo";
city.addEventListener("change", () => {
  save("city", city.value);
  render();
});
get("location").addEventListener("submit", (event) => {
  event.preventDefault();
  update();
});
for (const event of ["online", "offline"]) {
  window.addEventListener(event, () => {
    render();
    update();
  });
}
synthesis?.addEventListener("voiceschanged", () => {
  if (!navigator.onLine && !utterance) render();
});
window.addEventListener("pageshow", render);
if ("serviceWorker" in navigator) {
  const serviceWorker = navigator.serviceWorker;
  let currentSWController = serviceWorker.controller;
  let reloading = false;

  serviceWorker.addEventListener("controllerchange", () => {
    const nextController = serviceWorker.controller;

    if (!nextController || nextController === currentSWController || reloading) return;

    const isUpdate = Boolean(currentSWController);
    currentSWController = nextController;

    if (isUpdate) {
      reloading = true;
      window.location.reload();
    }
  });

  serviceWorker
    .register("./service-worker.js", {
      updateViaCache: "none"
    })
    .catch(() => {});
}
render();
update();
