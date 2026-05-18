# OFFSCRIPT — Architecture.md

## 1. Product Vision

OFFSCRIPT is a personal travel guide chatbot for tourists in Senegal.  
It helps travellers discover hidden gems, local places, cultural experiences, food, bars, beaches, sports, guides and practical tips.

The chatbot should not feel like a generic chatbot.  
It should feel like a warm, well-informed local friend who knows Senegal and gives personal, curated advice.

The first pilot region is Senegal, with an initial focus on Dakar and coastal neighbourhoods such as Ngor, Yoff, Almadies, Sacré-Cœur and other relevant zones.

---

## 2. Core Principles

### 2.1 Human Tone

The chatbot should answer like a personal friend:

- warm
- natural
- practical
- slightly humorous when appropriate
- never robotic
- never too long unless the user asks for detail
- confident, but honest when information is missing

Example tone:

> “I’d send you to this place first. It’s not the obvious tourist choice, but it has exactly the right energy for tonight.”

---

### 2.2 Language Behaviour

The application answers in the same language as the user.

Examples:

- User asks in Dutch → answer in Dutch
- User asks in English → answer in English
- User asks in French → answer in French
- User asks in Spanish → answer in Spanish

The internal data can be stored in English, Dutch or French, but the final user-facing answer must be translated naturally into the user’s language.

---

### 2.3 Local-First Information

The chatbot only recommends places and experiences that are stored in the OFFSCRIPT database.

It should not invent places, opening hours, phone numbers, prices, guides, transport options or personal recommendations.

If no good match exists, it should say something friendly and honest:

> “I don’t have a strong hidden-gem match for that yet. Tell me where you are, and I’ll try to guide you with what I do know.”

---

## 3. Main User Flows

### 3.1 Vague Request Flow

When the user is vague, the chatbot must ask follow-up questions before recommending a place.

Examples of vague requests:

- “What can I do tonight?”
- “Where should we eat?”
- “Any nice hidden gems?”
- “I want to go somewhere local.”

Required clarification:

1. Where are you now, or where do you want to go?
2. Who are you travelling with?
3. Are there children with you?
4. What kind of thing are you looking for?
5. When do you want to go?

Example answer:

> “Yes — I can help. Where are you now: Ngor, Yoff, Almadies, Plateau, Sacré-Cœur, or somewhere else? And are you solo, with friends, as a couple, or travelling with children?”

---

### 3.2 Clear Request Flow

When the user gives enough context, the chatbot can recommend one strong match.

Example:

> “We are in Almadies, two friends, tonight, looking for a local place to eat.”

The chatbot should:

1. Detect region: Almadies
2. Detect traveller type: friends
3. Detect moment: evening
4. Detect intent: food
5. Check whether reservation is needed
6. Return one strong recommendation
7. Include Google Maps link
8. Add personal tip
9. Add transport/reservation/contact info if available

---

## 4. User Context To Collect

The chatbot should collect these fields during the conversation.

```ts
type UserContext = {
  language: string;
  currentLocation?: string;
  targetRegion?: string;
  travellerType?: "solo" | "couple" | "friends" | "family" | "group" | "business" | "unknown";
  hasChildren?: boolean;
  childrenAges?: string;
  intent?: "food" | "bar" | "culture" | "beach" | "sports" | "nature" | "nightlife" | "shopping" | "guide" | "transport" | "other";
  timing?: "morning" | "afternoon" | "sunset" | "evening" | "night" | "now" | "tomorrow" | "weekend" | "unknown";
  budget?: "low" | "medium" | "high" | "luxury" | "unknown";
  vibe?: string;
  mobilityNeeds?: string;
  safetyConcern?: boolean;
};
```

---

## 5. Intent Detection

The chatbot should classify the user’s message into one main intent.

```ts
type Intent =
  | "food"
  | "bar"
  | "culture"
  | "beach"
  | "sports"
  | "nature"
  | "nightlife"
  | "shopping"
  | "guide"
  | "transport"
  | "reservation"
  | "family"
  | "safety"
  | "other";
```

### Intent Examples

| User says | Intent |
|---|---|
| “Where can we eat?” | food |
| “A nice bar tonight?” | bar |
| “Live music?” | nightlife |
| “Something with kids?” | family |
| “Can I surf?” | sports |
| “A local market?” | culture/shopping |
| “How do I get there?” | transport |
| “Can you book it?” | reservation |

---

## 6. Region Logic

The application works by region.

A recommendation should only be given if the region is known or can be confidently inferred.

Examples of regions:

