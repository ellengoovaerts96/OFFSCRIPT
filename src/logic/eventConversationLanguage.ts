import { resolveConversationLanguage } from "../ai/detectLanguage.js";
import { getConversationContext, upsertConversationLanguage } from "../data/conversationContextRepository.js";

export async function rememberEventLanguage(userPhone: string, message: string): Promise<string> {
  let previousLanguage: string | undefined;
  try { previousLanguage = (await getConversationContext(userPhone))?.language; }
  catch (error) { console.error("Could not read event conversation language", error); }
  const language = resolveConversationLanguage(message, previousLanguage, "fr");
  try { await upsertConversationLanguage(userPhone, language); }
  catch (error) { console.error("Could not save event conversation language", error); }
  return language;
}
