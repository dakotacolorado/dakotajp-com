/**
 * GOTCHA: always UTC. `publishedAt` arrives as midnight UTC from a date input,
 * so local-zone formatting renders the previous day west of Greenwich — and
 * would differ between the server render and the client.
 */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
