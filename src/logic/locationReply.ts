export function acceptsAnyLocation(message: string): boolean {
  const lower = message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // WhatsApp and mobile keyboards commonly replace the ASCII apostrophe
    // with a typographic one. Treat punctuation as word boundaries so
    // "n'importe où" and "n’importe où" normalize identically.
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return /\b(anywhere|anywhere in dakar|any neighbourhood|any neighborhood|every neighbourhood|every neighborhood|all neighbourhoods|all neighborhoods|taxi anywhere|happy to take a taxi|does not matter|doesnt matter|it does not matter|it doesnt matter|no preference|wherever|overal|overal in dakar|alle buurten|alle wijken|elke buurt|elke wijk|eender welke buurt|eender welke wijk|eender welke plek|eender waar|om het even welke buurt|om het even welke wijk|om het even waar|waar dan ook|maakt niet uit|het maakt niet uit|taxi is goed|taxi mag|maakt me niet uit|maakt mij niet uit|peu importe|n importe quel quartier|tous les quartiers|ou tu veux|taxi partout|un taxi peut|n importe ou|egal|gelijk waar|jedes viertel|alle viertel|egal wo)\b/.test(
    lower
  );
}
