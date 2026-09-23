import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { requireApiUser, serializeError } from "@/lib/api";
import { createPendiente } from "@/lib/repo";

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireApiUser();
  } catch (error) {
    return serializeError(error);
  }

  try {
    let body: { texto?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Falta el texto" }, { status: 400 });
    }

    const texto = body?.texto;
    if (typeof texto !== "string" || texto.trim() === "") {
      return NextResponse.json({ error: "Falta el texto" }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: `Extraé los compromisos y tareas pendientes del siguiente texto. Respondé únicamente con cada tarea en una línea propia, sin numerar ni adornos:\n\n${texto}`,
    });

    const pendientes = (response.text ?? "").trim();
    if (!pendientes) {
      return NextResponse.json({ error: "No pudimos procesar la nota" }, { status: 500 });
    }
    const saved = await createPendiente({
      id: randomUUID(),
      userId: user.id,
      sourceText: texto,
      content: pendientes,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ pendientes: saved.content, id: saved.id });
  } catch (error) {
    console.error("extraer-pendientes:", error);
    return NextResponse.json({ error: "No pudimos procesar la nota" }, { status: 500 });
  }
}