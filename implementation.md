# OFFSCRIPT — Implementation.md

## 1. Goal

This document turns `architecture.md` into a practical implementation plan for the OFFSCRIPT MVP.

OFFSCRIPT will start as a WhatsApp chatbot for travellers in Senegal. It will run on Railway, use Railway PostgreSQL as the source of truth, retrieve real places from the database, and use OpenAI only to understand user messages and write warm, natural replies.

The most important implementation rule:

> Facts come from PostgreSQL. Tone comes from AI.

---

## 2. MVP Build Scope

### Build Now

- Node.js / TypeScript backend
- Express API server
- Railway deployment
- Railway PostgreSQL database
- Twilio WhatsApp webhook
- OpenAI integration
- Place retrieval from PostgreSQL
- User context extraction
- Intent detection
- Clarifying question flow
- Recommendation scoring
- One-place recommendation flow
- Manual reservation request flow
- Conversation context stored by phone number

### Build Later

- Mobile app
- Public web app
- Full admin dashboard
- Payment flow
- Partner booking integrations
- Google Maps API lookup
- Voice messages
- Automatic image replies
- Advanced analytics

---

## 3. Project Setup

Create the project in `OFFSCRIPT`:

```sh
npm init -y
npm install express dotenv pg zod openai twilio
npm install -D typescript tsx @types/node @types/express
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

Add scripts to `package.json`:

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js"
  }
}
```

---

## 4. Environment Variables

Create `.env.example`:

```env
PORT=3000
NODE_ENV=development

DATABASE_URL=

OPENAI_API_KEY=
OPENAI_MODEL=

TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=
```

Railway will provide `DATABASE_URL` when PostgreSQL is attached to the project.

---

## 5. Folder Structure

Create this structure:

```txt
src/
  app.ts
  server.ts

  channels/
    whatsapp.ts
    webchat.ts

  ai/
    systemPrompt.ts
    detectLanguage.ts
    detectIntent.ts
    buildUserContext.ts
    generateAnswer.ts

  data/
    placesRepository.ts
    contactsRepository.ts
    reservationsRepository.ts
    conversationContextRepository.ts

  logic/
    scorePlace.ts
    selectBestPlace.ts
    needsClarification.ts
    buildClarifyingQuestion.ts
    chatbotFlow.ts

  integrations/
    postgres.ts
    twilio.ts
    openai.ts

  types/
    place.ts
    contact.ts
    userContext.ts
    reservation.ts

  utils/
    normalizeRegion.ts
    formatPhoneNumber.ts
    createWhatsAppLink.ts

prompts/
  offscript-system-prompt.md
  examples.md

data-samples/
  places.sample.json
  contacts.sample.json

migrations/
  001_initial_schema.sql
```

---

## 6. Database Implementation

Create `migrations/001_initial_schema.sql`.

Before creating UUID columns with `gen_random_uuid()`, enable the extension:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

Then create the MVP tables:

