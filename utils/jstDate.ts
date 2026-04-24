/**
 * 日本（JST）基準の「今日」を YYYY-MM-DD で返す
 */
export function getTodayJstYmd(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
}

const JST_TZ = "Asia/Tokyo";

/**
 * JST カレンダー日に対して n 日加算（負数で減算）し YYYY-MM-DD を返す
 */
export function addDaysJstYmd(ymd: string, days: number): string {
  const t = new Date(`${ymd}T12:00:00+09:00`).getTime() + days * 86_400_000;
  return new Date(t).toLocaleDateString("en-CA", { timeZone: JST_TZ });
}

/**
 * store_business_hours.weekday_type 用: 1=月曜 … 7=日曜
 * ※DB が 0=日〜6=土 なら report.ts 側のクエリ値を切り替えてください
 */
export function getJstWeekdayTypeMon1ThroughSun7(): number {
  const ymd = getTodayJstYmd();
  const d = new Date(`${ymd}T12:00:00+09:00`).getUTCDay();
  return d === 0 ? 7 : d;
}
