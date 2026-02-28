/**
 * Language Detection & Localization Module
 * Detects language of text using heuristics and provides localized responses
 */

// ============================================================
// Language Detection Heuristics
// ============================================================

const LANGUAGE_PATTERNS: Record<string, RegExp> = {
  // Arabic: Arabic Unicode block (U+0600–U+06FF)
  ar: /[\u0600-\u06FF]/g,
  // Devanagari (Hindi): (U+0900–U+097F)
  hi: /[\u0900-\u097F]/g,
  // Simplified Chinese: (U+4E00–U+9FFF)
  zh: /[\u4E00-\u9FFF]/g,
  // Hiragana/Katakana (Japanese): (U+3040–U+309F, U+30A0–U+30FF)
  ja: /[\u3040-\u309F\u30A0-\u30FF]/g,
  // Hangul (Korean): (U+AC00–U+D7AF)
  ko: /[\uAC00-\uD7AF]/g,
  // Spanish/Portuguese diacritics
  es: /[áéíóúñ¿¡]/g,
  pt: /[ãõç]/g,
};

const MIN_CHAR_THRESHOLD = 3; // Minimum matching characters to detect language

// ============================================================
// Types
// ============================================================

export type LanguageCode = 'en' | 'hi' | 'es' | 'pt' | 'ar' | 'zh' | 'ja' | 'ko';

export interface LocalizedStrings {
  greeting: string;
  no_results: string;
  error: string;
  searching: string;
  processing: string;
  success: string;
  empty_chat: string;
  retry: string;
}

// ============================================================
// Localized Responses
// ============================================================

const LOCALIZED_RESPONSES: Record<LanguageCode, LocalizedStrings> = {
  en: {
    greeting: 'Hello! How can I help you today?',
    no_results: 'Sorry, I could not find any results matching your search.',
    error: 'An error occurred. Please try again.',
    searching: 'Searching...',
    processing: 'Processing your request...',
    success: 'Done! Here are the results.',
    empty_chat: 'No messages yet in this conversation.',
    retry: 'Please try again.',
  },
  hi: {
    greeting: 'नमस्ते! मैं आपकी कैसे मदद कर सकता हूं?',
    no_results: 'क्षमा करें, मुझे आपकी खोज से मेल खाने वाला कोई परिणाम नहीं मिल सका।',
    error: 'एक त्रुटि हुई। कृपया दोबारा प्रयास करें।',
    searching: 'खोज रहे हैं...',
    processing: 'आपके अनुरोध को संसाधित कर रहे हैं...',
    success: 'हो गया! यहाँ परिणाम हैं।',
    empty_chat: 'इस बातचीत में अभी कोई संदेश नहीं हैं।',
    retry: 'कृपया दोबारा प्रयास करें।',
  },
  es: {
    greeting: '¡Hola! ¿Cómo puedo ayudarte hoy?',
    no_results: 'Lo siento, no encontré resultados que coincidan con tu búsqueda.',
    error: 'Ocurrió un error. Por favor, intenta de nuevo.',
    searching: 'Buscando...',
    processing: 'Procesando tu solicitud...',
    success: '¡Listo! Aquí están los resultados.',
    empty_chat: 'Sin mensajes en esta conversación.',
    retry: 'Por favor, intenta de nuevo.',
  },
  pt: {
    greeting: 'Olá! Como posso ajudá-lo hoje?',
    no_results: 'Desculpa, não encontrei resultados que correspondam à sua busca.',
    error: 'Ocorreu um erro. Por favor, tente novamente.',
    searching: 'Pesquisando...',
    processing: 'Processando sua solicitação...',
    success: 'Pronto! Aqui estão os resultados.',
    empty_chat: 'Sem mensagens nesta conversa.',
    retry: 'Por favor, tente novamente.',
  },
  ar: {
    greeting: 'مرحبا! كيف يمكنني مساعدتك اليوم؟',
    no_results: 'آسف، لم أتمكن من العثور على نتائج تطابق بحثك.',
    error: 'حدث خطأ. يرجى المحاولة مرة أخرى.',
    searching: 'جاري البحث...',
    processing: 'جاري معالجة طلبك...',
    success: 'تم! إليك النتائج.',
    empty_chat: 'لا توجد رسائل في هذه المحادثة.',
    retry: 'يرجى المحاولة مرة أخرى.',
  },
  zh: {
    greeting: '你好！我今天能帮你什么？',
    no_results: '抱歉，找不到与您的搜索匹配的结果。',
    error: '发生错误。请重试。',
    searching: '搜索中...',
    processing: '正在处理您的请求...',
    success: '完成！以下是结果。',
    empty_chat: '此对话中没有消息。',
    retry: '请重试。',
  },
  ja: {
    greeting: 'こんにちは！今日はどのようにお手伝いしましょうか？',
    no_results: '申し訳ありません。検索に一致する結果が見つかりません。',
    error: 'エラーが発生しました。もう一度お試しください。',
    searching: '検索中...',
    processing: 'リクエストを処理しています...',
    success: '完了！結果は以下の通りです。',
    empty_chat: 'このチャットにはメッセージがありません。',
    retry: 'もう一度お試しください。',
  },
  ko: {
    greeting: '안녕하세요! 오늘 어떻게 도와드릴까요?',
    no_results: '죄송합니다. 검색과 일치하는 결과를 찾을 수 없습니다.',
    error: '오류가 발생했습니다. 다시 시도하세요.',
    searching: '검색 중...',
    processing: '요청을 처리하는 중입니다...',
    success: '완료되었습니다! 결과는 다음과 같습니다.',
    empty_chat: '이 대화에 메시지가 없습니다.',
    retry: '다시 시도하세요.',
  },
};

