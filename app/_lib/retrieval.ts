import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import path from "path";
import OpenAI from "openai";

export type RuleChunk = {
  id: string;
  section: string;
  content: string;
  keywords?: string[];
};

type Rulebook = {
  game: string;
  title: string;
  chunks: RuleChunk[];
};

// Query expansion — rewrite the user question into a richer search query
export async function expandQuery(question: string, openaiClient: OpenAI): Promise<string> {
  try {
    const res = await openaiClient.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 60,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You are a search query optimizer for a board game rules database. " +
            "Rewrite the user's question as a short list of keywords and synonyms that will best match rulebook text. " +
            "Output only the expanded query, no explanation.",
        },
        { role: "user", content: question },
      ],
    });
    return res.choices[0]?.message?.content?.trim() ?? question;
  } catch {
    return question;
  }
}

// Page-based format (e.g. seti.json)
type PageRulebook = {
  game_title: string;
  pages: { page: number; text: string }[];
};

function normalizeRulebook(raw: Rulebook | PageRulebook): Rulebook {
  if ("chunks" in raw) return raw;
  const gameId = raw.game_title.toLowerCase().replace(/\s+/g, "-");
  return {
    game: gameId,
    title: raw.game_title,
    chunks: raw.pages.map((p) => ({
      id: `${gameId}-page-${p.page}`,
      section: `Page ${p.page}`,
      content: p.text,
    })),
  };
}

const rulebookCache = new Map<string, Rulebook>();
// Embedding cache: game -> chunkId -> vector
const embeddingCache = new Map<string, Map<string, number[]>>();
// Where to persist embeddings for each game
const embeddingsPathCache = new Map<string, string>();

const openai = process.env.OPENAI_API_KEY ? new OpenAI() : null;

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function ensureEmbeddings(game: string, chunks: RuleChunk[]): Promise<Map<string, number[]>> {
  let gameEmbeddings = embeddingCache.get(game);

  if (!gameEmbeddings) {
    gameEmbeddings = new Map();

    // Load persisted embeddings from disk
    const persistPath = embeddingsPathCache.get(game);
    if (persistPath) {
      try {
        const raw = JSON.parse(readFileSync(persistPath, "utf-8"));
        if (raw.embeddings && typeof raw.embeddings === "object") {
          for (const [id, vec] of Object.entries(raw.embeddings)) {
            gameEmbeddings.set(id, vec as number[]);
          }
          console.log(`[boardgame-ai] Loaded ${gameEmbeddings.size} embeddings from disk for "${game}"`);
        }
      } catch {
        // File doesn't exist yet — will be created after first computation
      }
    }

    embeddingCache.set(game, gameEmbeddings);
  }

  const missing = chunks.filter((c) => !gameEmbeddings!.has(c.id));
  if (missing.length > 0 && openai) {
    console.log(`[boardgame-ai] Computing embeddings for ${missing.length} chunks in "${game}"...`);
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: missing.map((c) => `${c.section}: ${c.content}`),
    });
    response.data.forEach((item, idx) => {
      gameEmbeddings!.set(missing[idx].id, item.embedding);
    });

    // Persist to disk so future restarts skip this computation
    const persistPath = embeddingsPathCache.get(game);
    if (persistPath) {
      try {
        const toSave: Record<string, number[]> = {};
        for (const [id, vec] of gameEmbeddings) {
          toSave[id] = vec;
        }
        writeFileSync(persistPath, JSON.stringify({
          model: "text-embedding-3-small",
          generatedAt: new Date().toISOString(),
          chunks: chunks.length,
          embeddings: toSave,
        }));
        console.log(`[boardgame-ai] Persisted ${gameEmbeddings.size} embeddings to ${persistPath}`);
      } catch {
        // Read-only filesystem (Vercel production) — in-memory cache is sufficient,
        // commit embeddings.json to git so the file is present at deploy time
      }
    }
  }

  return gameEmbeddings;
}

// --- Keyword fallback ---

