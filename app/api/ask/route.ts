import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { prepareGame, expandQuery } from "@/app/_lib/retrieval";
import type { RuleChunk } from "@/app/_lib/retrieval";
import OpenAI from "openai";
import { SYSTEM_PROMPT, buildUserMessage } from "@/app/_lib/prompt";
import { checkRateLimit } from "@/app/_lib/rateLimit";

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the dev server.");
}

if (!process.env.OPENAI_API_KEY) {
  console.warn(
    "[boardgame-ai] OPENAI_API_KEY is not set — falling back to keyword search. " +
    "Retrieval quality will be significantly lower. Add OPENAI_API_KEY to .env.local to enable semantic search."
  );
}

const client = new Anthropic();
const openai = process.env.OPENAI_API_KEY ? new OpenAI() : null;

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  const { allowed, retryAfterMs } = await checkRateLimit(ip);
  if (!allowed) {
    return Response.json(
      { error: `Too many requests. Please wait ${Math.ceil(retryAfterMs / 1000)} seconds.` },
      { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
    );
  }

  let body: {
    question?: string;
    game?: string;
    history?: { role: "user" | "assistant"; content: string }[];
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { question, game, history = [] } = body;

  if (!question || typeof question !== "string" || question.trim() === "") {
    return Response.json({ error: "Missing or empty 'question'." }, { status: 400 });
  }
  if (!game || typeof game !== "string" || game.trim() === "") {
    return Response.json({ error: "Missing or empty 'game'." }, { status: 400 });
  }

  const TOP_K = 6;

  // Run query expansion and rulebook/embedding loading in parallel
  let searchQuery: string;
  let chunks: RuleChunk[];
  try {
    const [expanded, prepared] = await Promise.all([
      openai ? expandQuery(question.trim(), openai) : Promise.resolve(question.trim()),
      prepareGame(game.trim()),
    ]);

    searchQuery = expanded;
    const { chunks: gameChunks, embeddings } = prepared;

    if (openai && embeddings) {
      const candidateK = TOP_K * 3;
      const queryEmbedding = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: searchQuery,
      }).then((r) => r.data[0].embedding);

      const cosineSimilarity = (a: number[], b: number[]) => {
        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; normA += a[i] * a[i]; normB += b[i] * b[i]; }
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
      };

      const tokenize = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w) => w.length > 1);
      const scoreKeywords = (tokens: string[], chunk: typeof gameChunks[0]) => {
        const content = new Set(tokenize(chunk.content));
        const section = new Set(tokenize(chunk.section));
        const kw = new Set(chunk.keywords ?? []);
        return tokens.reduce((s, t) => s + (kw.has(t) ? 3 : section.has(t) ? 2 : content.has(t) ? 1 : 0), 0);
      };

      const queryTokens = tokenize(searchQuery);
      chunks = gameChunks
        .map((chunk) => ({ chunk, semantic: cosineSimilarity(queryEmbedding, embeddings.get(chunk.id) ?? []) }))
        .sort((a, b) => b.semantic - a.semantic)
        .slice(0, candidateK)
        .map(({ chunk, semantic }) => ({
          chunk,
          score: semantic * 0.7 + (queryTokens.length > 0
            ? (scoreKeywords(queryTokens, chunk) / (queryTokens.length * 3)) * 0.3 : 0),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, TOP_K)
        .map(({ chunk }) => chunk);
    } else {
      // Keyword fallback
      const tokenize = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w) => w.length > 1);
      const queryTokens = tokenize(searchQuery);
      chunks = queryTokens.length === 0 ? [] : gameChunks
        .map((chunk) => {
          const content = new Set(tokenize(chunk.content));
          const section = new Set(tokenize(chunk.section));
          const kw = new Set(chunk.keywords ?? []);
          const score = queryTokens.reduce((s, t) => s + (kw.has(t) ? 3 : section.has(t) ? 2 : content.has(t) ? 1 : 0), 0);
          return { chunk, score };
        })
        .filter(({ score }) => score >= 2)
        .sort((a, b) => b.score - a.score)
        .slice(0, TOP_K)
        .map(({ chunk }) => chunk);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Retrieval failed.";
    return Response.json({ error: message }, { status: 404 });
  }

  const userMessage = buildUserMessage(game.trim(), question.trim(), chunks);
  const sources = chunks.map((c) => ({ section: c.section, id: c.id, content: c.content }));

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send sources immediately so the UI can show them before the answer arrives
      controller.enqueue(
        encoder.encode(JSON.stringify({ type: "sources", data: sources }) + "\n")
      );

      try {
        const claudeStream = client.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: [
            ...history.map((m) => ({ role: m.role, content: m.content })),
            { role: "user", content: userMessage },
          ],
        });

        for await (const event of claudeStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(
              encoder.encode(
                JSON.stringify({ type: "delta", text: event.delta.text }) + "\n"
              )
            );
          }
        }

        controller.enqueue(encoder.encode(JSON.stringify({ type: "done" }) + "\n"));
      } catch (err) {
        console.error("Claude API error:", err);
        controller.enqueue(
          encoder.encode(
            JSON.stringify({ type: "error", message: "LLM request failed." }) + "\n"
          )
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
