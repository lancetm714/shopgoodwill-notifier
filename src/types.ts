export interface QueryConfig {
  name: string;
  searchText: string;
  lowPrice?: number;
  highPrice?: number;
  selectedCategoryIds?: string;
  selectedSellerIds?: string;
  searchBuyNowOnly?: boolean;
  searchPickupOnly?: boolean;
  searchOneCentShippingOnly?: boolean;
  searchDescriptions?: boolean;
  searchCanadaShipping?: boolean;
  searchUSOnlyShipping?: boolean;
  searchInternationalShippingOnly?: boolean;
  maxPages?: number;
}

export interface SmtpSettings {
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  from?: string;
  to?: string;
}

export interface AppConfig {
  pollIntervalSeconds: number;
  pageSize: number;
  maxPages: number;
  seenFile: string;
  historyFile: string;
  smtp?: SmtpSettings;
  queries: QueryConfig[];
}

export interface ItemListing {
  itemId: number;
  title: string;
  currentPrice: number;
  numBids: number;
  minimumBid: number;
  buyNowPrice: number;
  startTime: string;
  endTime: string;
  imageURL: string;
  sellerId: number;
  categoryId: number;
  categoryName: string;
  catFullName: string;
  listingType: number;
  remainingTime: string;
}

export interface SearchResponse {
  searchResults: {
    items: ItemListing[];
    itemCount: number;
  };
  [key: string]: unknown;
}

export interface HistoryEntry {
  id: string;
  queryName: string;
  searchText: string;
  itemId: number;
  title: string;
  currentPrice: number;
  numBids: number;
  imageURL: string;
  listingUrl: string;
  foundAt: string;
  notified: boolean;
}

export interface QueryStatus {
  name: string;
  searchText: string;
  lastCheckAt: string | null;
  lastError: string | null;
  lastNewCount: number;
  lastTotalChecked: number;
}