```sql
CREATE TABLE places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  country TEXT,
  region TEXT NOT NULL,
  neighbourhood TEXT,
  categories TEXT[] NOT NULL DEFAULT '{}',
  subcategories TEXT[] DEFAULT '{}',
  short_description TEXT NOT NULL,
  practical_info TEXT,
  personal_tip TEXT,
  transport TEXT,
  best_for TEXT[],
  not_ideal_for TEXT[],
  traveller_types TEXT[],
  child_friendly BOOLEAN DEFAULT false,
  child_notes TEXT,
  best_timing TEXT[],
  opening_hours TEXT,
  closed_days TEXT[],
  price_level TEXT,
  payment_notes TEXT,
  reservation_needed BOOLEAN DEFAULT false,
  reservation_method TEXT,
  reservation_contact_name TEXT,
  reservation_phone TEXT,
  reservation_url TEXT,
  google_maps_url TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  transport_notes TEXT,
  taxi_notes TEXT,
  parking_notes TEXT,
  safety_notes TEXT,
  guide_available BOOLEAN DEFAULT false,
  guide_name TEXT,
  guide_phone TEXT,
  guide_languages TEXT[],
  source TEXT,
  verified_by TEXT,
  last_verified_at DATE,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE place_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID REFERENCES places(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  alt_text TEXT,
  photographer TEXT,
  copyright_status TEXT,
  is_hero_image BOOLEAN DEFAULT false,
  caption TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE place_subcategories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(place_id, name)
);

CREATE TABLE place_subcategory_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_subcategory_id UUID NOT NULL REFERENCES place_subcategories(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  alt_text TEXT,
  photographer TEXT,
  copyright_status TEXT,
  usage_allowed BOOLEAN DEFAULT false,
  is_hero_image BOOLEAN DEFAULT false,
  caption TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

The database enforces a maximum of three `place_images` per place and three `place_subcategory_images` per subcategory.

CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT,
  phone TEXT,
  whatsapp TEXT,
  email TEXT,
  languages TEXT[],
  region TEXT,
  notes TEXT,
  trusted BOOLEAN DEFAULT false,
  last_verified_at DATE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID REFERENCES places(id),
  user_name TEXT,
  reservation_date DATE,
  reservation_time TIME,
  number_of_people INTEGER,
  children BOOLEAN DEFAULT false,
  phone TEXT,
  language TEXT,
  notes TEXT,
  status TEXT DEFAULT 'requested',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE conversation_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_phone TEXT NOT NULL UNIQUE,
  language TEXT,
  current_location TEXT,
  target_region TEXT,
  traveller_type TEXT,
  has_children BOOLEAN,
  children_ages TEXT,
  intent TEXT,
  timing TEXT,
  budget TEXT,
  vibe TEXT,
  safety_concern BOOLEAN,
  updated_at TIMESTAMP DEFAULT NOW()
);
```

Add useful indexes:

```sql
CREATE INDEX places_region_idx ON places(region);
CREATE INDEX places_neighbourhood_idx ON places(neighbourhood);
CREATE INDEX places_categories_idx ON places USING GIN(categories);
CREATE INDEX places_status_idx ON places(status);
CREATE INDEX conversation_context_user_phone_idx ON conversation_context(user_phone);
```

---

## 7. PostgreSQL Integration

Create `src/integrations/postgres.ts`:

```ts
import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined
});
```

All database access should go through repository files in `src/data`.

Do not query PostgreSQL directly from AI, channel or route files.

---

## 8. TypeScript Models

Create types that match the architecture models:

- `src/types/place.ts`
- `src/types/contact.ts`
- `src/types/userContext.ts`
- `src/types/reservation.ts`

Keep API/domain types in camelCase:

```ts
export type Place = {
  id: string;
  name: string;
  country: string;
  region: string;
  neighbourhood?: string;
  categories: ("food" | "bar" | "culture" | "beach" | "sports" | "nature" | "nightlife" | "shopping" | "stay" | "guide" | "other")[];
  subcategories: {
    id: string;
    name: string;
    description?: string;
    displayOrder: number;
    images: PlaceImage[];
  }[];
  shortDescription: string;
  practicalInfo?: string;
  personalTip?: string;
  transport?: string;
  bestFor: string[];
  notIdealFor?: string[];
  travellerTypes: string[];
  childFriendly: boolean;
  childNotes?: string;
  bestTiming: string[];
  openingHours?: string;
  closedDays?: string[];
  priceLevel?: "low" | "medium" | "high" | "luxury";
  reservationNeeded: boolean;
  reservationMethod?: "phone" | "whatsapp" | "instagram" | "website" | "manual" | "not_possible";
  reservationPhone?: string;
  reservationUrl?: string;
  googleMapsUrl: string;
  transportNotes?: string;
  safetyNotes?: string;
  guideAvailable: boolean;
  images: PlaceImage[];
  status: "draft" | "ready" | "premium" | "archived";
};
```

