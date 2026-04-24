import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysJstYmd, getTodayJstYmd } from "@/utils/jstDate";

/** JST 当日の calendar 曜日 (0=日 … 6=土) → store_business_hours の mon … sun */
const JS_DOW_TO_WEEKDAY: readonly string[] = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
];

export function getJstBaseWeekdayTypeShort(): string {
  const ymd = getTodayJstYmd();
  const d = new Date(`${ymd}T12:00:00+09:00`).getUTCDay();
  return JS_DOW_TO_WEEKDAY[d] ?? "mon";
}

/**
 * `store_business_hours.weekday_type` に渡す値を解決する。
 * - `holidays` に本日 (JST) の `holiday_date` がある → `holiday`
 * - 翌日 (JST) が `holidays` の休日である（＝本日は休前日）→ `pre_holiday`
 * - 上記以外 → `mon` … `sun`（JST の曜日）
 */
export async function resolveStoreBusinessHoursWeekdayType(
  supabase: SupabaseClient,
  storeId: string,
): Promise<{ weekdayType: string; error: null } | { weekdayType: null; error: string }> {
  const today = getTodayJstYmd();

  const { data: rowsToday, error: errToday } = await supabase
    .from("holidays")
    .select("holiday_date")
    .eq("store_id", storeId)
    .eq("holiday_date", today)
    .limit(1);

  if (errToday) {
    return { weekdayType: null, error: errToday.message };
  }
  if (rowsToday && rowsToday.length > 0) {
    return { weekdayType: "holiday", error: null };
  }

  const tomorrowYmd = addDaysJstYmd(today, 1);
  const { data: rowsTomorrow, error: errTomorrow } = await supabase
    .from("holidays")
    .select("holiday_date")
    .eq("store_id", storeId)
    .eq("holiday_date", tomorrowYmd)
    .limit(1);

  if (errTomorrow) {
    return { weekdayType: null, error: errTomorrow.message };
  }
  if (rowsTomorrow && rowsTomorrow.length > 0) {
    return { weekdayType: "pre_holiday", error: null };
  }

  return { weekdayType: getJstBaseWeekdayTypeShort(), error: null };
}
