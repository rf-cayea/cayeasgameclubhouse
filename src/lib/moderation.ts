export const CLEAN_LANGUAGE_ERROR = "Please keep the conversation friendly and use clean language.";

// A small best-effort UI filter, not a security or moderation boundary.
// Server moderation and authorization must enforce the community policy too.
const profanity = /\b(?:fuck(?:ing|ed|er|ers)?|shit(?:ty|s)?|bitch(?:es)?|cunt(?:s)?)\b/i;

export function containsProfanity(text: string): boolean {
  return profanity.test(text.normalize("NFKC"));
}
