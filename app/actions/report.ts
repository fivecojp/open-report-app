"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/utils/supabaseServer";
import { getTodayJstYmd } from "@/utils/jstDate";
import { resolveStoreBusinessHoursWeekdayType } from "@/utils/storeBusinessWeekdayType";

export type SubmitOpenReportResult =
  | { success: true }
  | { success: false; error: string };

/** Supabase の store_id (UUID) → スプレッドシート用店舗ID。GAS POST の `storeId` のみに使用。 */
const STORE_ID_MAP: Readonly<Record<string, string>> = {
  "20322c74-6172-4cfc-ba2a-a514e7fefc67": "101",
  "73d29ce5-345e-44af-a040-d0135eb11977": "104",
  "92f17aa3-936a-4384-8ee8-18685a025903": "103",
  "d440eab1-2357-4876-b113-5ec10a4466f3": "105",
  "d5aecc39-1976-413d-9c72-6b9f376c2361": "102",
  "f5d4b199-3e2a-4aa6-b555-9cc5dd1ae3e5": "106",
} as const;

const GAS_REQUEST_TIMEOUT_MS = 120_000;

function toGasStoreId(uuid: string): string {
  const key = uuid.trim().toLowerCase();
  return STORE_ID_MAP[key] ?? uuid;
}

type DelayResult = { open_delay_mark: boolean; delay_minutes: number };

function computeDelayJst(
  now: Date,
  businessDateYmd: string,
  openTimeRaw: string | null | undefined,
): DelayResult {
  if (openTimeRaw == null || !String(openTimeRaw).trim()) {
    return { open_delay_mark: false, delay_minutes: 0 };
  }
  const parts = String(openTimeRaw).trim().split(":");
  const hh = parseInt(parts[0] || "0", 10) || 0;
  const mm = parseInt(parts[1] || "0", 10) || 0;
  const ss = parseInt(parts[2] || "0", 10) || 0;
  if (hh > 24 || (hh === 24 && (mm > 0 || ss > 0))) {
    return { open_delay_mark: false, delay_minutes: 0 };
  }
  const scheduled = new Date(
    `${businessDateYmd}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}+09:00`,
  );
  const diffMs = now.getTime() - scheduled.getTime();
  if (diffMs <= 0) {
    return { open_delay_mark: false, delay_minutes: 0 };
  }
  const minutes = Math.floor(diffMs / 60_000);
  return {
    open_delay_mark: minutes > 0,
    delay_minutes: minutes,
  };
}

async function updateActualBusinessHoursRow(
  supabase: SupabaseClient,
  businessHoursId: string,
  payload: {
    open_delay_mark: boolean;
    delay_minutes: number;
    image_url: string | null;
  },
): Promise<{ error: string | null }> {
  const { error: updateError } = await supabase
    .from("actual_business_hours")
    .update({
      open_delay_mark: payload.open_delay_mark,
      delay_minutes: payload.delay_minutes,
      image_url: payload.image_url,
    })
    .eq("business_hours_id", businessHoursId);

  if (updateError) {
    console.error("UPDATEエラー:", updateError);
    return { error: updateError.message };
  }
  console.log("UPDATE成功", { business_hours_id: businessHoursId });
  return { error: null };
}

/**
 * オープン報告: store_business_hours を参照して遅延を算出
 * ① actual_business_hours INSERT → ② GAS（fetch）→ ③ 遅延・画像URL を UPDATE（business_hours_id で特定）
 */
