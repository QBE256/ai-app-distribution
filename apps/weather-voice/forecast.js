'use strict';

const forecast = (() => {
  const regions = {
    tokyo: ['東京都（東京周辺）', 35.6762, 139.6503],
    kanagawa: ['神奈川県（横浜周辺）', 35.4437, 139.6380],
    ibaraki: ['茨城県（水戸周辺）', 36.3659, 140.4712],
    chiba: ['千葉県（千葉周辺）', 35.6073, 140.1063],
    saitama: ['埼玉県（さいたま周辺）', 35.8617, 139.6455]
  };
  const dailyFields = ['weather_code', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_probability_max'];
  const hourlyFields = ['weather_code', 'precipitation_probability', 'wind_speed_10m'];
  const periods = [['朝', 6, 12], ['昼', 12, 16], ['夕方', 16, 19], ['夜', 19, 24]];
  const groups = [
    [[0], '晴れ'], [[1, 2], '雲のある晴れ'], [[3], '曇り'],
    [[45, 48], '霧'], [[51, 53, 55, 56, 57], '霧雨'],
    [[61, 63, 65, 66, 67], '雨'], [[71, 73, 75, 77], '雪'],
    [[80, 81, 82], 'にわか雨'], [[85, 86], 'にわか雪'], [[95, 96, 99], '雷雨']
  ];
  const weather = (code) => groups.find(([codes]) => codes.includes(code))?.[1];
  const dateInTokyo = (date = new Date()) => new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date);
  const maximum = (values) => values.some(Number.isFinite) ? Math.max(...values.filter(Number.isFinite)) : null;

  function summarize({ daily, hourly }, date, region) {
    const dayIndex = daily?.time?.indexOf(date);
    if (!(dayIndex >= 0)) throw new Error('対象日の予報がありません');
    const [code, high, low, rain] = dailyFields.map((field) => daily[field]?.[dayIndex] ?? null);
    const hours = (hourly?.time || []).flatMap((time, index) => time.startsWith(date + 'T') ? [{
      hour: Number(time.slice(11, 13)),
      code: hourly.weather_code?.[index] ?? null,
      rain: hourly.precipitation_probability?.[index] ?? null,
      wind: hourly.wind_speed_10m?.[index] ?? null
    }] : []);
    if (![code, high, low, rain].some(Number.isFinite) &&
        !hours.some(({ code, rain, wind }) => [code, rain, wind].some(Number.isFinite))) {
      throw new Error('予報値がありません');
    }
    const [, month, day] = date.split('-').map(Number);
    const script = [month + '月' + day + '日、' + region.replace('（', '、').replace('）', '') + 'の天気をお伝えします。',
      weather(code) ? '一日の予報は' + weather(code) + 'です。' : '一日の天気の概要は未発表です。'];
    const rainyPeriods = [];
    for (const [label, start, end] of periods) {
      const entries = hours.filter(({ hour }) => hour >= start && hour < end);
      const conditions = [...new Set(entries.map(({ code }) => weather(code)).filter(Boolean))];
      script.push(conditions.length ? label + 'は' + conditions.join('や') + 'の予報です。' : label + 'の天気はデータがありません。');
      if (maximum(entries.map(({ rain }) => rain)) >= 50) rainyPeriods.push(label);
    }
    for (const [label, value] of [['最高気温', high], ['最低気温', low]]) {
      script.push(label + 'は' + (Number.isFinite(value) ? value + '度です。' : 'データがありません。'));
    }
    if (rainyPeriods.length) script.push(rainyPeriods.join('と') + 'は雨に備えて、傘があると安心です。');
    else if (rain >= 50) script.push('雨に備えて傘があると安心です。外出前に最新の予報を確認してください。');
    else if (Number.isFinite(rain)) script.push('一日の最大降水確率は' + rain + 'パーセントです。');
    else script.push('降水確率はデータがありません。');
    if (maximum(hours.map(({ wind }) => wind)) >= 36) script.push('風が強まる時間があります。外出時は飛ばされやすい持ち物に気をつけてください。');
    if (Number.isFinite(low) && low <= 12) script.push('冷え込む時間に備えて、上着があると安心です。');
    else if (Number.isFinite(high) && high >= 28) script.push('暑い時間は、こまめに水分をとりましょう。');
    return { code, high, low, rain, hours, script: script.join('') };
  }

  function valid(bundle) {
    return /^\d{4}-\d{2}-\d{2}$/.test(bundle?.date) && Number.isFinite(Date.parse(bundle.updatedAt)) &&
      Object.keys(regions).every((id) => {
        const entry = bundle.regions?.[id];
        return typeof entry?.script === 'string' && entry.script.trim() &&
          (entry.audio == null || new RegExp('^audio/' + id + '-[a-f0-9]{64}\\.mp3$').test(entry.audio));
      });
  }

  return { regions, dailyFields, hourlyFields, weather, dateInTokyo, summarize, valid };
})();

if (typeof module !== 'undefined') module.exports = forecast;
