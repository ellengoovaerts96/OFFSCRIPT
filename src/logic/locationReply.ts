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

  return /\b(anywhere|anywhere in dakar|taxi anywhere|happy to take a taxi|does not matter|doesnt matter|it does not matter|it doesnt matter|no preference|wherever|overal|overal in dakar|maakt niet uit|het maakt niet uit|eender waar|taxi is goed|taxi mag|maakt me niet uit|maakt mij niet uit|peu importe|taxi partout|un taxi peut|n importe ou|egal|gelijk waar)\b/.test(
    lower
  );
}
