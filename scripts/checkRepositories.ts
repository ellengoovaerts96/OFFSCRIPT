import "dotenv/config";
import { getConversationContext, upsertConversationContext } from "../src/data/conversationContextRepository.js";
import { pool } from "../src/integrations/postgres.js";
import { listRecommendationPlaces } from "../src/data/placesRepository.js";

const demoPhone = "whatsapp:+000000000";

await upsertConversationContext(demoPhone, {
  language: "en",
  targetRegion: "Mbour",
  travellerType: "friends",
  hasChildren: false,
  intent: "culture",
  timing: "morning"
});

const context = await getConversationContext(demoPhone);
const places = await listRecommendationPlaces();

try {
  console.log(
    JSON.stringify(
      {
        context,
        recommendationPlaceCount: places.length,
        firstPlace: places[0]
          ? {
              name: places[0].name,
              region: places[0].region,
              categories: places[0].categories,
              status: places[0].status
            }
          : null
      },
      null,
      2
    )
  );
} finally {
  await pool.end();
}
