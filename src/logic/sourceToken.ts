import { getSourceByCode } from "../data/sourcesRepository.js";
import { setFirstTouchAcquisition } from "../data/whatsappUsersRepository.js";
import type { AcquisitionSource } from "../types/source.js";

const SOURCE_TOKEN_PATTERN = /\bSRC:([A-Za-z0-9_-]+)\b/i;
const TUUTI_START_PREFIX_PATTERN = /^\s*Start TUUTI\s*[·\-–—:]?\s*/i;

export type ParsedSourceMessage = {
  message: string;
  sourceCode?: string;
};

export function parseSourceToken(message: string): ParsedSourceMessage {
  const match = SOURCE_TOKEN_PATTERN.exec(message);
  if (!match) return { message };

  const withoutToken = `${message.slice(0, match.index)}${message.slice(match.index + match[0].length)}`;
  const withoutLauncher = withoutToken.replace(TUUTI_START_PREFIX_PATTERN, "");
  const cleanedMessage = withoutLauncher.replace(/^\s*[·\-–—:]\s*/, "").trim();

  return {
    message: cleanedMessage || "Start OFFSCRIPT",
    sourceCode: match[1]
  };
}

type SourceTokenDependencies = {
  findSourceByCode?: (code: string) => Promise<AcquisitionSource | null>;
  applyFirstTouch?: (userPhone: string, source: AcquisitionSource) => Promise<unknown>;
};

export async function preprocessSourceMessage(
  userPhone: string,
  message: string,
  dependencies: SourceTokenDependencies = {}
): Promise<ParsedSourceMessage> {
  const parsed = parseSourceToken(message);
  if (!parsed.sourceCode) return parsed;

  const findSourceByCode = dependencies.findSourceByCode ?? getSourceByCode;
  const applyFirstTouch = dependencies.applyFirstTouch ?? setFirstTouchAcquisition;
  const source = await findSourceByCode(parsed.sourceCode);

  if (source?.active) {
    await applyFirstTouch(userPhone, source);
  }

  return parsed;
}
