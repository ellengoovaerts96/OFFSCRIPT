import {
  buildLocationAction,
  cleanExternalUrl,
  formatMapsLink,
  formatSocialLink,
  locationActionLabel
} from "../src/logic/recommendationLinks.js";

const trackedInstagram = "https://www.instagram.com/andasurfclub/?fbclid=long-tracking-value&utm_source=test";
if (cleanExternalUrl(trackedInstagram) !== "https://www.instagram.com/andasurfclub/") {
  throw new Error("Social links must not expose tracking parameters in WhatsApp.");
}
if (formatSocialLink(trackedInstagram) !== "📸 *Instagram*\nhttps://www.instagram.com/andasurfclub/") {
  throw new Error("Instagram must be presented as one compact labelled action.");
}
if (formatMapsLink("https://maps.app.goo.gl/example?share=1") !== "📍 *Google Maps*\nhttps://maps.app.goo.gl/example") {
  throw new Error("The map fallback must be compact and labelled.");
}
if (!cleanExternalUrl("https://www.google.com/maps/search/?api=1&query=Prieto").includes("query=Prieto")) {
  throw new Error("Map parameters that identify a place must be preserved.");
}
const location = buildLocationAction({ latitude: 14.75, longitude: -17.5, placeName: "Anda Surf Club" });
if (location !== "geo:14.75,-17.5|Anda Surf Club" || locationActionLabel(location) !== "Anda Surf Club") {
  throw new Error("Coordinates must produce a labelled native WhatsApp location.");
}
if (buildLocationAction({ placeName: "Missing coordinates" }) !== undefined) {
  throw new Error("A native location must only be created with valid coordinates.");
}

console.log("Recommendation-link checks passed.");
