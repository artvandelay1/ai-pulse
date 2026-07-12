import NewsFeed from "@/components/NewsFeed.tsx";
import { fetchAllSources } from "@/lib/sources/index.ts";

// ISR: the page is statically served and re-fetched at most every 30 minutes.
export const revalidate = 1800;

export default async function Home() {
  const sources = await fetchAllSources();
  return <NewsFeed sources={sources} generatedAt={new Date().toISOString()} />;
}
