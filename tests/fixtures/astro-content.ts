/** Test-only replacement for Astro's virtual content module. Production uses
 * the real loader; unit tests feed its public record shape into loadSitePages. */
let records: unknown[] = [];

export function setPageRecords(value: unknown[]) {
  records = value;
}

export async function getCollection(name: string) {
  if (name !== 'pages') throw new Error(`Unexpected collection in route test: ${name}`);
  return records;
}
