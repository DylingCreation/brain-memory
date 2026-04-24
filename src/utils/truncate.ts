/**
 * brain-memory — Smart truncation utility
 *
 * Phase 3: Replaces all hardcoded .slice(N) truncation across the codebase.
 * Truncates at natural boundaries (paragraph > sentence > word) to preserve
 * semantic completeness.
 *
 * Covers: #14 (syncEmbed 500ch), #15 (extract 800ch), #16 (compressor 8000ch),
 *          #17 (attention 200ch), #30 (episodic 200ch)
 */

export interface SmartTruncateOptions {
  maxChars: number;
  suffix?: string;      // default: '...'
  hint?: string;        // debug info appended, e.g. '[embed]'
}

/**
 * Smart truncation at natural boundaries.
 * Priority: paragraph break > sentence break > space break > hard cut.
 */
export function smartTruncate(text: string, options: SmartTruncateOptions): string {
  const { maxChars, suffix = '...', hint } = options;
  if (!text || text.length <= maxChars) return text;

  // Try boundaries in priority order, each requiring at least 50% of maxChars
  const minBoundary = Math.floor(maxChars * 0.5);
  
  // 1. Paragraph boundary (\n\n)
  let cutPoint = findLastBoundary(text, '\n\n', minBoundary, maxChars);
  if (cutPoint > 0) {
    cutPoint += 2; // include the \n\n
    return text.slice(0, cutPoint).trimEnd() + suffix + (hint ? ` [${hint}]` : '');
  }
  
  // 2. Sentence boundary (. ! ? 。 ！ ？ followed by space or end)
  cutPoint = findSentenceBoundary(text, minBoundary, maxChars);
  if (cutPoint > 0) {
    return text.slice(0, cutPoint).trimEnd() + suffix + (hint ? ` [${hint}]` : '');
  }
  
  // 3. Code block boundary (```)
  cutPoint = findLastBoundary(text, '```', minBoundary, maxChars);
  if (cutPoint > 0) {
    return text.slice(0, cutPoint).trimEnd() + '...[code truncated]' + (hint ? ` [${hint}]` : '');
  }
  
  // 4. Space boundary (word break)
  cutPoint = findLastBoundary(text, ' ', minBoundary, maxChars);
  if (cutPoint > 0) {
    return text.slice(0, cutPoint).trimEnd() + suffix + (hint ? ` [${hint}]` : '');
  }
  
  // 5. Hard cut (last resort)
  return text.slice(0, maxChars - suffix.length) + suffix + (hint ? ` [${hint}]` : '');
}

/**
 * Convenience: truncate with default settings.
 */
export function truncate(text: string, maxChars: number, hint?: string): string {
  return smartTruncate(text, { maxChars, hint });
}

// ─── Internal helpers ──────────────────────────────────────────

function findLastBoundary(text: string, boundary: string, minPos: number, maxPos: number): number {
  const pos = text.lastIndexOf(boundary, maxPos);
  return pos >= minPos ? pos : -1;
}

function findSentenceBoundary(text: string, minPos: number, maxPos: number): number {
  const sentenceEnders = ['.', '!', '?', '。', '！', '？'];
  for (let i = maxPos; i > minPos; i--) {
    if (sentenceEnders.includes(text[i])) {
      // Must be followed by whitespace or be at end of text
      const nextChar = i + 1 < text.length ? text[i + 1] : '';
      if (!nextChar || /\s/.test(nextChar)) {
        return i + 1;
      }
    }
  }
  return -1;
}
