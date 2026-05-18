import { readFileSync } from "node:fs";
import { join } from "node:path";

export const systemPrompt = readFileSync(
  join(process.cwd(), "prompts", "offscript-system-prompt.md"),
  "utf8"
);
