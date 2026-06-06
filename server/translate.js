export class TranslationEngine {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
    this.model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    this.termCache = new Map();
  }

  buildSystemPrompt() {
    return `You are a professional simultaneous interpreter for technical conferences.
Your task is to translate English speech into fluent, natural Chinese in real-time.

RULES:
1. Output ONLY the Chinese translation — no explanations, no notes, no prefixes
2. Maintain consistency: same English term → same Chinese translation throughout
3. For technical terms, use standard Chinese technical translations
4. Preserve speaker tone: formal for keynotes, relaxed for casual talks
5. If the input is incomplete or fragmented, translate what you can naturally
6. Handle pronouns correctly based on provided context
7. For numbers, dates, and proper nouns, preserve them exactly`;
  }

  /**
   * Fast translation for interim speech results (low latency priority).
   */
  async translateQuick(text) {
    if (!text || text.trim().length === 0) return '';

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: 'Translate English to Chinese. Output ONLY the Chinese text. Be fast and direct.' },
            { role: 'user', content: text }
          ],
          max_tokens: 200,
          temperature: 0.1,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`DeepSeek API error: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0].message.content.trim();
    } catch (err) {
      console.error('Quick translation failed:', err.message);
      return `[翻译失败] ${text}`;
    }
  }

  /**
   * Full context-aware translation using sliding window of previous sentences.
   */
  async translateWithContext(text, contextSentences = []) {
    if (!text || text.trim().length === 0) return '';

    try {
      const messages = [
        { role: 'system', content: this.buildSystemPrompt() }
      ];

      if (contextSentences.length > 0) {
        const contextBlock = contextSentences
          .map((s, i) => `[Previous sentence ${i + 1}]: ${s}`)
          .join('\n');
        messages.push({
          role: 'user',
          content: `Context (previous sentences in this talk):\n${contextBlock}\n\nTranslate this new sentence to Chinese: "${text}"`
        });
      } else {
        messages.push({
          role: 'user',
          content: `Translate to Chinese: "${text}"`
        });
      }

      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          max_tokens: 300,
          temperature: 0.2,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`DeepSeek API error: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0].message.content.trim();
    } catch (err) {
      console.error('Context translation failed:', err.message);
      return this.translateQuick(text);
    }
  }

  /**
   * Re-translate a previous sentence with expanded context window.
   * Core of the auto-correction pipeline.
   */
  async retranslateWithNewContext(text, fullContextWindow) {
    if (!text || !fullContextWindow || fullContextWindow.length === 0) {
      return this.translateQuick(text);
    }

    try {
      const contextBlock = fullContextWindow
        .filter(s => s !== text)
        .map((s, i) => `[Context ${i + 1}]: ${s}`)
        .join('\n');

      const messages = [
        { role: 'system', content: this.buildSystemPrompt() },
        {
          role: 'user',
          content: `With this full context now available:\n${contextBlock}\n\nRe-translate this sentence with the new context for better accuracy: "${text}"`
        }
      ];

      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          max_tokens: 300,
          temperature: 0.2,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`DeepSeek API error: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0].message.content.trim();
    } catch (err) {
      console.error('Re-translation failed:', err.message);
      return null;
    }
  }

  /**
   * Estimate translation confidence (0-100) based on heuristics.
   */
  estimateConfidence(source, translation) {
    if (!source || !translation) return 0;

    let score = 85;

    const ratio = translation.length / Math.max(source.length, 1);
    if (ratio < 0.3) score -= 20;
    if (ratio > 3.0) score -= 10;

    const englishWords = (translation.match(/\b[a-zA-Z]{3,}\b/g) || []).length;
    if (englishWords > 0) score -= englishWords * 5;

    if (translation.trim().toLowerCase() === source.trim().toLowerCase()) {
      score -= 50;
    }

    return Math.max(0, Math.min(100, score));
  }

  registerTerm(english, chinese) {
    this.termCache.set(english.toLowerCase(), chinese);
  }

  getTerm(english) {
    return this.termCache.get(english.toLowerCase());
  }
}
