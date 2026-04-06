import type { MetadataRoute } from "next";
import { getGames } from "@/app/_lib/games";

const BASE_URL = "https://boardgame-ai.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const games = getGames();

  const gameRoutes = games.map((g) => ({
    url: `${BASE_URL}/game/${g.id}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  return [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 1.0,
    },
    ...gameRoutes,
  ];
}
