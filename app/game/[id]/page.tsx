import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getGames } from "@/app/_lib/games";
import ChatInterface from "@/app/_components/ChatInterface";

type Props = { params: Promise<{ id: string }> };

export async function generateStaticParams() {
  return getGames().map((g) => ({ id: g.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const games = getGames();
  const game = games.find((g) => g.id === id);
  if (!game) return {};

  return {
    title: `${game.label} Rules`,
    description: `Ask rules questions about ${game.label} and get answers grounded in the official rulebook. No hallucination — every answer cites the exact rule.`,
    keywords: [
      `${game.label} rules`,
      `${game.label} board game`,
      `how to play ${game.label}`,
      `${game.label} rulebook`,
      "board game rules AI",
    ],
    openGraph: {
      title: `${game.label} Rules — Board Game AI Judge`,
      description: `Rules questions about ${game.label} answered from the official rulebook.`,
      type: "website",
    },
  };
}

export default async function GamePage({ params }: Props) {
  const { id } = await params;
  const games = getGames();
  const game = games.find((g) => g.id === id);
  if (!game) notFound();

  return <ChatInterface games={games} initialGameId={id} />;
}
