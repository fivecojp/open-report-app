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

