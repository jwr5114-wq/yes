import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));

// Lazy initialize Gemini client
function getGenAI(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY 환경변수가 설정되지 않았습니다. AI Studio 설정(Secrets)을 확인해주세요.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Gemini AI Generation Endpoint with retry & fallback model handling
app.post("/api/gemini/generate", async (req, res) => {
  try {
    const { prompt, systemInstruction, temperature = 0.7, responseMimeType } = req.body;
    if (!prompt) {
      res.status(400).json({ error: "prompt is required" });
      return;
    }

    const ai = getGenAI();
    const config: any = {
      temperature,
    };
    if (systemInstruction) {
      config.systemInstruction = systemInstruction;
    }
    if (responseMimeType) {
      config.responseMimeType = responseMimeType;
    }

    const candidateModels = ["gemini-3.7-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
    let lastError: any = null;
    let generatedText = "";

    for (const model of candidateModels) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config,
          });
          generatedText = response.text || "";
          if (generatedText) break;
        } catch (err: any) {
          lastError = err;
          const errStr = String(err?.message || err);
          const isTransient =
            errStr.includes("503") ||
            errStr.includes("high demand") ||
            errStr.includes("UNAVAILABLE") ||
            errStr.includes("RESOURCE_EXHAUSTED") ||
            errStr.includes("429");

          if (isTransient && attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
          } else {
            break;
          }
        }
      }

      if (generatedText) {
        break;
      }
    }

    if (!generatedText) {
      throw lastError || new Error("AI 응답을 생성하지 못했습니다.");
    }

    res.json({ text: generatedText });
  } catch (error: any) {
    const msg = error.message || "AI 생성 요청 처리 중 오류가 발생했습니다.";
    res.status(500).json({
      error: msg,
    });
  }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Vite middleware & Static serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