export async function submitOpenReport(formData: {
  storeId: string;
  staffId: string;
  staffName: string;
  imageBase64: string;
}): Promise<SubmitOpenReportResult> {
  try {
    const supabase = getSupabaseServer();
    const now = new Date();
    const today = getTodayJstYmd();
    const openedAt = now.toISOString();

    const resolvedWeekday = await resolveStoreBusinessHoursWeekdayType(
      supabase,
      formData.storeId,
    );
    if (resolvedWeekday.error) {
      return {
        success: false,
        error: `休日情報の取得に失敗しました: ${resolvedWeekday.error}`,
      };
    }
    const weekdayType = resolvedWeekday.weekdayType;

    const { data: hoursRow, error: hoursError } = await supabase
      .from("store_business_hours")
      .select("open_time")
      .eq("store_id", formData.storeId)
      .eq("weekday_type", weekdayType)
      .limit(1)
      .maybeSingle();

    if (hoursError) {
      return { success: false, error: `営業予定の取得に失敗しました: ${hoursError.message}` };
    }

    const delay = computeDelayJst(now, today, hoursRow?.open_time);
    const delayMinutes = delay.delay_minutes;
    const delayMark = delay.open_delay_mark;

    const insertRow = {
      store_id: formData.storeId,
      business_date: today,
      opened_at: openedAt,
      opened_by_staff_id: formData.staffId,
      open_delay_mark: false,
      delay_minutes: 0,
      image_url: null as string | null,
    };

    const { data: insertedData, error: insertError } = await supabase
      .from("actual_business_hours")
      .insert([insertRow])
      .select("business_hours_id")
      .single();

    if (insertError) {
      return {
        success: false,
        error: `データの保存に失敗しました: ${insertError.message}`,
      };
    }

    const businessHoursId = insertedData?.business_hours_id;
    if (businessHoursId == null || String(businessHoursId).trim() === "") {
      return {
        success: false,
        error: "挿入後に business_hours_id を取得できませんでした。テーブル定義を確認してください。",
      };
    }
    const pk = String(businessHoursId);

    const gasUrlRaw = process.env.GAS_WEBHOOK_URL;
    const gasUrl = typeof gasUrlRaw === "string" ? gasUrlRaw.trim() : "";
    if (!gasUrl) {
      const { error: upErr } = await updateActualBusinessHoursRow(supabase, pk, {
        open_delay_mark: delayMark,
        delay_minutes: delayMinutes,
        image_url: null,
      });
      if (upErr) {
        return { success: false, error: `GAS 未設定のため遅延情報の保存に失敗: ${upErr}` };
      }
      revalidatePath("/");
      return {
        success: false,
        error:
          "GASのWebhook URL（GAS_WEBHOOK_URL）が未設定のため通知を送れませんでした。遅延情報は保存済みです。",
      };
    }

    const body = JSON.stringify({
      storeId: toGasStoreId(formData.storeId),
      reporter: formData.staffName,
      image: formData.imageBase64,
    });

    let imageUrl: string | null = null;
    let gasFailed = false;
    let gasErrorDetail = "";

    try {
      const gasResponse = await fetch(gasUrl, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
        },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(GAS_REQUEST_TIMEOUT_MS),
      });

      const text = await gasResponse.text();
      console.log("GASレスポンスの生データ:", text);

      if (!gasResponse.ok) {
        gasFailed = true;
        const max = 200;
        const sn = text.length > max ? `${text.slice(0, max)}…` : text;
        gasErrorDetail = `GAS への通知に失敗しました（HTTP ${gasResponse.status} ${gasResponse.statusText}）${sn ? ` — ${sn}` : ""}`;
        imageUrl = null;
      } else {
        try {
          const gasResult = JSON.parse(text) as { status?: string; imageUrl?: string };
          const fromGas = gasResult.imageUrl;
          imageUrl = typeof fromGas === "string" && fromGas.trim() !== "" ? fromGas.trim() : null;
          if (gasResult.status && gasResult.status !== "ok") {
            console.error("GAS status が ok 以外:", gasResult.status);
          }
        } catch (parseErr) {
          console.error("GAS レスポンスの JSON.parse 失敗:", parseErr);
          gasFailed = true;
          imageUrl = null;
          gasErrorDetail = "GASのレスポンスをJSONとして解析できませんでした";
        }
      }
    } catch (e) {
      gasFailed = true;
      imageUrl = null;
      if (e instanceof Error) {
        if (e.name === "TimeoutError" || e.name === "AbortError") {
          gasErrorDetail = "GAS への送信中にタイムアウトしました。画像が大きすぎる可能性があります。";
        } else {
          gasErrorDetail = e.message;
        }
        console.error("GAS fetch エラー:", e);
      } else {
        gasErrorDetail = "GAS への送信中にエラーが発生しました";
      }
    }

    const { error: upErr2 } = await updateActualBusinessHoursRow(supabase, pk, {
      open_delay_mark: delayMark,
      delay_minutes: delayMinutes,
      image_url: imageUrl,
    });
    if (upErr2) {
      return { success: false, error: `記録の更新に失敗しました: ${upErr2}` };
    }

    revalidatePath("/");
    if (gasFailed) {
      return { success: false, error: gasErrorDetail || "GAS への通知に失敗しました" };
    }
    return { success: true };
  } catch (e: unknown) {
    if (e instanceof Error) {
      if (e.name === "TimeoutError" || e.name === "AbortError") {
        return { success: false, error: "GAS への送信中にタイムアウトしました。画像が大きすぎる可能性があります。" };
      }
      console.error("submitOpenReport 予期せぬエラー:", e);
      return { success: false, error: e.message };
    }
    console.error("submitOpenReport 予期せぬエラー:", e);
    return { success: false, error: "送信処理でエラーが発生しました" };
  }
}
