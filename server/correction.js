export class CorrectionEngine {
  constructor() {
    this.correctionCount = 0;
    this.lastCorrectionTime = 0;
    this.minInterval = 2000;
  }

  /**
   * Check recent history entries and generate corrections.
   * Strategies:
   *   1. Re-translate with expanded context (new later sentences clarify earlier ones)
   *   2. Enforce terminology consistency across the session
   */
  async checkAndCorrect(history, contextWindow, translateEngine, sourceLanguage = 'en-US') {
    const now = Date.now();

    if (now - this.lastCorrectionTime < this.minInterval) {
      return [];
    }

    this.lastCorrectionTime = now;
    const corrections = [];

    // Examine 2nd-to-last and 3rd-to-last entries
    const candidates = history.slice(-4, -1);

    for (const entry of candidates) {
      if (entry._corrected) continue;

      // Strategy 1: Re-translate with expanded context
      const newTranslation = await translateEngine.retranslateWithNewContext(
        entry.source,
        contextWindow,
        sourceLanguage
      );

      if (newTranslation && this.isMeaningfullyDifferent(entry.translation, newTranslation)) {
        const oldTrans = entry.translation;
        entry._corrected = true;
        entry.translation = newTranslation;
        this.correctionCount++;
        corrections.push({
          id: entry.id,
          oldTranslation: oldTrans,
          newTranslation,
          reason: this.generateReason(oldTrans, newTranslation)
        });
        continue;
      }

      // Strategy 2: Terminology consistency check
      const termIssue = this.detectTermInconsistency(entry, history);
      if (termIssue) {
        entry._corrected = true;
        entry.translation = termIssue.corrected;
        corrections.push({
          id: entry.id,
          oldTranslation: termIssue.original,
          newTranslation: termIssue.corrected,
          reason: termIssue.reason
        });
      }
    }

    return corrections;
  }

  /**
   * Check if two translations are meaningfully different (>5% char-level diff).
   */
  isMeaningfullyDifferent(oldText, newText) {
    if (!oldText || !newText) return false;
    if (oldText === newText) return false;

    const maxLen = Math.max(oldText.length, newText.length);
    const minLen = Math.min(oldText.length, newText.length);
    const lenDiff = maxLen - minLen;

    let charDiffs = 0;
    const minCheck = Math.min(oldText.length, newText.length);
    for (let i = 0; i < minCheck; i++) {
      if (oldText[i] !== newText[i]) charDiffs++;
    }

    const diffRatio = (charDiffs + lenDiff) / maxLen;
    return diffRatio > 0.05;
  }

  /**
   * Detect if the same English term was translated differently across entries.
   */
  detectTermInconsistency(entry, history) {
    const terms = entry.source.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*\b/g) || [];
    const simpleTerms = entry.source.match(/\b[a-z]{4,}\b/g) || [];
    const allTerms = [...terms, ...simpleTerms];

    if (allTerms.length === 0) return null;

    for (const term of allTerms) {
      const termLower = term.toLowerCase();

      for (const prev of history) {
        if (prev.id === entry.id) continue;
        if (!prev.source.toLowerCase().includes(termLower)) continue;

        const currentTT = this.extractTermTranslation(entry.translation, term);
        const prevTT = this.extractTermTranslation(prev.translation, term);

        if (currentTT && prevTT && currentTT !== prevTT) {
          const corrected = entry.translation.replace(currentTT, prevTT);
          return {
            original: entry.translation,
            corrected,
            reason: `术语统一: "${term}" → "${prevTT}"（与上文保持一致）`
          };
        }
      }
    }

    return null;
  }

  /**
   * Heuristic: extract the likely Chinese translation of an English term.
   */
  extractTermTranslation(translation, englishTerm) {
    const chineseChars = translation.match(/[一-鿿]{2,6}/g);
    return chineseChars ? chineseChars[0] : null;
  }

  /**
   * Generate human-readable correction reason.
   */
  generateReason(oldTranslation, newTranslation) {
    const oldSet = new Set([...oldTranslation]);
    const addedChars = [...newTranslation].filter(c => !oldSet.has(c));

    if (addedChars.length > 3) {
      return '根据上下文补充了更准确的翻译';
    }

    const pronouns = ['它', '他', '她', '他们', '它们', '这', '那'];
    for (const p of pronouns) {
      if (oldTranslation.includes(p) && !newTranslation.includes(p)) {
        return '根据上下文修正了代词指代';
      }
    }

    return '根据更完整的上下文优化了翻译';
  }

  getStats() {
    return { totalCorrections: this.correctionCount };
  }
}