// ============================================================
// Detection Functions
// ============================================================

/**
 * Detect language of text using character pattern matching
 * @param text Input text to detect language
 * @returns ISO language code (fallback to 'en')
 */
export function detectLanguage(text: string): LanguageCode {
  if (!text || text.trim().length === 0) {
    return 'en';
  }

  const matches: Record<string, number> = {};

  // Count matching characters for each language
  for (const [lang, pattern] of Object.entries(LANGUAGE_PATTERNS)) {
    const matchedChars = (text.match(pattern) || []).length;
    if (matchedChars >= MIN_CHAR_THRESHOLD) {
      matches[lang] = matchedChars;
    }
  }

  // Return language with highest match count
  if (Object.keys(matches).length > 0) {
    const detected = Object.keys(matches).reduce((a, b) =>
      matches[a] > matches[b] ? a : b
    );
    return detected as LanguageCode;
  }

  return 'en';
}

/**
 * Get localized response string for a given key and language
 * @param key Response key (e.g., 'greeting', 'no_results')
 * @param language ISO language code
 * @returns Localized string or English fallback
 */
export function getLocalizedResponse(
  key: keyof LocalizedStrings,
  language: LanguageCode
): string {
  const locales = LOCALIZED_RESPONSES[language] || LOCALIZED_RESPONSES.en;
  return locales[key] || LOCALIZED_RESPONSES.en[key];
}

/**
 * Determine if response should be translated from one language to another
 * @param userLang User's detected language
 * @param responseLang Language of the response
 * @returns Boolean indicating if translation is needed
 */
export function shouldTranslateResponse(
  userLang: LanguageCode,
  responseLang: LanguageCode
): boolean {
  // Translate if response language differs from user language
  return userLang !== responseLang;
}

/**
 * Get all supported languages
 * @returns Array of supported language codes
 */
export function getSupportedLanguages(): LanguageCode[] {
  return Object.keys(LOCALIZED_RESPONSES) as LanguageCode[];
}

/**
 * Get localized strings for a specific language
 * @param language ISO language code
 * @returns All localized strings for that language
 */
export function getLocalizedStrings(language: LanguageCode): LocalizedStrings {
  return LOCALIZED_RESPONSES[language] || LOCALIZED_RESPONSES.en;
}

/**
 * Detect language and get appropriate localized response
 * @param text Input text to analyze
 * @param responseKey Response key to localize
 * @returns Localized response string
 */
export function detectAndRespond(
  text: string,
  responseKey: keyof LocalizedStrings
): string {
  const detectedLang = detectLanguage(text);
  return getLocalizedResponse(responseKey, detectedLang);
}
