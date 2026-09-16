import "dotenv/config";
import { google, forms_v1 } from "googleapis";

const FORM_TITLE = "TUUTI – Notes de terrain";
const EXPECTED_SHEET_ID = "1pZbYXP6VhNgtvnd2xswfKz3dUyuSM0aH-d_2cFRqY5c";
const EXISTING_ITEM_IDS = {
  pickLevel: "4a8bb197",
  authenticity: "4d54f0ba",
  audienceTags: "4321bd67",
  priceLevel: "78a02500"
} as const;

type Item = forms_v1.Schema$Item;
type Request = forms_v1.Schema$Request;

type ItemSpec = {
  key: string;
  title: string;
  description?: string;
  kind: "section" | "radio" | "checkbox" | "text";
  options?: string[];
  existingItemId?: string;
};

const specs: ItemSpec[] = [
  {
    key: "assessmentSection", kind: "section", title: "Évaluation du lieu",
    description: "Ces questions nous aident à mieux comprendre le lieu et à quels voyageurs il peut convenir. Il n’y a pas de bonne ou de mauvaise réponse : évalue le lieu tel que tu l’as réellement vécu."
  },
  {
    key: "authenticity", kind: "radio", existingItemId: EXISTING_ITEM_IDS.authenticity,
    title: "À quel point ce lieu te semble-t-il authentique ?",
    description: "L’authenticité ne signifie pas forcément ‘local’ ou ‘traditionnel’. Un restaurant italien, par exemple, peut aussi être très authentique.",
    options: ["0 — Pas authentique / très mis en scène", "1 — Peu authentique", "2 — Mixte / moyen", "3 — Authentique", "4 — Très authentique et vraiment distinctif"]
  },
  {
    key: "foodOrientation", kind: "radio", title: "Quelle est l’orientation de la cuisine ?",
    description: "Il ne s’agit pas d’une note de qualité, mais d’un axe entre cuisine locale et internationale. Choisis ‘Non applicable’ si le lieu n’est pas lié à la nourriture.",
    options: ["-2 — Entièrement locale / traditionnelle", "-1 — Principalement locale avec des influences internationales", "0 — Mixte / fusion", "1 — Principalement internationale avec des influences locales", "2 — Entièrement internationale / étrangère", "Non applicable / inconnu"]
  },
  {
    key: "audienceOrientation", kind: "radio", title: "Quel type de public fréquente principalement ce lieu ?",
    description: "Cette question concerne les personnes qui fréquentent le lieu, pas le type de cuisine.",
    options: ["-2 — Presque exclusivement local", "-1 — Principalement local", "0 — Public mixte", "1 — Principalement expatriés / visiteurs internationaux", "2 — Presque exclusivement international / touristique", "Inconnu / non évalué"]
  },
  {
    key: "audienceTags", kind: "checkbox", existingItemId: EXISTING_ITEM_IDS.audienceTags,
    title: "Quels publics observes-tu dans ce lieu ?", description: "Plusieurs réponses sont possibles.",
    options: ["Locaux", "Expatriés", "Touristes", "Voyageurs aventureux", "Familles", "Public jeune", "Public professionnel"]
  },
  {
    key: "adventureLevel", kind: "radio", title: "Quel niveau d’ouverture ou d’aventure ce lieu demande-t-il au voyageur ?",
    description: "Ce n’est pas une note de qualité. Un niveau plus élevé signifie simplement que le lieu demande davantage de curiosité, de flexibilité ou d’ouverture.",
    options: ["0 — Très accessible et confortable", "1 — Un peu en dehors de l’expérience touristique classique", "2 — Plutôt pour des voyageurs aventureux", "3 — Pour des voyageurs très curieux et flexibles", "Inconnu / non évalué"]
  },
  {
    key: "occasionTags", kind: "checkbox", title: "Pour quelles occasions ce lieu convient-il particulièrement ?", description: "Plusieurs réponses sont possibles.",
    options: ["Seul", "En couple", "Rendez-vous / date", "Entre amis", "En famille", "Coucher de soleil", "Boire un verre", "Musique live", "Se détendre", "Petit budget", "Expérience locale", "Vie nocturne", "Romantique"]
  },
  {
    key: "workFriendly", kind: "radio", title: "Est-ce un endroit adapté pour travailler avec un ordinateur ?",
    options: ["Oui", "Non", "Non évalué"]
  },
  {
    key: "priceLevel", kind: "radio", existingItemId: EXISTING_ITEM_IDS.priceLevel,
    title: "Quel est le niveau de prix ?",
    description: "Évalue le prix par rapport à des lieux comparables à Dakar / au Sénégal, pas par rapport aux prix européens.",
    options: ["1 — Petit budget", "2 — Abordable", "3 — Prix moyen", "4 — Chic", "5 — Luxe"]
  },
  {
    key: "editorialSection", kind: "section", title: "L’avis TUUTI",
    description: "Cette dernière partie correspond à notre regard éditorial. Après avoir observé le lieu, indique à quel point TUUTI devrait le recommander et pourquoi."
  },
  {
    key: "pickLevel", kind: "radio", existingItemId: EXISTING_ITEM_IDS.pickLevel,
    title: "À quel point ce lieu est-il un choix TUUTI ?",
    description: "Ne pense pas seulement à la qualité du lieu. Demande-toi surtout : est-ce un endroit que TUUTI a réellement envie de faire découvrir ?\n\n0 — Utile dans certaines situations, mais pas une adresse que TUUTI mettrait particulièrement en avant.\n1 — Une bonne adresse que TUUTI peut recommander lorsqu’elle correspond à la demande.\n2 — Une adresse que nous aimons particulièrement et que TUUTI a réellement envie de recommander.\n3 — Un lieu ou une expérience exceptionnelle, distinctive et mémorable, qui représente particulièrement bien l’esprit TUUTI.",
    options: ["0 — Lieu standard", "1 — Recommandé", "2 — Favori TUUTI ⭐", "3 — Expérience Signature TUUTI ❤️"]
  },
  {
    key: "priority", kind: "text", title: "Quelle priorité TUUTI doit-il donner à ce lieu ?",
    description: "La priorité indique à quel point TUUTI doit favoriser ce lieu parmi les adresses qui correspondent déjà à la demande du voyageur. La pertinence passe toujours avant la priorité.\n\nEntre un nombre entier de 0 à 100 :\n0–29 — Priorité faible\n30–49 — Option secondaire\n50–69 — Bonne option\n70–84 — Forte recommandation\n85–94 — Très forte recommandation TUUTI\n95–100 — Priorité absolue"
  },
  {
    key: "reason", kind: "text", title: "Pourquoi TUUTI devrait-il recommander ce lieu ?",
    description: "Explique brièvement ce qui rend ce lieu intéressant, particulier ou mémorable pour le bon voyageur. Tu peux répondre dans la langue de ton choix."
  }
];

