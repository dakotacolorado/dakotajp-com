/**
 * Dates are formatted in UTC everywhere on purpose.
 *
 * `publishedAt` can be a date the admin picked in a date input, which arrives
 * as midnight UTC. Formatting that in the viewer's local zone renders the
 * previous day for anyone west of Greenwich. Pinning to UTC also keeps the
 * server-rendered string identical to what the client would produce.
 */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
