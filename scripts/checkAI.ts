import "dotenv/config";
import { buildUserContext } from "../src/ai/buildUserContext.js";
import { generateAnswer } from "../src/ai/generateAnswer.js";
import { listRecommendationPlaces } from "../src/data/placesRepository.js";
import { pool } from "../src/integrations/postgres.js";
import { hasOpenAIKey } from "../src/integrations/openai.js";
import { selectBestPlace } from "../src/logic/selectBestPlace.js";

const message = "We are in Mbour with friends, no children, looking for culture in the morning";

try {
  const { context, confidence } = await buildUserContext({ message });
  const places = await listRecommendationPlaces();
  const selection = selectBestPlace(places, context);
  const answer = selection
    ? await generateAnswer({
        userMessage: message,
        context,
        selectedPlace: selection.place
      })
    : null;

  console.log(
    JSON.stringify(
      {
        openAIConfigured: hasOpenAIKey(),
        context,
        confidence,
        selectedPlace: selection?.place.name ?? null,
        score: selection?.score ?? null,
        answer
      },
      null,
      2
    )
  );
} finally {
  await pool.end();
}