const GENERAL_ITEM_IDS = ["1b0ab427", "519d5d8d", "2f0ae606", "00969fe1"];
const desiredKeys = [
  ...GENERAL_ITEM_IDS.map((id) => `existing:${id}`),
  ...specs.map((spec) => `spec:${spec.key}`)
];

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is missing.`);
  return value;
}

function itemForSpec(spec: ItemSpec, existing?: Item): Item {
  const base = { itemId: existing?.itemId, title: spec.title, description: spec.description };
  if (spec.kind === "section") return { ...base, pageBreakItem: {} };
  if (spec.kind === "text") return { ...base, questionItem: { question: { questionId: existing?.questionItem?.question?.questionId, required: false, textQuestion: { paragraph: spec.key === "reason" } } } };
  return {
    ...base,
    questionItem: {
      question: {
        questionId: existing?.questionItem?.question?.questionId,
        required: false,
        choiceQuestion: {
          type: spec.kind === "checkbox" ? "CHECKBOX" : "RADIO",
          options: spec.options?.map((value) => ({ value })),
          shuffle: false
        }
      }
    }
  };
}

function itemKey(item: Item): string {
  const generalId = GENERAL_ITEM_IDS.find((id) => id === item.itemId);
  if (generalId) return `existing:${generalId}`;
  const spec = specs.find((candidate) => candidate.existingItemId === item.itemId || candidate.title === item.title);
  if (!spec) throw new Error(`Unexpected Form item cannot be ordered safely: ${item.title ?? item.itemId}`);
  return `spec:${spec.key}`;
}

async function main(): Promise<void> {
  const formId = required("GOOGLE_FIELD_NOTES_FORM_ID");
  const auth = new google.auth.JWT({
    email: required("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    key: required("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/forms.body"]
  });
  const forms = google.forms({ version: "v1", auth });
  const current = (await forms.forms.get({ formId })).data;
  if (current.info?.title !== FORM_TITLE) throw new Error(`Refusing to update unexpected Form title: ${current.info?.title}`);
  if (current.linkedSheetId !== EXPECTED_SHEET_ID || current.linkedSheetId !== process.env.GOOGLE_FIELD_NOTES_SPREADSHEET_ID) {
    throw new Error("Refusing to update: linked response Sheet does not match the active Field Notes configuration.");
  }
  if (!current.revisionId) throw new Error("Form revision ID is unavailable.");

  const items = current.items ?? [];
  for (const id of [...GENERAL_ITEM_IDS, ...Object.values(EXISTING_ITEM_IDS)]) {
    if (!items.some((item) => item.itemId === id)) throw new Error(`Required existing item ${id} is missing; refusing to recreate it.`);
  }

  const requests: Request[] = [];
  const simulated: Array<{ key: string }> = items.map((item) => ({ key: itemKey(item) }));
  for (const spec of specs) {
    const existing = items.find((item) => spec.existingItemId === item.itemId || (!spec.existingItemId && spec.title === item.title));
    if (existing) {
      requests.push({ updateItem: { item: itemForSpec(spec, existing), location: { index: items.indexOf(existing) }, updateMask: "title,description,questionItem,pageBreakItem" } });
    } else {
      requests.push({ createItem: { item: itemForSpec(spec), location: { index: simulated.length } } });
      simulated.push({ key: `spec:${spec.key}` });
    }
  }

  if (simulated.length !== desiredKeys.length) throw new Error("Form contains unexpected or duplicate items; refusing to reorder it.");
  for (const [targetIndex, key] of desiredKeys.entries()) {
    const currentIndex = simulated.findIndex((item) => item.key === key);
    if (currentIndex < 0) throw new Error(`Required item ${key} is missing from the proposed Form.`);
    if (currentIndex === targetIndex) continue;
    requests.push({ moveItem: { originalLocation: { index: currentIndex }, newLocation: { index: targetIndex } } });
    const [moved] = simulated.splice(currentIndex, 1);
    simulated.splice(targetIndex, 0, moved);
  }

  console.log(`Updating existing Form ${formId}: ${requests.length} guarded requests; no item deletions.`);
  await forms.forms.batchUpdate({
    formId,
    requestBody: { requests, writeControl: { requiredRevisionId: current.revisionId } }
  });

  const updated = (await forms.forms.get({ formId })).data;
  if (updated.linkedSheetId !== EXPECTED_SHEET_ID) throw new Error("Post-update verification failed: response destination changed.");
  const finalKeys = (updated.items ?? []).map(itemKey);
  if (JSON.stringify(finalKeys) !== JSON.stringify(desiredKeys)) throw new Error("Post-update verification failed: item order differs from the specification.");
  for (const [key, id] of Object.entries(EXISTING_ITEM_IDS)) {
    const spec = specs.find((candidate) => candidate.key === key);
    const item = updated.items?.find((candidate) => candidate.title === spec?.title);
    if (item?.itemId !== id) throw new Error(`Post-update verification failed: ${key} item ID changed.`);
  }
  console.log(`Form update verified: ${updated.items?.length ?? 0} items; linked Sheet unchanged; existing assessment item IDs preserved.`);
}

main().catch((error) => {
  console.error("Field Notes Form update failed", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
