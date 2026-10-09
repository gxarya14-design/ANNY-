// FEATURE (real YouTube trend grounding): a separate, free, independent
// quota (10,000 units/day) from the YouTube Data API v3 -- used to ground
// title/tag/description suggestions in what is ACTUALLY ranking on YouTube
// right now, not just what a model infers from general web search.
export const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || "";

export type YouTubeTrendingItem = {
  title: string;
  channelTitle: string;
  viewCount?: string;
  likeCount?: string;
  publishedAt: string;
  tags?: string[];
  description: string;
};

export async function searchYouTubeTrending(query: string, regionCode: string = "IN", maxResults: number = 8): Promise<YouTubeTrendingItem[]> {
  if (!YOUTUBE_API_KEY) {
    return [];
  }
  try {
    const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    searchUrl.searchParams.set("part", "snippet");
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("type", "video");
    searchUrl.searchParams.set("order", "relevance");
    searchUrl.searchParams.set("regionCode", regionCode);
    searchUrl.searchParams.set("maxResults", String(maxResults));
    searchUrl.searchParams.set("key", YOUTUBE_API_KEY);

    const res = await fetch(searchUrl.toString());
    if (!res.ok) {
      console.warn(`[YOUTUBE API] Search failed HTTP ${res.status}: ${await res.text()}`);
      return [];
    }
    const data: any = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    return items.map((item: any) => ({
      title: item.snippet?.title || "",
      channelTitle: item.snippet?.channelTitle || "",
      publishedAt: item.snippet?.publishedAt || "",
      description: (item.snippet?.description || "").slice(0, 180),
    }));
  } catch (err) {
    console.warn("[YOUTUBE API] Trending search failed:", err);
    return [];
  }
}

export function formatYouTubeTrendingForPrompt(items: YouTubeTrendingItem[]): string {
  if (items.length === 0) return "";
  const lines = items.map((item, idx) =>
    `${idx + 1}. "${item.title}" by ${item.channelTitle} (${item.publishedAt.slice(0, 10)}) - ${item.description}`
  );
  return `=== CURRENT YOUTUBE SEARCH/TRENDING BENCHMARKS ===\n${lines.join("\n")}\n==================================================\n`;
}
