// ---------------------------------------------------------------------------
// highlightText.js
//
// Splits a plain-text string into an array of segments: plain text and
// matched terms. Used to render <mark> elements in React without using
// dangerouslySetInnerHTML (which would open XSS risks).
//
// Usage:
//   const segments = splitWithHighlights("he loves React and react-native", ["react"]);
//   // → [
//   //     { text: "he loves ",  isMatch: false },
//   //     { text: "React",      isMatch: true  },
//   //     { text: " and ",      isMatch: false },
//   //     { text: "react",      isMatch: true  },
//   //     { text: "-native",    isMatch: false },
//   //   ]
// ---------------------------------------------------------------------------

/**
 * Split `text` into segments where terms are highlighted.
 *
 * @param {string} text        - Source text to split
 * @param {string[]} terms     - Search terms to highlight
 * @param {string} matchMode   - "whole" uses word-boundary regex, "partial" uses substring
 * @returns {{ text: string, isMatch: boolean }[]}
 */
export function splitWithHighlights(text, terms, matchMode = "whole") {
    if (!text || !terms || terms.length === 0) {
        return [{ text, isMatch: false }];
    }

    // Filter out empty/short terms, escape regex special chars
    const validTerms = terms
        .filter((t) => t && t.length >= 1)
        .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

    if (validTerms.length === 0) {
        return [{ text, isMatch: false }];
    }

    // Build a combined regex pattern
    let pattern;
    if (matchMode === "whole") {
        pattern = `\\b(${validTerms.join("|")})\\b`;
    } else {
        pattern = `(${validTerms.join("|")})`;
    }

    let regex;
    try {
        regex = new RegExp(pattern, "gi");
    } catch {
        // Fallback if regex fails — return plain text
        return [{ text, isMatch: false }];
    }

    const segments = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
        // Text before this match
        if (match.index > lastIndex) {
            segments.push({ text: text.slice(lastIndex, match.index), isMatch: false });
        }

        // The matched term
        segments.push({ text: match[0], isMatch: true });

        lastIndex = regex.lastIndex;

        // Guard against zero-length match infinite loop
        if (match[0].length === 0) regex.lastIndex++;
    }

    // Remaining text after last match
    if (lastIndex < text.length) {
        segments.push({ text: text.slice(lastIndex), isMatch: false });
    }

    return segments.length > 0 ? segments : [{ text, isMatch: false }];
}

/**
 * Count how many times any term appears in a text.
 * Used to show "N matches" in the search result card.
 */
export function countMatches(text, terms, matchMode = "whole") {
    if (!text || !terms || terms.length === 0) return 0;

    let total = 0;
    for (const term of terms) {
        if (!term) continue;
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        let pattern;
        try {
            if (matchMode === "whole") {
                pattern = new RegExp(`\\b${escaped}\\b`, "gi");
            } else {
                pattern = new RegExp(escaped, "gi");
            }
            const matches = text.match(pattern);
            total += matches ? matches.length : 0;
        } catch {
            // skip broken term
        }
    }
    return total;
}
