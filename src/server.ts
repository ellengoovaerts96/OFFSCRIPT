import "dotenv/config";
import { app } from "./app.js";

import { startFieldResearchAutomation } from "./services/fieldResearchSync.js";

const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  console.log(`OFFSCRIPT listening on port ${port}`);
  startFieldResearchAutomation();
});
