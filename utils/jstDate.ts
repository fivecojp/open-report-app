/**
 * 日本（JST）基準の「今日」を YYYY-MM-DD で返す
 */
export function getTodayJstYmd(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
}
