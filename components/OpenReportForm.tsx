"use client";

import { useState, useRef, useCallback } from "react";
import { submitOpenReport } from "@/app/actions/report";

interface Props {
  storeId: string;
  activeStaff: { staff_id: string; staff_name: string }[];
  businessDateLabel: string;
  noStaffOnShift: boolean;
}

export default function OpenReportForm({
  storeId,
  activeStaff,
  businessDateLabel,
  noStaffOnShift,
}: Props) {
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [compressedBase64, setCompressedBase64] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewObjectUrlRef = useRef<string | null>(null);

  const clearPreview = useCallback(() => {
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }
    setPreviewUrl(null);
  }, []);

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const maxWidth = 800;
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvasを初期化できませんでした"));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        const base64 = dataUrl.split(",")[1];
        if (!base64) {
          reject(new Error("画像のエンコードに失敗しました"));
          return;
        }
        resolve(base64);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("画像の読み込みに失敗しました"));
      };
      img.src = url;
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      clearPreview();
      const objectUrl = URL.createObjectURL(file);
      previewObjectUrlRef.current = objectUrl;
      setPreviewUrl(objectUrl);
      const base64 = await compressImage(file);
      setCompressedBase64(base64);
    } catch (err) {
      clearPreview();
      setCompressedBase64(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setFormError(
        err instanceof Error ? err.message : "画像の処理に失敗しました",
      );
    }
  };

  const handleRetake = () => {
    setCompressedBase64(null);
    setFormError(null);
    clearPreview();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (noStaffOnShift) {
      setFormError("本日の出勤者が登録されていないため送信できません。");
      return;
    }
    if (!selectedStaffId) {
      setFormError("報告者を選択してください。");
      return;
    }
    if (!compressedBase64) {
      setFormError("店舗の写真を撮影してください。");
      return;
    }

    const staff = activeStaff.find((s) => s.staff_id === selectedStaffId);
    const staffName = staff?.staff_name ?? "";

    setIsSubmitting(true);
    const result = await submitOpenReport({
      storeId,
      staffId: selectedStaffId,
      staffName,
      imageBase64: compressedBase64,
    });
    setIsSubmitting(false);

    if (result.success) {
      setSelectedStaffId("");
      handleRetake();
      setFormError(null);
      alert("報告を送信しました");
    } else {
      setFormError(result.error);
    }
  };

  const formDisabled = noStaffOnShift;

  return (
    <div className="max-w-md mx-auto p-4">
      {noStaffOnShift && (
        <div
          className="mt-4 mb-0 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200/95"
          role="alert"
        >
          {businessDateLabel}{" "}
          のこの店舗の出勤打刻がまだないか、打刻者がスタッフマスタにいません。管理者に連絡してください。
        </div>
      )}

      <div className="bg-[#182030] border border-[#263348] rounded-2xl p-6 mt-4 shadow-xl shadow-black/20">
        <div className="text-xs font-bold tracking-widest uppercase text-[#6b7d94] mb-1">
          報告フォーム
        </div>
        <p className="text-xs text-[#5c6b7d] mb-4">対象日: {businessDateLabel}</p>

        {formError && (
          <div
            className="mb-4 rounded-xl border border-rose-500/35 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-200"
            role="alert"
          >
            {formError}
          </div>
        )}

        <div className="mb-5">
          <label
            htmlFor="reporter"
            className="block text-sm font-bold text-[#6b7d94] mb-2"
          >
            報告者（本日出勤中）
          </label>
          <div className="relative">
            <select
              id="reporter"
              value={selectedStaffId}
              onChange={(e) => {
                setSelectedStaffId(e.target.value);
                setFormError(null);
              }}
              disabled={formDisabled}
              className="w-full cursor-pointer appearance-none rounded-xl border border-[#263348] bg-[#0f1923] p-4 pr-10 text-[#e8edf3] outline-none transition focus:border-[#38c9a0] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">
                {noStaffOnShift ? "選択できるスタッフがありません" : "選択してください"}
              </option>
              {activeStaff.map((staff) => (
                <option key={staff.staff_id} value={staff.staff_id}>
                  {staff.staff_name}
                </option>
              ))}
            </select>
            <span
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#6b7d94]"
              aria-hidden
            >
              ▼
            </span>
          </div>
        </div>

        <div className="mb-6">
          <div className="mb-2 block text-sm font-bold text-[#6b7d94]">店舗写真</div>
          <div className="relative aspect-video overflow-hidden rounded-xl border-2 border-dashed border-[#263348] bg-[#0f1923]">
            {!previewUrl ? (
              <>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  disabled={formDisabled}
                  className="absolute inset-0 z-10 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[#6b7d94]">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-9 w-9 fill-none stroke-current stroke-2"
                    aria-hidden
                  >
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  <span className="text-sm font-medium">タップして撮影</span>
                </div>
              </>
            ) : (
              <>
                <img
                  src={previewUrl}
                  alt="アップロード前のプレビュー"
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={handleRetake}
                  className="absolute right-2 top-2 rounded-lg bg-black/60 px-3 py-1.5 text-xs text-white backdrop-blur"
                >
                  撮り直す
                </button>
              </>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting || formDisabled}
          className="w-full rounded-xl bg-[#38c9a0] py-4 font-bold text-[#0f1923] transition hover:bg-[#2fb892] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#38c9a0] disabled:opacity-50"
        >
          {isSubmitting ? "送信中…" : "オープン報告を送信"}
        </button>
      </div>
    </div>
  );
}
