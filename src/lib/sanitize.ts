// Input sanitization and validation utilities

const MAX_LENGTHS: Record<string, number> = {
  songName: 200,
  artist: 200,
  setlistName: 100,
  blockName: 100,
  blockTheme: 80,
  notes: 500,
  key: 10,
  slugOverride: 300,
  email: 254,
  displayName: 100,
};

// Remove control characters and limit length
export function sanitizeText(input: string, field: string): string {
  if (!input) return '';
  const maxLen = MAX_LENGTHS[field] || 200;
  return input
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .trim()
    .slice(0, maxLen);
}

// Basic email validation
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

// Validate allowed file types for document uploads
const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp'];
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export function isAllowedFileType(filename: string, mimeType: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return ALLOWED_EXTENSIONS.includes(ext) && ALLOWED_MIME_TYPES.includes(mimeType);
}
