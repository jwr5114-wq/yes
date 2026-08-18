export interface GeminiGenerateOptions {
  prompt: string;
  systemInstruction?: string;
  temperature?: number;
  responseMimeType?: string;
}

export async function generateWithGemini(options: GeminiGenerateOptions): Promise<string> {
  const response = await fetch("/api/gemini/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(options),
  });

  if (!response.ok) {
    let errorDetail = `Status ${response.status}`;
    try {
      const errData = await response.json();
      if (errData.error) {
        if (typeof errData.error === "string") {
          try {
            const nested = JSON.parse(errData.error);
            if (nested?.error?.message) {
              errorDetail = nested.error.message;
            } else {
              errorDetail = errData.error;
            }
          } catch {
            errorDetail = errData.error;
          }
        } else if (errData.error.message) {
          errorDetail = errData.error.message;
        }
      }
    } catch {
      // ignore
    }
    if (errorDetail.includes("503") || errorDetail.includes("high demand") || errorDetail.includes("UNAVAILABLE")) {
      errorDetail = "AI 모델 일시적 요청 급증(503). 잠시 후 다시 시도해 주세요.";
    }
    throw new Error(errorDetail);
  }

  const data = await response.json();
  return data.text || "";
}
