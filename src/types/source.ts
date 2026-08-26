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
