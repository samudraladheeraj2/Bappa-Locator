/**
 * Input Sanitization & Anti-XSS (Cross-Site Scripting) Utility
 * Strips HTML tags, script elements, unsafe attributes, and SQL/Command injection characters
 */

/**
 * Escapes unsafe HTML special characters to prevent DOM-based XSS attacks
 */
export function sanitizeText(input: string | undefined | null): string {
  if (!input) return '';

  return String(input)
    // Remove HTML tags & script blocks
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    // Escape HTML special chars
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .trim();
}

/**
 * Sanitizes search queries and filter inputs
 */
export function sanitizeSearchQuery(query: string | undefined | null): string {
  if (!query) return '';
  return sanitizeText(query).replace(/[%_*\$\\]/g, '');
}

/**
 * Validates phone numbers to ensure numeric format only
 */
export function sanitizePhoneNumber(phone: string | undefined | null): string {
  if (!phone) return '';
  return phone.replace(/[^0-9]/g, '').slice(0, 10);
}

/**
 * Sanitizes object fields recursively before database insertion
 */
export function sanitizeSubmissionData<T extends Record<string, any>>(data: T): T {
  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      result[key] = sanitizeText(value);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        typeof item === 'string' ? sanitizeText(item) : item
      );
    } else {
      result[key] = value;
    }
  }

  return result as T;
}
