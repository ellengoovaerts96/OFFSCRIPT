const DEFAULT_PRODUCTION_ORIGIN = "https://offscript-production-126f.up.railway.app";

function origin(value: string | undefined, fallback: string): string {
  const configured = value?.trim();
  if (!configured) return fallback;
  try {
    return new URL(configured).origin;
  } catch {
    return fallback;
  }
}

export type DashboardConfig = {
  environment: string;
  productionOrigin: string;
  stagingOrigin: string | null;
  fieldResearchFormUrl: string;
  fieldResearchInboxUrl: string;
};

export function dashboardConfig(): DashboardConfig {
  const environment = (
    process.env.TUUTI_ENVIRONMENT ??
    process.env.RAILWAY_ENVIRONMENT_NAME ??
    "UNKNOWN"
  ).trim().toUpperCase();
  const configuredStagingOrigin = process.env.TUUTI_STAGING_BASE_URL?.trim();
  return {
    environment,
    productionOrigin: origin(process.env.TUUTI_PRODUCTION_BASE_URL, DEFAULT_PRODUCTION_ORIGIN),
    stagingOrigin: environment === "STAGING"
      ? ""
      : configuredStagingOrigin ? origin(configuredStagingOrigin, "") : null,
    fieldResearchFormUrl: "https://docs.google.com/forms/d/e/1FAIpQLSf4peskEjpWw_4nN5qVOSk6VHOeO-EcbrIXSRjYS2vIsXVOIA/viewform",
    fieldResearchInboxUrl: "https://docs.google.com/spreadsheets/d/1pZbYXP6VhNgtvnd2xswfKz3dUyuSM0aH-d_2cFRqY5c/edit?gid=401365039#gid=401365039"
  };
}
