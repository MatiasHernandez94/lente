/**
 * Siembra los aprendizajes curados del coach.
 *
 * Uso: TSX_TSCONFIG_PATH=scripts/tools/tsconfig.json npx tsx scripts/tools/seed-learnings.ts
 *
 * Es idempotente: los curados se insertan con ignoreDuplicates, así que se
 * puede correr cada vez que se actualiza CURATED_LEARNINGS sin duplicar.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

// tsx no carga .env.local por defecto; se hace manual (igual que run-migrations).
for (const line of readFileSync(join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  process.env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
}

import { CURATED_LEARNINGS, seedCuratedLearnings, getRelevantLearnings, formatLearningsForPrompt } from "../../src/lib/coach/learnings";

async function main() {
  console.log(`Aprendizajes curados definidos: ${CURATED_LEARNINGS.length}`);
  const inserted = await seedCuratedLearnings();
  console.log(`Insertados: ${inserted}`);

  const sports = [...new Set(CURATED_LEARNINGS.map((l) => l.sport))];
  for (const sport of sports) {
    const learnings = await getRelevantLearnings(sport, null, null);
    console.log(`\n=== ${sport} (${learnings.length}) ===`);
    for (const l of learnings) {
      console.log(`  [${l.origen}] uses=${l.uses} ${l.learning.slice(0, 90)}…`);
    }
  }

  console.log("\n--- bloque inyectado en el prompt (general) ---");
  console.log(formatLearningsForPrompt(await getRelevantLearnings("general", null, null)));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
