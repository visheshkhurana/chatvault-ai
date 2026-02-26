// ============================================================
// Shared Contact & Phone Formatting Utilities
// ============================================================

/**
 * Strips WhatsApp JID suffix (@s.whatsapp.net, @g.us, @lid, etc.)
 * and returns the clean phone number or group ID.
 */
export function stripWhatsAppJid(jid: string): string {
  if (!jid) return '';
  return jid
    .replace(/@s\.whatsapp\.net$/i, '')
    .replace(/@g\.us$/i, '')
    .replace(/@lid$/i, '')
    .replace(/@c\.us$/i, '')
    .trim();
}

/**
 * Formats a phone number or WhatsApp JID into a human-readable format.
 * Handles: WhatsApp JIDs, Indian numbers, international numbers.
 */
export function formatPhone(phone: string): string {
  if (!phone) return 'Unknown';

  // Strip WhatsApp JID suffix first
  const cleaned = stripWhatsAppJid(phone).replace(/\D/g, '');

  if (!cleaned) return phone;

  // Indian numbers (91 + 10 digits)
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    const n = cleaned.slice(2);
    return '+91 ' + n.slice(0, 5) + ' ' + n.slice(5);
  }

  // US/Canada numbers (1 + 10 digits)
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    const n = cleaned.slice(1);
    return '+1 (' + n.slice(0, 3) + ') ' + n.slice(3, 6) + '-' + n.slice(6);
  }

  // 10-digit number (assume Indian)
  if (cleaned.length === 10) {
    return '+91 ' + cleaned.slice(0, 5) + ' ' + cleaned.slice(5);
  }

  // Other international — format with country code
  if (cleaned.length >= 10) {
    const countryCodeLen = cleaned.length - 10;
    const cc = cleaned.slice(0, countryCodeLen);
    const num = cleaned.slice(countryCodeLen);
    return '+' + cc + ' ' + num.slice(0, 5) + ' ' + num.slice(5);
  }

  return phone;
}

/**
 * Gets a display name for a contact/chat.
 * Tries: displayName → formatted phone → 'Unknown'
 */
export function getDisplayName(name: string | null | undefined, phone: string | null | undefined): string {
  // If we have a real name (not just digits/JID), use it
  if (name) {
    const stripped = stripWhatsAppJid(name);
    // Check if the name is just a phone number / digits
    const isJustDigits = /^\d{7,}$/.test(stripped.replace(/\D/g, ''));
    if (!isJustDigits) {
      return stripped;
    }
  }

  // Fall back to formatted phone
  if (phone) {
    return formatPhone(phone);
  }

  if (name) {
    return formatPhone(name);
  }

  return 'Unknown';
}

/**
 * Gets initials for avatar display.
 * Returns up to 2 characters.
 */
export function getInitials(name: string): string {
  if (!name || name === 'Unknown') return '?';

  // If it starts with + (formatted phone), use last 2 digits
  if (name.startsWith('+')) {
    const digits = name.replace(/\D/g, '');
    return digits.slice(-2);
  }

  // Otherwise get first letters of words
  return name
    .split(' ')
    .filter(Boolean)
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Checks if a chat title is actually a phone number / JID
 * (i.e. not a real human-readable name)
 */
export function isChatTitlePhoneNumber(title: string): boolean {
  if (!title) return true;
  const stripped = stripWhatsAppJid(title);
  // If after stripping it's mostly digits, it's a phone number
  const digitsOnly = stripped.replace(/\D/g, '');
  return digitsOnly.length >= 7 && digitsOnly.length / stripped.length > 0.7;
}
