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
let aiClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("GEMINI_API_KEY environment variable is not set. Gemini API calls will fail.");
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey || "",
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
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

    const candidateModels = ["gemini-3.7-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"];
    let lastError: any = null;
    let generatedText = "";

    for (const model of candidateModels) {
      let attempts = 0;
      const maxAttempts = 2;

      while (attempts < maxAttempts) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config,
          });
          generatedText = response.text || "";
          break; // Success
        } catch (err: any) {
          lastError = err;
          attempts++;
          const errStr = String(err?.message || err);
          const isTransient = errStr.includes("503") || errStr.includes("high demand") || errStr.includes("UNAVAILABLE") || errStr.includes("RESOURCE_EXHAUSTED");

          if (isTransient && attempts < maxAttempts) {
            console.warn(`[Gemini API] Transient error on ${model} (attempt ${attempts}/${maxAttempts}), retrying in 1s...`);
            await new Promise((resolve) => setTimeout(resolve, 1000 * attempts));
          } else {
            console.warn(`[Gemini API] Failed on model ${model}, attempting fallback candidate if available...`);
            break; // Try next fallback model
          }
        }
      }

      if (generatedText) {
        break;
      }
    }

    if (!generatedText && lastError) {
      throw lastError;
    }

    res.json({ text: generatedText });
  } catch (error: any) {
    console.error("Gemini server error:", error);
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
