"use server";

import { getSupabaseServer } from "@/utils/supabaseServer";
import { getTodayJstYmd } from "@/utils/jstDate";

export type SubmitOpenReportResult =
  | { success: true }
  | { success: false; error: string };

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

    const { error: dbError } = await supabase.from("actual_business_hours").insert({
      store_id: formData.storeId,
      business_date: today,
      opened_at: openedAt,
      opened_by_staff_id: formData.staffId,
      open_delay_mark: false,
    });

    if (dbError) {
      return { success: false, error: `データの保存に失敗しました: ${dbError.message}` };
    }

    const gasUrl = process.env.GAS_WEBHOOK_URL;
    if (!gasUrl || !String(gasUrl).trim()) {
      return {
        success: false,
        error:
          "GASのWebhook URL（GAS_WEBHOOK_URL）が未設定のため通知を送れませんでした。店舗への記録は保存済みです。",
      };
    }

    const gasResponse = await fetch(gasUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({
        storeId: formData.storeId,
        reporter: formData.staffName,
        image: formData.imageBase64,
      }),
    });

    if (!gasResponse.ok) {
      return {
        success: false,
        error: `通知の送信に失敗しました（HTTP ${gasResponse.status}）`,
      };
    }

    return { success: true };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "送信処理でエラーが発生しました";
    console.error("submitOpenReport:", e);
    return { success: false, error: message };
  }
}
