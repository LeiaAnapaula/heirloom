import { readFileSync } from "node:fs";
import { GoogleGenAI } from "@google/genai";

/** Reads GEMINI_API_KEY from .env.local (no dotenv) and returns a client. The key never leaves this machine except to Google. */
export function gemini(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) {
    try {
      for (const line of readFileSync(".env.local", "utf8").split("\n")) {
        const m = line.match(/^\s*GEMINI_API_KEY\s*=\s*(.+?)\s*$/);
        if (m) process.env.GEMINI_API_KEY = m[1].replace(/^["']|["']$/g, "");
      }
    } catch {
      // no .env.local
    }
  }
  if (!process.env.GEMINI_API_KEY) {
    console.error("No GEMINI_API_KEY yet: paste it into .env.local after GEMINI_API_KEY= and save.");
    process.exit(1);
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}
