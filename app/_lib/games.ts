import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

export type Game = { id: string; label: string; starterQuestions: string[] };

export function getGames(): Game[] {
  const dir = path.join(process.cwd(), "app/_data/rulebooks");

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  return entries
    .map((entry): Game | null => {
      const fullPath = path.join(dir, entry);
      try {
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          const files = readdirSync(fullPath).filter((f) => f.endsWith(".json")).sort();
          if (files.length === 0) return null;
          const raw = JSON.parse(readFileSync(path.join(fullPath, files[0]), "utf-8"));
          return {
            id: entry,
            label: raw.title ?? raw.game_title ?? entry,
            starterQuestions: raw.starterQuestions ?? [],
          };
        }

        if (entry.endsWith(".json")) {
          const raw = JSON.parse(readFileSync(fullPath, "utf-8"));
          return {
            id: entry.replace(/\.json$/, ""),
            label: raw.title ?? raw.game_title ?? entry,
            starterQuestions: raw.starterQuestions ?? [],
          };
        }
      } catch {
        // skip unreadable entries
      }
      return null;
    })
    .filter((g): g is Game => g !== null);
}
