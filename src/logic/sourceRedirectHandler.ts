import { getSourceBySlug } from "../data/sourcesRepository.js";
import type { AcquisitionSource } from "../types/source.js";
import { buildSourceWhatsAppUrl } from "./sourceRedirect.js";

type SourceRedirectDependencies = {
  findSourceBySlug?: (slug: string) => Promise<AcquisitionSource | null>;
  buildWhatsAppUrl?: (source: AcquisitionSource) => string | null;
};

type SourceRedirectRequest = {
  params: { slug?: string };
};

type SourceRedirectResponse = {
  status: (code: number) => SourceRedirectResponse;
  send: (body: string) => unknown;
  redirect: (code: number, location: string) => unknown;
};

export async function handleSourceRedirect(
  req: SourceRedirectRequest,
  res: SourceRedirectResponse,
  dependencies: SourceRedirectDependencies = {}
): Promise<void> {
  const findSourceBySlug = dependencies.findSourceBySlug ?? getSourceBySlug;
  const buildWhatsAppUrl = dependencies.buildWhatsAppUrl ?? buildSourceWhatsAppUrl;

  try {
    const slug = String(req.params.slug ?? "").trim();
    const source = slug ? await findSourceBySlug(slug) : null;

    if (!source?.active) {
      res.status(404).send("This TUUTI link is not available.");
      return;
    }

    const whatsAppUrl = buildWhatsAppUrl(source);
    if (!whatsAppUrl) {
      console.error("TUUTI WhatsApp redirect is not configured.");
      res.status(503).send("TUUTI WhatsApp is temporarily unavailable.");
      return;
    }

    res.redirect(302, whatsAppUrl);
  } catch (error) {
    console.error("Source redirect failed", error);
    res.status(500).send("This TUUTI link could not be opened.");
  }
}
