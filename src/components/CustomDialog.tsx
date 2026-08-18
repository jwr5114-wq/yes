import React, { useEffect, useRef, useState } from "react";

export interface DialogOptions {
  type: "alert" | "confirm" | "prompt";
  title?: string;
  msg: string;
  defaultText?: string;
  onConfirm?: (value?: string) => void;
  onCancel?: () => void;
}

interface CustomDialogProps {
  dialog: DialogOptions | null;
  onClose: () => void;
}

export const CustomDialog: React.FC<CustomDialogProps> = ({ dialog, onClose }) => {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (dialog && dialog.type === "prompt") {
      setInputValue(dialog.defaultText || "");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [dialog]);

  if (!dialog) return null;

  const handleOk = () => {
    if (dialog.onConfirm) {
      if (dialog.type === "prompt") {
        dialog.onConfirm(inputValue);
      } else {
        dialog.onConfirm();
      }
    }
    onClose();
  };

  const handleCancel = () => {
    if (dialog.onCancel) {
      dialog.onCancel();
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-5 space-y-4 border border-slate-200">
        <h3 className="font-bold text-slate-800 text-sm">{dialog.title || "알림"}</h3>
        <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">{dialog.msg}</p>

        {dialog.type === "prompt" && (
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleOk();
              if (e.key === "Escape") handleCancel();
            }}
            className="w-full text-xs p-2.5 border rounded-md border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        )}

        <div className="flex justify-end gap-2 pt-2">
          {(dialog.type === "confirm" || dialog.type === "prompt") && (
            <button
              onClick={handleCancel}
              className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded-lg font-medium transition-colors"
            >
              취소
            </button>
          )}
          <button
            onClick={handleOk}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg font-semibold transition-colors shadow"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
};
