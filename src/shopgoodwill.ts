const API_ROOT = "https://buyerapi.shopgoodwill.com/api";
const SEARCH_ENDPOINT = `${API_ROOT}/Search/ItemListing`;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const DEFAULT_QUERY = {
  isSize: false,
  isWeddingCatagory: "false",
  isMultipleCategoryIds: false,
  isFromHeaderMenuTab: false,
  layout: "",
  selectedGroup: "",
  selectedCategoryIds: "",
  selectedSellerIds: "",
  lowPrice: "0",
  highPrice: "999999",
  searchBuyNowOnly: "",
  searchPickupOnly: "false",
  searchNoPickupOnly: "false",
  searchOneCentShippingOnly: "false",
  searchDescriptions: "false",
  searchClosedAuctions: "false",
  closedAuctionEndingDate: "2/13/2022",
  closedAuctionDaysBack: "7",
  searchCanadaShipping: "false",
  searchInternationalShippingOnly: "false",
  sortColumn: "0",
  sortDescending: "true",
  savedSearchId: 0,
  useBuyerPrefs: "true",
  searchUSOnlyShipping: "false",
  categoryLevelNo: "1",
  categoryLevel: 1,
  categoryId: 0,
  partNumber: "",
  catIds: "",
};

export function buildQueryBody(
  query: import("./types.js").QueryConfig,
  page: number,
  pageSize: number,
): Record<string, unknown> {
  const body: Record<string, unknown> = { ...DEFAULT_QUERY };

  body.searchText = query.searchText.replace(/"/g, "");
  body.page = page;
  body.pageSize = pageSize;

  if (query.lowPrice !== undefined) body.lowPrice = String(query.lowPrice);
  if (query.highPrice !== undefined) body.highPrice = String(query.highPrice);
  if (query.selectedCategoryIds !== undefined) {
    body.selectedCategoryIds = query.selectedCategoryIds;
  }
  if (query.selectedSellerIds !== undefined) {
    body.selectedSellerIds = query.selectedSellerIds;
  }
  if (query.searchBuyNowOnly !== undefined) {
    body.searchBuyNowOnly = query.searchBuyNowOnly ? "true" : "";
  }
  if (query.searchPickupOnly !== undefined) {
    body.searchPickupOnly = query.searchPickupOnly ? "true" : "false";
  }
  if (query.searchOneCentShippingOnly !== undefined) {
    body.searchOneCentShippingOnly = query.searchOneCentShippingOnly
      ? "true"
      : "false";
  }
  if (query.searchDescriptions !== undefined) {
    body.searchDescriptions = query.searchDescriptions ? "true" : "false";
  }
  if (query.searchCanadaShipping !== undefined) {
    body.searchCanadaShipping = query.searchCanadaShipping ? "true" : "false";
  }
  if (query.searchUSOnlyShipping !== undefined) {
    body.searchUSOnlyShipping = query.searchUSOnlyShipping ? "true" : "false";
  }
  if (query.searchInternationalShippingOnly !== undefined) {
    body.searchInternationalShippingOnly =
      query.searchInternationalShippingOnly ? "true" : "false";
  }

  return body;
}

export async function searchListings(
  query: import("./types.js").QueryConfig,
  pageSize: number,
  maxPages: number,
): Promise<import("./types.js").ItemListing[]> {
  const results: import("./types.js").ItemListing[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const body = buildQueryBody(query, page, pageSize);
    const response = await fetch(SEARCH_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(
        `ShopGoodwill API error (HTTP ${response.status}) for query "${query.name}"`,
      );
    }

    const data = (await response.json()) as import("./types.js").SearchResponse;
    const items = data.searchResults?.items ?? [];

    if (items.length === 0) {
      break;
    }

    results.push(...items);

    if (results.length >= data.searchResults.itemCount) {
      break;
    }
  }

  return results;
}

export function listingUrl(itemId: number): string {
  return `https://shopgoodwill.com/item/${itemId}`;
}
