import type { Metadata } from "next";
import { getGames } from "@/app/_lib/games";
import ChatInterface from "@/app/_components/ChatInterface";

export const metadata: Metadata = {
  title: "Board Game AI Judge — Rules Questions Answered",
  description:
    "Ask rules questions about your board games and get answers grounded in the official rulebook. No hallucination — every answer cites the exact rule.",
  keywords: [
    "board game rules",
    "board game AI",
    "rulebook questions",
    "nemesis board game rules",
    "orloj board game rules",
    "seti board game rules",
    "vantage board game rules",
  ],
  openGraph: {
    title: "Board Game AI Judge",
    description: "Rules questions answered from the official rulebook — no hallucination.",
    type: "website",
  },
};

export default function Home() {
  const games = getGames();
  return <ChatInterface games={games} />;
}
