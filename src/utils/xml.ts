/**
 * brain-memory — XML escaping utilities
 *
 * Shared XML escaping for context assembly and reasoning output.
 */

/** Escape special XML characters for safe embedding in XML content */
export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