Repository files are responsible for mapping snake_case database columns into camelCase objects.

---

## 9. Repository Layer

### `placesRepository.ts`

Expose:

```ts
export async function listRecommendationPlaces(): Promise<Place[]>;
export async function getPlaceById(id: string): Promise<Place | null>;
```

Rules:

- return only `ready` and `premium` places
- exclude `draft` and `archived`
- prefer hero images in ordering
- never generate missing Google Maps URLs

The first query can be broad for the MVP:

```sql
SELECT *
FROM places
WHERE status IN ('ready', 'premium');
```

Then filter and score in TypeScript.

### `contactsRepository.ts`

Expose:

```ts
export async function listTrustedContacts(): Promise<Contact[]>;
```

Rules:

- only return contacts where `trusted = true`
- do not expose internal notes unless the reply explicitly needs them

### `reservationsRepository.ts`

Expose:

```ts
export async function createReservationRequest(input: ReservationRequest): Promise<void>;
```

This writes a row to `reservations` with status `requested`.

### `conversationContextRepository.ts`

Expose:

```ts
export async function getConversationContext(userPhone: string): Promise<UserContext | null>;
export async function upsertConversationContext(userPhone: string, context: UserContext): Promise<void>;
```

Use `user_phone` as the unique key.

---

## 10. AI Layer

Create `src/integrations/openai.ts`:

```ts
import OpenAI from "openai";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});
```

The AI layer has four jobs:

- detect language
- detect intent
- extract or update user context
- generate the final answer from selected database facts

The AI must not choose from the whole world. It can only phrase an answer from the selected place or ask a clarifying question.

---

## 11. System Prompt

Create `prompts/offscript-system-prompt.md`:

```md
You are OFFSCRIPT, a personal local travel guide for Senegal.

Always answer in the language used by the user.
You are warm, personal, practical and human.

Only recommend places that exist in the OFFSCRIPT database records provided to you.
Never invent places, phone numbers, opening hours, reservation information, Google Maps links, transport advice or guide contacts.

If the user is vague, ask for missing context before recommending.
If children are involved, only recommend child-friendly places.
If no good match exists, be honest and say OFFSCRIPT does not yet have a strong match.

Prefer one strong recommendation over many options.
```

Create `src/ai/systemPrompt.ts` and load this prompt as a constant.

---

## 12. User Context Extraction

Create `src/ai/buildUserContext.ts`.

Input:

```ts
type BuildUserContextInput = {
  message: string;
  previousContext?: UserContext | null;
};
```

Output:

```ts
type BuildUserContextResult = {
  context: UserContext;
  confidence: number;
};
```

Extraction rules:

- keep previous context unless the user changes it
- answer language should match the latest user message
- normalize known Senegal regions
- classify unclear intent as `other`
- classify unclear timing as `unknown`
- do not assume children are present
- do not assume a place is child-friendly

Validate AI JSON with Zod before using it.

---

## 13. Clarification Logic

Create `src/logic/needsClarification.ts`.

Return the first missing field in priority order:

```ts
export type MissingContextField =
  | "location"
  | "travellerType"
  | "children"
  | "intent"
  | "timing";
```

Clarification is needed when:

- no `targetRegion` or `currentLocation` exists
- `travellerType` is missing or `unknown`
- `travellerType` is `family` and `hasChildren` is unknown
- `intent` is missing or `other`
- `timing` is missing or `unknown`

Create `src/logic/buildClarifyingQuestion.ts`.

It should return one short, warm question in the user's language. Do not ask all five context questions at once.

---

## 14. Region Normalization

Create `src/utils/normalizeRegion.ts`.

Normalize common user inputs:

```ts
const REGION_ALIASES = {
  dakar: "Dakar",
  ngor: "Ngor",
  yoff: "Yoff",
  almadies: "Almadies",
  plateau: "Plateau",
  medina: "Médina",
  "médina": "Médina",
  "sacre coeur": "Sacré-Cœur",
  "sacré-cœur": "Sacré-Cœur",
  ouakam: "Ouakam",
  mamelles: "Mamelles",
  goree: "Île de Gorée",
  "gorée": "Île de Gorée",
  mbour: "Mbour",
  saly: "Saly",
  "saint-louis": "Saint-Louis",
  casamance: "Casamance",
  "lac rose": "Lac Rose"
};
```

Use this before scoring places.

---

## 15. Recommendation Scoring

Create `src/logic/scorePlace.ts`:

```ts
export function scorePlace(place: Place, context: UserContext): number {
  let score = 0;

  if (place.region === context.targetRegion || place.neighbourhood === context.targetRegion) score += 40;
  if (context.intent && place.categories.includes(context.intent)) score += 30;
  if (context.timing && place.bestTiming.includes(context.timing)) score += 15;
  if (context.travellerType && place.travellerTypes.includes(context.travellerType)) score += 10;
  if (context.hasChildren === true && place.childFriendly) score += 10;
  if (context.hasChildren === true && !place.childFriendly) score -= 50;
  if (place.status === "premium") score += 10;
  if (place.status === "archived") score -= 100;

  return score;
}
```

Create `src/logic/selectBestPlace.ts`:

```ts
const MIN_RECOMMENDATION_SCORE = 60;
```

Return `null` if the best match is below the threshold.

For families, hard-filter non-child-friendly places before scoring.

---

## 16. Answer Generation

Create `src/ai/generateAnswer.ts`.

Input:

```ts
type GenerateAnswerInput = {
  userMessage: string;
  context: UserContext;
  selectedPlace: Place;
};
```

Only pass the selected place to the model, not the full database.

The generated answer must include:

- place name
- why it fits
- personal tip if available
- reservation note if needed
- transport or safety note if available
- Google Maps URL

If a field is missing, omit it. Do not fill it in creatively.

---

## 17. No-Match Response

If no place passes the threshold, reply honestly:

```txt
I don’t have a strong OFFSCRIPT match for that yet. Tell me where you are and what kind of vibe you want, and I’ll try with what I do have.
```

Translate this naturally into the user's language.

Do not ask the model to suggest alternatives outside the database.

---

## 18. Main Chatbot Flow

Create `src/logic/chatbotFlow.ts`.

Flow:

```txt
Incoming message
  -> load previous conversation context by phone number
  -> extract updated context with AI
  -> save updated context
  -> check missing context
  -> if missing: return clarifying question
  -> load candidate places from PostgreSQL
  -> score places
  -> select best place
  -> if no match: return no-match response
  -> generate final answer from selected place
  -> return reply
```

Function shape:

```ts
export async function handleChatMessage(input: {
  userPhone: string;
  message: string;
}): Promise<{ reply: string }>;
```

---

## 19. Express API

Create `src/app.ts`:

```ts
import express from "express";

export const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});
```

Add these endpoints:

```txt
GET /health
POST /chat/test
POST /webhooks/twilio/whatsapp
```

`POST /chat/test` is for local development:

```json
{
  "userPhone": "+32000000000",
  "message": "We are in Almadies, two friends, tonight, looking for a local place to eat."
}
```

Return:

```json
{
  "reply": "..."
}
```

---

## 20. WhatsApp Channel

Create `src/channels/whatsapp.ts`.

Responsibilities:

- parse Twilio webhook body
- read `From` as the user phone
- read `Body` as the message
- call `handleChatMessage`
- return Twilio-compatible XML

Webhook route:

```txt
POST /webhooks/twilio/whatsapp
```

For Twilio replies, use:

```ts
import twilio from "twilio";

const response = new twilio.twiml.MessagingResponse();
response.message(reply);
res.type("text/xml").send(response.toString());
```

---

## 21. Reservation Flow

Detect reservation intent when:

- `intent` is `reservation`
- user says things like “can you book it?”, “reserve”, “make a reservation”
- user asks to contact a place after a recommendation

Collect:

- place
- date
- time
- number of people
- children yes/no
- name
- phone
- language
- notes

Ask one missing reservation detail at a time.

When complete:

- insert a row into `reservations`
- set status to `requested`
- tell the user the OFFSCRIPT team will handle it manually

---

## 22. Seed Data

Create a small seed file or manual SQL inserts for at least five places:

- food place in Ngor
- bar in Almadies
- beach or surf option in Yoff
- culture option in Plateau or Île de Gorée
- family-friendly option

Each place needs:

- name
- region or neighbourhood
- one or more categories
- optional subcategories
- short description
- personal tip
- traveller types
- child-friendly flag
- best timing
- reservation flag
- Google Maps URL
- status `ready`

Without seed data, the chatbot should mostly produce no-match responses, which makes testing hard.

---

## 23. Railway Deployment

In Railway:

1. Create a new project.
2. Add PostgreSQL.
3. Add the Node.js backend service.
4. Set environment variables.
5. Run the SQL migration against the Railway database.
6. Deploy the backend.
7. Confirm `/health` returns `{ "ok": true }`.
8. Configure the Twilio WhatsApp webhook URL.

Webhook URL:

```txt
https://your-railway-app.up.railway.app/webhooks/twilio/whatsapp
```

---

## 24. Manual Test Checklist

### Health Check

Request:

```txt
GET /health
```

Expected:

```json
{ "ok": true }
```

### Vague Request

Input:

```txt
What can I do tonight?
```

Expected:

- asks for location
- does not recommend a place yet

### Clear Food Request

Input:

```txt
We are in Almadies, two friends, tonight, looking for a local place to eat.
```

Expected:

- recommends one strong match
- includes why it fits
- includes personal tip if available
- includes reservation note if needed
- includes Google Maps link

### Family Request

Input:

```txt
We are in Ngor with kids and want something relaxed this afternoon.
```

Expected:

- asks children ages if needed
- only recommends child-friendly places

### No-Match Request

Input:

```txt
Can you recommend a hidden jazz bar in Saint-Louis tonight?
```

Expected:

- says OFFSCRIPT does not yet have a strong match if none exists
- does not invent a jazz bar

### Multilingual Requests

Input:

```txt
On est à Dakar, deux amies, on cherche un endroit local pour manger ce soir.
```

Expected:

- answers in French

Input:

```txt
We zijn in Ngor en zoeken iets leuks met kinderen.
```

Expected:

- answers in Dutch

---

## 25. Acceptance Criteria

The MVP is ready for pilot testing when:

- Railway backend is deployed
- Railway PostgreSQL contains real place data
- `/health` works in production
- `/chat/test` works with seeded data
- Twilio WhatsApp webhook works end to end
- the bot answers in the user's language
- vague requests trigger clarification
- clear requests return one recommendation
- every recommendation uses database data only
- every recommendation includes a Google Maps URL
- family requests never return non-child-friendly places
- reservation requests are saved to PostgreSQL
- no-match replies are honest and friendly

---

## 26. First Build Order

Build in this order:

1. Create Node.js / TypeScript project
2. Add Express server and `/health`
3. Add PostgreSQL connection
4. Add migration SQL
5. Add TypeScript types
6. Add repositories
7. Add sample or seed data
8. Add scoring logic
9. Add clarification logic
10. Add `/chat/test`
11. Add OpenAI context extraction
12. Add OpenAI answer generation
13. Add conversation context persistence
14. Add Twilio webhook
15. Add reservation flow
16. Deploy to Railway
17. Run pilot tests

---

## 27. Development Principle

Keep the system simple and trustworthy.

The database decides what exists.  
The scoring logic decides what fits.  
The AI decides how to say it warmly.  
The bot should never pretend to know more than OFFSCRIPT has verified.