- Dakar
- Ngor
- Yoff
- Almadies
- Plateau
- Médina
- Sacré-Cœur
- Ouakam
- Mamelles
- Île de Gorée
- Mbour
- Saly
- Saint-Louis
- Casamance
- Lac Rose

If the region is missing:

> “Where are you now, or where do you want to go? Dakar is very different depending on whether you’re in Ngor, Yoff, Almadies, Plateau or somewhere else.”

---

## 7. Traveller Type Logic

The chatbot should adapt recommendations depending on who is travelling.

### Traveller Types

- solo traveller
- couple
- friends
- family
- group
- business traveller
- older traveller
- first-time Africa traveller
- luxury traveller
- adventurous traveller

### Children Are Important

If the user is travelling as a family, always ask:

> “Are there children with you? And roughly how old are they?”

Child-friendly places must be explicitly marked in the database.

Do not assume a place is child-friendly unless this is stored.

---

## 8. Timing Logic

Timing changes the recommendation.

The database should store whether a place is suitable for:

- morning
- afternoon
- sunset
- evening
- night
- weekend
- rainy day
- today/now

Example:

A place can be great for sunset but not suitable late at night.

If timing is missing:

> “When do you want to go — now, during the day, sunset, evening or later tonight?”

---

## 9. Data Model

The core database is `places`.

```ts
type Place = {
  id: string;
  name: string;
  region: string;
  neighbourhood?: string;
  country: "Senegal";
  categories: ("food" | "bar" | "culture" | "beach" | "sports" | "nature" | "nightlife" | "shopping" | "stay" | "guide" | "other")[];
  subcategories: string[];
  shortDescription: string;
  longDescription?: string;
  personalTip?: string;
  whyHiddenGem?: string;
  bestFor: string[];
  notIdealFor?: string[];
  travellerTypes: string[];
  childFriendly: boolean;
  childNotes?: string;
  bestTiming: string[];
  openingHours?: string;
  closedDays?: string[];
  priceLevel?: "low" | "medium" | "high" | "luxury";
  paymentNotes?: string;
  reservationNeeded: boolean;
  reservationMethod?: "phone" | "whatsapp" | "instagram" | "website" | "manual" | "not_possible";
  reservationContactName?: string;
  reservationPhone?: string;
  reservationUrl?: string;
  googleMapsUrl: string;
  latitude?: number;
  longitude?: number;
  transportNotes?: string;
  taxiNotes?: string;
  parkingNotes?: string;
  safetyNotes?: string;
  guideAvailable: boolean;
  guideName?: string;
  guidePhone?: string;
  guideLanguages?: string[];
  images: PlaceImage[];
  source: "field_research" | "local_contact" | "owner" | "personal_visit" | "other";
  verifiedBy?: string;
  lastVerifiedAt?: string;
  status: "draft" | "ready" | "premium" | "archived";
};
```

---

## 10. Image Model

Each place can have multiple images.

```ts
type PlaceImage = {
  id: string;
  placeId: string;
  url: string;
  altText: string;
  photographer?: string;
  copyrightStatus: "owned" | "permission_given" | "unknown";
  usageAllowed: boolean;
  isHeroImage: boolean;
  caption?: string;
};
```

Rules:

- Never show an image if `usageAllowed` is false.
- Prefer the hero image if available.
- Every image needs alt text.
- Store images in a stable location such as Cloudinary, Supabase Storage or another image CDN.

---

## 11. Contact Model

Contacts can be guides, drivers, restaurant owners, fixers, surf instructors, artists, cultural contacts or reservation contacts.

```ts
type Contact = {
  id: string;
  name: string;
  role: "guide" | "driver" | "owner" | "artist" | "instructor" | "reservation" | "local_contact" | "other";
  phone?: string;
  whatsapp?: string;
  email?: string;
  languages?: string[];
  region?: string;
  notes?: string;
  trusted: boolean;
  lastVerifiedAt?: string;
};
```

---

## 12. Reservation Logic

If a place needs reservation, the chatbot should clearly say so.

Example:

> “You should reserve this one, especially in the evening. I have a WhatsApp contact for them.”

Possible reservation methods:

1. WhatsApp link
2. Phone number
3. Instagram DM
4. Website link
5. Manual OFFSCRIPT concierge request

### Reservation Action Model

```ts
type ReservationRequest = {
  placeId: string;
  userName?: string;
  date: string;
  time: string;
  numberOfPeople: number;
  children?: boolean;
  phone?: string;
  language: string;
  notes?: string;
  status: "requested" | "sent" | "confirmed" | "declined" | "cancelled";
};
```