const STOPWORDS = new Set([
  "a", "an", "the", "is", "it", "in", "on", "at", "to", "for",
  "of", "and", "or", "but", "with", "do", "does", "did", "be",
  "are", "was", "were", "can", "i", "my", "you", "your", "me",
  "this", "that", "what", "how", "when", "where", "which", "who",
  "have", "has", "had", "will", "would", "could", "should",
  "if", "not", "no", "so", "there", "their", "they", "we",
  "he", "she", "from", "by", "as", "up", "about", "than",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function scoreChunk(queryTokens: string[], chunk: RuleChunk): number {
  const contentTokens = new Set(tokenize(chunk.content));
  const sectionTokens = new Set(tokenize(chunk.section));
  const explicitKeywords = new Set(chunk.keywords ?? []);

  let score = 0;
  for (const token of queryTokens) {
    if (explicitKeywords.has(token)) score += 3;
    else if (sectionTokens.has(token)) score += 2;
    else if (contentTokens.has(token)) score += 1;
  }
  return score;
}

// ---

export type PreparedGame = {
  chunks: RuleChunk[];
  embeddings: Map<string, number[]> | null; // null when OpenAI is not configured
};

// Phase 1: load rulebook + embeddings. Call this in parallel with expandQuery.
export async function prepareGame(game: string): Promise<PreparedGame> {
  const rulebookPath = path.join(
    process.cwd(),
    "app/_data/rulebooks",
    `${game.toLowerCase()}.json`
  );

  let rulebook = rulebookCache.get(game);
  if (!rulebook) {
    const folderPath = path.join(process.cwd(), "app/_data/rulebooks", game.toLowerCase());
    const isFolder = (() => { try { return statSync(folderPath).isDirectory(); } catch { return false; } })();

    try {
      if (isFolder) {
        const files = readdirSync(folderPath).filter((f) => f.endsWith(".json")).sort();
        if (files.length === 0) throw new Error("Empty rulebook folder");

        const merged: Rulebook = { game: game.toLowerCase(), title: game, chunks: [] };
        for (const file of files) {
          const raw = readFileSync(path.join(folderPath, file), "utf-8");
          const normalized = normalizeRulebook(JSON.parse(raw));
          if (merged.title === game) merged.title = normalized.title;
          const prefix = file.replace(/\.json$/, "");
          merged.chunks.push(
            ...normalized.chunks.map((c) => ({ ...c, id: `${prefix}__${c.id}` }))
          );
        }
        rulebook = merged;
        embeddingsPathCache.set(game, path.join(folderPath, "embeddings.json"));
      } else {
        const raw = readFileSync(rulebookPath, "utf-8");
        rulebook = normalizeRulebook(JSON.parse(raw));
        embeddingsPathCache.set(game, rulebookPath.replace(/\.json$/, ".embeddings.json"));
      }
      rulebookCache.set(game, rulebook);
    } catch {
      throw new Error(`No rulebook found for game: "${game}"`);
    }
  }

  const embeddings = openai ? await ensureEmbeddings(game, rulebook.chunks) : null;
  return { chunks: rulebook.chunks, embeddings };
}

// Full retrieval convenience wrapper — use prepareGame directly from route.ts for parallelism.
export async function retrieveChunks(
  game: string,
  query: string,
  topK = 6
): Promise<RuleChunk[]> {
  const prepared = await prepareGame(game);
  const { chunks, embeddings } = prepared;

  if (openai && embeddings) {
    const candidateK = topK * 3;
    const [queryEmbedding, chunkEmbeddings] = await Promise.all([
      openai.embeddings.create({ model: "text-embedding-3-small", input: query })
        .then((r) => r.data[0].embedding),
      Promise.resolve(embeddings),
    ]);

    const queryTokens = tokenize(query);

    return chunks
      .map((chunk) => ({
        chunk,
        semantic: cosineSimilarity(queryEmbedding, chunkEmbeddings.get(chunk.id) ?? []),
      }))
      .sort((a, b) => b.semantic - a.semantic)
      .slice(0, candidateK)
      .map(({ chunk, semantic }) => ({
        chunk,
        score: semantic * 0.7 + (queryTokens.length > 0
          ? (scoreChunk(queryTokens, chunk) / (queryTokens.length * 3)) * 0.3
          : 0),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(({ chunk }) => chunk);
  }

  // Keyword fallback
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];
  const MIN_SCORE = 2;
  return chunks
    .map((chunk) => ({ chunk, score: scoreChunk(queryTokens, chunk) }))
    .filter(({ score }) => score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ chunk }) => chunk);
}
