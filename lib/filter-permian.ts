import type { FeedItem } from "./rss";

const PERMIAN_KEYWORDS = [
  "permian",
  "permian basin",
  "west texas",
  "midland",
  "odessa",
  "delaware basin",
  "industrial cre",
  "industrial real estate",
  "warehouse",
  "logistics",
  "distribution center",
  "oilfield services",
  "upstream",
  "midstream",
  "lng",
  "frac",
  "completion",
  "drilling",
  "shale",
];

export function isPermianRelevant(item: FeedItem): boolean {
  const text = `${item.title} ${item.summary ?? ""}`.toLowerCase();
  return PERMIAN_KEYWORDS.some((kw) => text.includes(kw));
}