In the MVP, reservation can be manual: the chatbot collects the details and sends them to the OFFSCRIPT team.

---

## 13. Recommendation Logic

The chatbot should score places based on context.

Important matching fields:

1. Region
2. Intent
3. Timing
4. Traveller type
5. Children
6. Safety
7. Reservation availability
8. Hidden-gem value
9. Verification status

### Basic Scoring Idea

```ts
function scorePlace(place: Place, context: UserContext): number {
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

---

## 14. Answer Format

The chatbot should usually recommend one strong place, not a long list.

### Standard Answer Format

```md
I’d go for: [Place Name]

Why this fits:
[Short reason based on user context]

Personal tip:
[Personal tip from database]

Good to know:
[Reservation, timing, transport or safety note]

Location:
[Google Maps link]
```

### Example Answer

```md
I’d go for Chez X in Ngor.
It fits because you’re with friends, it’s evening, and you want something local but still relaxed.

Personal tip: go a little before sunset — the light is beautiful and it feels less touristy.

You should reserve if you want to eat after 20:00.

Location: Google Maps link
```

---

## 15. Prompt Rules For The AI

These rules should be included in the system prompt of the chatbot.

```md
You are OFFSCRIPT, a personal local travel guide for Senegal.
You help travellers discover hidden gems, local experiences, food, bars, culture, beaches, sports, guides and practical tips.
Always answer in the language used by the user.
You are warm, personal, practical and human. You do not sound like a generic chatbot.
Only recommend places that exist in the OFFSCRIPT database.
Never invent places, phone numbers, opening hours, reservation information, Google Maps links, transport advice or guide contacts.
If the user is vague, ask for missing context before recommending:
- location or desired region
- traveller type
- whether children are travelling
- timing
- type of experience wanted
If children are involved, only recommend child-friendly places.
If no good match exists, be honest and say that OFFSCRIPT does not yet have a strong match.
Prefer one strong recommendation over many options.
Always include:
- why this place fits
- personal tip if available
- Google Maps link
- reservation info if relevant
- transport/contact info if available
```

---

## 16. MVP Architecture

Recommended MVP stack:

```md
Frontend / Channel:
- WhatsApp Business via Twilio
- Later: web chat widget or mobile app

Backend / Deployment:
- Railway
- Node.js / TypeScript backend
- Express or Next.js API routes

Database:
- Railway PostgreSQL
- PostgreSQL is the central OFFSCRIPT database
- The chatbot retrieves places, contacts, images, reservations and user context from PostgreSQL

AI:
- OpenAI API
- System prompt with OFFSCRIPT rules
- Retrieval from Railway PostgreSQL before answering

Images:
- Store image URLs in PostgreSQL
- Images can be hosted on Cloudinary, Supabase Storage, S3 or another image CDN
- In the MVP, manually stored image URLs are enough

Maps:
- Google Maps URLs stored manually per place
- Later: Google Maps API if needed

