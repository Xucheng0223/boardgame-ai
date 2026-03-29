import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { retrieveChunks } from "@/app/_lib/retrieval";
import { SYSTEM_PROMPT, buildUserMessage } from "@/app/_lib/prompt";
import { checkRateLimit } from "@/app/_lib/rateLimit";

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the dev server.");
}

const client = new Anthropic();

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  const { allowed, retryAfterMs } = checkRateLimit(ip);
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

  // Retrieve relevant rule chunks
  let chunks;
  try {
    chunks = await retrieveChunks(game.trim(), question.trim(), 4);
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
          max_tokens: 600,
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
