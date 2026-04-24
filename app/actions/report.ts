"use server";

import { getSupabaseServer } from "@/utils/supabaseServer";
import { getTodayJstYmd } from "@/utils/jstDate";

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

/**
 * オープン報告: Supabase へ保存 → GAS ウェブアプリへ通知
 *
 * GAS 側: POST ボディを text/plain として受け取り、JSON 文字列（{ storeId, reporter, image }）を解釈する想定
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

    const gasUrlRaw = process.env.GAS_WEBHOOK_URL;
    const gasUrl = typeof gasUrlRaw === "string" ? gasUrlRaw.trim() : "";
    if (!gasUrl) {
      return {
        success: false,
        error:
          "GASのWebhook URL（GAS_WEBHOOK_URL）が未設定のため通知を送れませんでした。店舗への記録は保存済みです。",
      };
    }

    // GAS 連携: storeId はスプレッドシート用に変換。未登録UUIDはそのまま送る
    const body = JSON.stringify({
      storeId: toGasStoreId(formData.storeId),
      reporter: formData.staffName,
      image: formData.imageBase64,
    });

    const gasResponse = await fetch(gasUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(GAS_REQUEST_TIMEOUT_MS),
    });

    if (!gasResponse.ok) {
      const snippet = await readResponseSnippet(gasResponse);
      return {
        success: false,
        error: `GAS への通知に失敗しました（HTTP ${gasResponse.status} ${gasResponse.statusText}）${snippet}`,
      };
    }

    return { success: true };
  } catch (e: unknown) {
    if (e instanceof Error) {
      if (e.name === "TimeoutError" || e.name === "AbortError") {
        return { success: false, error: "GAS への送信中にタイムアウトしました。画像が大きすぎる可能性があります。" };
      }
      console.error("submitOpenReport:", e);
      return { success: false, error: e.message };
    }
    console.error("submitOpenReport:", e);
    return { success: false, error: "送信処理でエラーが発生しました" };
  }
}

async function readResponseSnippet(res: Response): Promise<string> {
  try {
    const t = (await res.text()).trim();
    if (!t) return "";
    const max = 200;
    return ` — ${t.length > max ? `${t.slice(0, max)}…` : t}`;
  } catch {
    return "";
  }
}
