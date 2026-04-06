import { getGames } from "@/app/_lib/games";

export async function GET() {
  return Response.json({ games: getGames() });
}
