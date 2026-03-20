const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
};

export function sanitizeHtml(input: string): string {
  return input.replace(/[&<>"'/]/g, (char) => HTML_ENTITIES[char] || char);
}

export function sanitizeForLog(input: string): string {
  return input.replace(/[\n\r\t]/g, ' ').slice(0, 1000);
}

export function stripNullBytes(input: string): string {
  return input.replace(/\0/g, '');
}
