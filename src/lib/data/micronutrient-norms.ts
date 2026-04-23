export const DAILY_MICRO_NORMS: Record<string, number> = {
  калий: 3500,
  натрий: 1500,
  магний: 400,
  кальций: 1000,
  фосфор: 700,
  железо: 18,
  цинк: 11,
  медь: 0.9,
  марганец: 2.3,
  селен: 55,
  йод: 150,
  витамин_a: 900,
  витамин_b1: 1.2,
  витамин_b2: 1.3,
  витамин_b3: 16,
  витамин_b5: 5,
  витамин_b6: 1.3,
  витамин_b9: 400,
  витамин_b12: 2.4,
  витамин_c: 90,
  витамин_d: 15,
  витамин_e: 15,
  витамин_k: 120,
};

const ALIASES: Array<{ pattern: RegExp; key: string }> = [
  { pattern: /витамин\s*a|ретинол|^a$/i, key: "витамин_a" },
  { pattern: /витамин\s*b1|тиамин|^b1$/i, key: "витамин_b1" },
  { pattern: /витамин\s*b2|рибофлавин|^b2$/i, key: "витамин_b2" },
  { pattern: /витамин\s*b3|ниацин|pp|^b3$/i, key: "витамин_b3" },
  { pattern: /витамин\s*b5|пантотен|^b5$/i, key: "витамин_b5" },
  { pattern: /витамин\s*b6|пиридокс|^b6$/i, key: "витамин_b6" },
  { pattern: /витамин\s*b9|фолат|фолиев|^b9$/i, key: "витамин_b9" },
  { pattern: /витамин\s*b12|кобаламин|^b12$/i, key: "витамин_b12" },
  { pattern: /витамин\s*c|аскорбин|^c$/i, key: "витамин_c" },
  { pattern: /витамин\s*d|кальцифер|^d$/i, key: "витамин_d" },
  { pattern: /витамин\s*e|токофер|^e$/i, key: "витамин_e" },
  { pattern: /витамин\s*k|филлохинон|^k$/i, key: "витамин_k" },
];

export function normalizeNutrientNormKey(input: string): string {
  const base = input
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  for (const alias of ALIASES) {
    if (alias.pattern.test(base)) {
      return alias.key;
    }
  }
  return base;
}
