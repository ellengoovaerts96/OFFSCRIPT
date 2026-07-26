export function acceptsAnyLocation(message: string): boolean {
  const lower = message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return /\b(anywhere|anywhere in dakar|taxi anywhere|happy to take a taxi|does not matter|doesnt matter|it does not matter|it doesnt matter|no preference|wherever|overal|overal in dakar|maakt niet uit|het maakt niet uit|eender waar|taxi is goed|taxi mag|maakt me niet uit|maakt mij niet uit|peu importe|taxi partout|un taxi peut|n importe ou|n'importe ou|egal|gelijk waar)\b/.test(
    lower
  );
}