Reservations:
- MVP: manual request flow stored in PostgreSQL
- Later: direct partner integration
```

### Railway Architecture Flow

```txt
User on WhatsApp
↓
Twilio WhatsApp webhook
↓
Railway backend
↓
Railway PostgreSQL
↓
OpenAI response generation
↓
Railway backend
↓
Twilio
↓
User receives personal OFFSCRIPT answer
```

Railway is where the OFFSCRIPT application runs.  
Railway PostgreSQL is where the real OFFSCRIPT data lives.

---

## 17. Suggested Folder Structure

```txt
offscript/
  README.md
  architecture.md
  .env.example
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
    logic/
      scorePlace.ts
      selectBestPlace.ts
      needsClarification.ts
      buildClarifyingQuestion.ts
    integrations/
      railway.ts
      postgres.ts
      twilio.ts
      googleMaps.ts
      cloudinary.ts
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
```

---

## 18. Railway PostgreSQL Database Setup For MVP

OFFSCRIPT should use Railway PostgreSQL as the central database.

The most important tables are:

- `places`
- `place_images`
- `contacts`
- `reservations`
- `users`
- `conversation_context`

### Table: `places`

```sql
CREATE TABLE places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  country TEXT DEFAULT 'Senegal',
  region TEXT NOT NULL,
  neighbourhood TEXT,
  categories TEXT[] NOT NULL DEFAULT '{}',
  subcategories TEXT[] DEFAULT '{}',
  short_description TEXT NOT NULL,
  long_description TEXT,
  personal_tip TEXT,
  why_hidden_gem TEXT,
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
```

### Table: `place_images`

```sql
CREATE TABLE place_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID REFERENCES places(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  alt_text TEXT,
  photographer TEXT,
  copyright_status TEXT,
  usage_allowed BOOLEAN DEFAULT false,
  is_hero_image BOOLEAN DEFAULT false,
  caption TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Table: `contacts`

```sql
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
```

### Table: `reservations`

```sql
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
```

### Table: `conversation_context`

```sql
CREATE TABLE conversation_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_phone TEXT NOT NULL,
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

---

## 19. Place Example

```json
{
  "id": "place_001",
  "name": "Example Hidden Courtyard Café",
  "country": "Senegal",
  "region": "Dakar",
  "neighbourhood": "Ngor",
  "categories": ["food", "bar"],
  "subcategories": ["local café"],
  "shortDescription": "A quiet local courtyard café with simple food and a relaxed atmosphere.",
  "personalTip": "Go just before sunset and sit outside if possible.",
  "whyHiddenGem": "It is not very visible from the street and is mostly known by locals.",
  "bestFor": ["quiet dinner", "friends", "couple"],
  "travellerTypes": ["solo", "couple", "friends"],
  "childFriendly": false,
  "bestTiming": ["sunset", "evening"],
  "priceLevel": "medium",
  "reservationNeeded": true,
  "reservationMethod": "whatsapp",
  "reservationPhone": "+221XXXXXXXXX",
  "googleMapsUrl": "https://maps.google.com/...",
  "transportNotes": "Best reached by taxi. Ask the driver to drop you at the nearest main road.",
  "guideAvailable": false,
  "images": [],
  "source": "field_research",
  "verifiedBy": "OFFSCRIPT team",
  "lastVerifiedAt": "2026-05-16",
  "status": "draft"
}
```

---

## 20. Clarifying Question Examples

### Missing Location

> “Where are you now, or where would you like to go? Dakar changes a lot from one neighbourhood to another.”

### Missing Traveller Type

> “Are you travelling solo, as a couple, with friends, or as a family?”

### Family Context

> “Are there children with you? And roughly how old are they? That changes what I’d recommend.”

### Missing Timing

> “When do you want to go — during the day, around sunset, tonight or later in the evening?”

### Missing Intent

> “What kind of thing are you in the mood for: food, a bar, culture, beach, music, sport, or something very local?”

---

## 21. Safety And Trust

The chatbot should be careful with:

- late-night recommendations
- transport advice
- children
- solo travellers
- remote areas
- unverified guides
- outdated phone numbers
- places not recently verified

If something is not verified:

> “I have this in the database, but it has not been recently verified, so I’d double-check before going.”

---

## 22. Premium Logic

Some places can be marked as premium.

Premium places may include:

- very local hidden gems
- private guides
- contact persons
- reservation help
- hard-to-find places
- personalised itineraries

```ts
type AccessLevel = "free" | "premium";
```

If a place is premium and the user is not premium:

> “I have a more local OFFSCRIPT tip for this, but it’s part of the premium guide.”

---

## 23. Future Features

Possible next steps:

- user profiles
- saved favourites
- WhatsApp location sharing
- live guide booking
- paid premium tips
- itinerary builder
- voice messages
- automatic image replies
- partner dashboard
- verification reminders
- multilingual admin panel

---

## 24. Development Phases

### Phase 1 — Railway Database MVP

- Create a Railway project
- Add a PostgreSQL database in Railway
- Create the first tables: places, place_images, contacts, reservations
- Add places manually through SQL, a small admin form or seed files
- Add Google Maps links
- Add contact persons
- Add image URLs
- Test manually with WhatsApp

### Phase 2 — Chatbot MVP

- Connect WhatsApp via Twilio
- Connect Railway PostgreSQL database
- Retrieve matching places
- Generate answers with OpenAI
- Ask clarification questions
- Return one strong recommendation

### Phase 3 — Premium Pilot

- Mark premium places
- Add manual payment flow
- Test with 10–30 travellers
- Track which answers convert

### Phase 4 — Scalable Product

- Scale the Railway PostgreSQL infrastructure
- Add admin dashboard
- Add booking/reservation workflows
- Add analytics
- Add more regions

---

## 25. Success Criteria

The MVP is successful if:

- users understand what OFFSCRIPT does
- users receive useful local recommendations
- the chatbot asks smart clarification questions
- answers feel human and personal
- recommendations are based on real collected data
- users trust the Google Maps/location/contact information
- testers say: “This feels like a local friend helping me”

---

## 26. Golden Rule

OFFSCRIPT should never feel like a list of tourist attractions.

It should feel like someone quietly opening a side door into Senegal.
