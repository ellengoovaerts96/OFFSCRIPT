export const SOURCE_TYPES = ["accommodation", "partner", "campaign", "other"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export type AcquisitionSource = {
  id: string;
  code: string;
  slug: string;
  sourceType: string;
  name: string;
  homeNeighbourhood?: string;
  latitude?: number;
  longitude?: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SourceAcquisitionSummary = AcquisitionSource & {
  acquiredUserCount: number;
  firstAcquiredAt?: string;
  latestAcquiredAt?: string;
};

export type SourceFilters = {
  search?: string;
  active?: boolean;
  sourceType?: string;
  neighbourhood?: string;
};

export type SourceWriteInput = {
  name: string;
  sourceType: SourceType;
  slug: string;
  homeNeighbourhood?: string;
  latitude?: number;
  longitude?: number;
  active: boolean;
};
