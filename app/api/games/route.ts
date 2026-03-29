import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

export async function GET() {
  const dir = path.join(process.cwd(), "app/_data/rulebooks");

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return Response.json({ games: [] });
  }

  const games = entries
    .map((entry) => {
      const fullPath = path.join(dir, entry);
      try {
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          // Folder-based game — get title from the first JSON file
          const files = readdirSync(fullPath).filter((f) => f.endsWith(".json")).sort();
          if (files.length === 0) return null;
          const raw = JSON.parse(readFileSync(path.join(fullPath, files[0]), "utf-8"));
          const label: string = raw.title ?? raw.game_title ?? entry;
          return { id: entry, label };
        }

        if (entry.endsWith(".json")) {
          const id = entry.replace(/\.json$/, "");
          const raw = JSON.parse(readFileSync(fullPath, "utf-8"));
          const label: string = raw.title ?? raw.game_title ?? id;
          return { id, label };
        }
      } catch {
        // skip unreadable entries
      }
      return null;
    })
    .filter(Boolean);

  return Response.json({ games });
}
