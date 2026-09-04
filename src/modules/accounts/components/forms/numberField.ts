/**
 * Normalises a react-hook-form field value for binding to a numeric `<input>`.
 *
 * Schemas here use `z.coerce.number()`, whose *input* type is `unknown` (the raw
 * field value before coercion) while the *output* is `number`. Since zod v4 the
 * form is typed with that input type, so `field.value` for an amount field is
 * `unknown` and cannot be spread straight onto an `<input value>`. This coerces
 * it to the `string | number` an input accepts, mapping null/undefined to an
 * empty string so the field stays controlled.
 */
export const toNumberInputValue = (value: unknown): string | number => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'string') return value;
  return String(value);
};
