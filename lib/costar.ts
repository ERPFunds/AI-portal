import { ApifyClient } from "apify-client";

export interface CoStarComp {
  address: string;
  submarket: string;
  saleDate: string;
  sizeSF: string;
  salePrice: string;
  pricePerSF: string;
  capRate: string;
  buyerType: string;
  source: string;
}

export interface CoStarResult {
  available: boolean;
  comps: CoStarComp[];
  rawText: string;
}

const COSTAR_ACTOR = process.env.APIFY_COSTAR_ACTOR ?? "";

export async function fetchCoStarComps(params: {
  market: string;
  assetType: string;
  maxResults?: number;
}): Promise<CoStarResult> {
  if (!COSTAR_ACTOR || !process.env.APIFY_API_TOKEN) {
    return { available: false, comps: [], rawText: "" };
  }

  try {
    const apify = new ApifyClient({ token: process.env.APIFY_API_TOKEN });
    const run = await apify.actor(COSTAR_ACTOR).call({
      searchQuery: `${params.assetType} sale comps ${params.market}`,
      market: params.market,
      propertyType: params.assetType,
      maxResults: params.maxResults ?? 25,
    });

    const { items } = await apify.dataset(run.defaultDatasetId).listItems();

    const comps: CoStarComp[] = (items as any[]).map((i) => ({
      address:    i.address ?? i.propertyAddress ?? "—",
      submarket:  i.submarket ?? i.market ?? params.market,
      saleDate:   i.saleDate ?? i.closingDate ?? "—",
      sizeSF:     i.buildingSize ?? i.sizeSF ?? "—",
      salePrice:  i.salePrice ?? i.totalPrice ?? "—",
      pricePerSF: i.pricePerSF ?? i.psf ?? "—",
      capRate:    i.capRate ?? "—",
      buyerType:  i.buyerType ?? i.buyer ?? "—",
      source:     "CoStar (Apify)",
    }));

    const rawText = comps.length > 0
      ? comps.map((c) =>
          `${c.address} | ${c.submarket} | ${c.saleDate} | ${c.sizeSF} SF | ${c.salePrice} | ${c.pricePerSF}/SF | Cap: ${c.capRate} | Buyer: ${c.buyerType}`
        ).join("\n")
      : "";

    return { available: true, comps, rawText };
  } catch {
    return { available: false, comps: [], rawText: "" };
  }
}
