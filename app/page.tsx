import { getSupabaseServer } from "@/utils/supabaseServer";
import { addDaysJstYmd, getTodayJstYmd } from "@/utils/jstDate";
import OpenReportForm, { type ReportHistoryItem } from "@/components/OpenReportForm";

function normalizeStoreId(store: string | string[] | undefined): string {
  const raw = Array.isArray(store) ? store[0] : store;
  return raw?.trim() ?? "";
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ store?: string | string[] }>;
}) {
  const resolvedSearchParams = await searchParams;
  const storeId = normalizeStoreId(resolvedSearchParams?.store);
  const supabase = getSupabaseServer();

  if (!storeId) {
    return (
      <div className="min-h-screen bg-[#0f1923] text-[#e8edf3] flex flex-col items-center justify-center p-4">
        <h1 className="text-xl font-bold text-rose-400 mb-2">店舗を指定できません</h1>
        <p className="text-center text-sm text-[#6b7d94] max-w-sm">
          URL に <code className="text-[#38c9a0]">?store=店舗ID</code>{" "}
          を付けてアクセスしてください。
        </p>
      </div>
    );
  }

  const today = getTodayJstYmd();

  const { data: storeRow, error: storeError } = await supabase
    .from("stores")
    .select("store_name")
    .eq("store_id", storeId)
    .maybeSingle();

  if (storeError) {
    return (
      <div className="min-h-screen bg-[#0f1923] text-[#e8edf3] flex flex-col items-center justify-center p-4">
        <h1 className="text-xl font-bold text-rose-400 mb-2">店舗情報の取得に失敗しました</h1>
        <p className="text-center text-sm text-[#6b7d94]">{storeError.message}</p>
      </div>
    );
  }

  if (!storeRow) {
    return (
      <div className="min-h-screen bg-[#0f1923] text-[#e8edf3] flex flex-col items-center justify-center p-4">
        <h1 className="text-xl font-bold text-rose-400 mb-2">店舗が見つかりません</h1>
        <p className="text-center text-sm text-[#6b7d94] max-w-sm">
          指定された店舗ID（<span className="text-[#38c9a0] break-all">{storeId}</span>
          ）のデータは存在しないか、閲覧権限がありません。
        </p>
        <p className="text-center text-xs text-[#5c6b7d] mt-3 max-w-md">
          Supabase の RLS でブロックされる場合は、Vercel 等の環境変数に
          <code className="text-[#38c9a0]"> SUPABASE_SERVICE_ROLE_KEY </code>
          を設定するか、stores 用の SELECT ポリシーを追加してください（テーブル定義の変更は不要です）。
        </p>
      </div>
    );
  }

  const storeDisplayName = storeRow.store_name?.trim() || "店舗";

  const { data: clockRows, error: clockError } = await supabase
    .from("clock_in_reports")
    .select("staff_id")
    .eq("store_id", storeId)
    .eq("work_date", today);

  if (clockError) {
    return (
      <div className="min-h-screen bg-[#0f1923] text-[#e8edf3] flex flex-col items-center justify-center p-4">
        <h1 className="text-xl font-bold text-rose-400 mb-2">出勤データの取得に失敗しました</h1>
        <p className="text-center text-sm text-[#6b7d94]">{clockError.message}</p>
      </div>
    );
  }

  const uniqueStaffIds = [
    ...new Set(
      (clockRows ?? [])
        .map((r) => r.staff_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];

  let activeStaff: { staff_id: string; staff_name: string }[] = [];

  if (uniqueStaffIds.length > 0) {
    const { data: staffRows, error: staffError } = await supabase
      .from("staffs")
      .select("staff_id, staff_name")
      .in("staff_id", uniqueStaffIds);

    if (staffError) {
      return (
        <div className="min-h-screen bg-[#0f1923] text-[#e8edf3] flex flex-col items-center justify-center p-4">
          <h1 className="text-xl font-bold text-rose-400 mb-2">スタッフ情報の取得に失敗しました</h1>
          <p className="text-center text-sm text-[#6b7d94]">{staffError.message}</p>
        </div>
      );
    }

    const nameById = new Map(
      (staffRows ?? []).map((s) => [s.staff_id, s.staff_name] as const),
    );
    activeStaff = uniqueStaffIds
      .map((id) => {
        const name = nameById.get(id);
        return name ? { staff_id: id, staff_name: name } : null;
      })
      .filter((x): x is { staff_id: string; staff_name: string } => x !== null);
  }

  const historyFromYmd = addDaysJstYmd(today, -30);
  const { data: historyRows, error: historyError } = await supabase
    .from("actual_business_hours")
    .select(
      "store_id, business_date, opened_at, open_delay_mark, delay_minutes, image_url, opened_by_staff_id",
    )
    .eq("store_id", storeId)
    .gte("business_date", historyFromYmd)
    .order("opened_at", { ascending: false });

  if (historyError) {
    return (
      <div className="min-h-screen bg-[#0f1923] text-[#e8edf3] flex flex-col items-center justify-center p-4">
        <h1 className="text-xl font-bold text-rose-400 mb-2">報告履歴の取得に失敗しました</h1>
        <p className="text-center text-sm text-[#6b7d94]">{historyError.message}</p>
      </div>
    );
  }

  const histStaffIds = [
    ...new Set(
      (historyRows ?? [])
        .map((r) => r.opened_by_staff_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  const staffNameById = new Map<string, string | null>();
  if (histStaffIds.length > 0) {
    const { data: histStaffs } = await supabase
      .from("staffs")
      .select("staff_id, staff_name")
      .in("staff_id", histStaffIds);
    for (const s of histStaffs ?? []) {
      staffNameById.set(s.staff_id, s.staff_name);
    }
  }

  const reportHistory: ReportHistoryItem[] = (historyRows ?? []).map((r) => {
    const sid = r.store_id as string;
    const b = r.business_date as string;
    const oa = r.opened_at as string;
    return {
      id: `${sid}|${b}|${oa}`,
      business_date: b,
      opened_at: oa,
      opened_by_name: staffNameById.get(r.opened_by_staff_id) ?? "（不明）",
      open_delay_mark: Boolean(r.open_delay_mark),
      delay_minutes: r.delay_minutes,
      image_url: r.image_url,
    };
  });

  return (
    <main className="min-h-screen bg-[#0f1923] text-[#e8edf3] font-sans">
      <header className="max-w-md mx-auto flex items-center gap-4 pt-8 px-4">
        <div className="w-11 h-11 bg-[#38c9a0] rounded-xl flex items-center justify-center shrink-0 text-[#0f1923]">
          <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current" aria-hidden>
            <path d="M12 2C8.686 2 6 4.686 6 8c0 4.5 6 12 6 12s6-7.5 6-12c0-3.314-2.686-6-6-6zm0 8.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" />
          </svg>
        </div>
        <div>
          <h1 className="text-xs font-medium tracking-widest uppercase text-[#38c9a0] mb-1">
            オープン報告
          </h1>
          <p className="text-xl font-bold">{storeDisplayName}</p>
        </div>
      </header>

      <OpenReportForm
        storeId={storeId}
        activeStaff={activeStaff}
        businessDateLabel={today}
        noStaffOnShift={activeStaff.length === 0}
        reportHistory={reportHistory}
      />
    </main>
  );
}
