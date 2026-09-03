/**
 * Renders a JSON-LD `<script type="application/ld+json">` block.
 * Accepts a single schema object or an array of schemas (which are emitted
 * as separate script tags so each can be validated independently by Google's
 * Rich Results Test).
 *
 * Server component — no client JS, no flash, included in initial HTML for
 * crawlers and AI ingestion engines.
 */
type SchemaObject = Record<string, unknown>;

export function JsonLd({ data }: { data: SchemaObject | SchemaObject[] }) {
  const schemas = Array.isArray(data) ? data : [data];
  return (
    <>
      {schemas.map((schema, i) => (
        <script
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
          key={i}
          type="application/ld+json"
        />
      ))}
    </>
  );
}
