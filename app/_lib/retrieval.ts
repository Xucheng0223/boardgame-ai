import { readFileSync, readdirSync, statSync } from "fs";
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
    embeddingCache.set(game, gameEmbeddings);
  }

  const missing = chunks.filter((c) => !gameEmbeddings!.has(c.id));
  if (missing.length > 0 && openai) {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: missing.map((c) => `${c.section}: ${c.content}`),
    });
    response.data.forEach((item, idx) => {
      gameEmbeddings!.set(missing[idx].id, item.embedding);
    });
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

export async function retrieveChunks(
  game: string,
  query: string,
  topK = 4
): Promise<RuleChunk[]> {
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
        // Merge all JSON files in the folder into one rulebook
        const files = readdirSync(folderPath).filter((f) => f.endsWith(".json")).sort();
        if (files.length === 0) throw new Error("Empty rulebook folder");

        const merged: Rulebook = { game: game.toLowerCase(), title: game, chunks: [] };
        for (const file of files) {
          const raw = readFileSync(path.join(folderPath, file), "utf-8");
          const normalized = normalizeRulebook(JSON.parse(raw));
          if (merged.title === game) merged.title = normalized.title;
          const prefix = file.replace(/\.json$/, "");
          // Prefix chunk IDs with the filename to avoid collisions across files
          merged.chunks.push(
            ...normalized.chunks.map((c) => ({ ...c, id: `${prefix}__${c.id}` }))
          );
        }
        rulebook = merged;
      } else {
        const raw = readFileSync(rulebookPath, "utf-8");
        rulebook = normalizeRulebook(JSON.parse(raw));
      }
      rulebookCache.set(game, rulebook);
    } catch {
      throw new Error(`No rulebook found for game: "${game}"`);
    }
  }

  if (openai) {
    // Semantic search via embeddings
    const [queryEmbedding, chunkEmbeddings] = await Promise.all([
      openai.embeddings.create({ model: "text-embedding-3-small", input: query })
        .then((r) => r.data[0].embedding),
      ensureEmbeddings(game, rulebook.chunks),
    ]);

    return rulebook.chunks
      .map((chunk) => ({
        chunk,
        score: cosineSimilarity(queryEmbedding, chunkEmbeddings.get(chunk.id) ?? []),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(({ chunk }) => chunk);
  }

  // Keyword fallback
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const MIN_SCORE = 2;
  return rulebook.chunks
    .map((chunk) => ({ chunk, score: scoreChunk(queryTokens, chunk) }))
    .filter(({ score }) => score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ chunk }) => chunk);
}
