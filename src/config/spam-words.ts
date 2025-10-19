/**
 * Comprehensive Spam and Ban Words Database
 * Updated for WhatsApp Bulk Messaging - 2024
 * Includes words that can trigger WhatsApp ban or spam detection
 */

export const SPAM_WORDS = {
  // Urgency & Pressure Tactics (High Risk)
  urgency: [
    'urgent', 'hurry', 'limited time', 'act now', 'expires soon', 'today only',
    'last chance', 'final chance', 'don\'t miss', 'don\'t wait', 'now or never',
    'ends today', 'ends tonight', 'only today', 'this hour only', 'immediate action',
    'right now', 'instant', 'immediately', 'asap', 'quick', 'fast', 'rapid',
    'flash sale', 'lightning deal', 'time sensitive', 'deadline', 'countdown'
  ],

  // Sales & Promotional (Medium Risk)
  sales: [
    'buy now', 'order now', 'shop now', 'purchase now', 'get it now', 'grab now',
    'claim now', 'click here', 'tap here', 'call now', 'book now', 'reserve now',
    'sign up now', 'register now', 'subscribe now', 'join now', 'apply now',
    'download now', 'install now', 'visit now', 'check out', 'special offer',
    'limited offer', 'exclusive offer', 'one time offer', 'promotional offer'
  ],

  // Money & Financial (High Risk - WhatsApp Ban Risk)
  financial: [
    'free money', 'easy money', 'fast money', 'quick money', 'make money',
    'earn money', 'extra income', 'additional income', 'side income',
    'guaranteed income', 'passive income', 'get rich', 'become rich',
    'millionaire', 'financial freedom', 'debt free', 'no investment',
    'zero investment', 'risk free', 'no risk', 'guaranteed returns',
    'high returns', 'double your money', 'triple your money', '100% profit',
    'cash prize', 'win cash', 'lottery', 'jackpot', 'prize money',
    'investment opportunity', 'business opportunity', 'mlm', 'network marketing',
    'pyramid scheme', 'ponzi', 'forex trading', 'bitcoin investment',
    'cryptocurrency investment', 'stock tips', 'trading tips'
  ],

  // Free & Discount (Medium Risk)
  freebies: [
    'free', 'totally free', 'absolutely free', 'completely free', 'free gift',
    'free bonus', 'free trial', 'free sample', 'free shipping', 'free delivery',
    'no cost', 'zero cost', 'at no cost', 'without cost', 'complementary',
    '100% off', '90% off', '80% off', 'huge discount', 'massive discount',
    'biggest discount', 'lowest price', 'best price', 'unbeatable price',
    'cheapest', 'bargain', 'steal deal', 'giveaway', 'contest'
  ],

  // Superlatives & Exaggeration (Medium Risk)
  superlatives: [
    'amazing', 'incredible', 'unbelievable', 'fantastic', 'phenomenal',
    'extraordinary', 'spectacular', 'magnificent', 'outstanding', 'remarkable',
    'excellent', 'perfect', 'ultimate', 'revolutionary', 'groundbreaking',
    'life changing', 'world class', 'best ever', 'never before', 'one of a kind',
    'unique opportunity', 'once in a lifetime', 'miracle', 'magic', 'secret',
    'hidden secret', 'insider secret', 'exclusive secret', 'proven method'
  ],

  // Winner & Congratulations (High Risk)
  winner: [
    'congratulations', 'congrats', 'you won', 'you\'ve won', 'you are winner',
    'you\'re a winner', 'winner', 'selected', 'chosen', 'qualified',
    'you qualify', 'you\'ve been selected', 'you\'ve been chosen', 'lucky winner',
    'grand prize', 'jackpot winner', 'claim your prize', 'collect your prize',
    'redeem prize', 'prize awarded'
  ],

  // Guarantee & Promise (High Risk)
  guarantee: [
    'guaranteed', '100% guaranteed', 'guarantee', 'assured', 'promise',
    'we promise', 'promised', 'certain', 'definitely', 'surely',
    'no doubt', 'without fail', 'confirmed', 'proven', 'tested',
    'certified', 'verified', 'authentic', 'genuine', 'legitimate',
    'legal', 'authorized', 'approved', 'endorsed'
  ],

  // Clickbait & Deceptive (High Risk)
  clickbait: [
    'click here', 'click now', 'click below', 'click link', 'open link',
    'tap link', 'follow link', 'visit link', 'check link', 'see link',
    'you won\'t believe', 'shocking', 'exposed', 'revealed', 'truth revealed',
    'hidden truth', 'they don\'t want you to know', 'doctors hate', 'secret method',
    'one weird trick', 'this one trick', 'simple trick'
  ],

  // Spam Triggers (Very High Risk)
  spamTriggers: [
    'act now', 'apply now', 'become a member', 'call free', 'call now',
    'cancel anytime', 'can you help', 'check this out', 'click below',
    'click to remove', 'copy accurately', 'deal ending soon', 'do it today',
    'don\'t delete', 'don\'t hesitate', 'expire', 'for instant access',
    'for you', 'get it away', 'get started now', 'give it away', 'here',
    'if only it were that easy', 'important information', 'in accordance with laws',
    'instant', 'join millions', 'limited', 'message contains', 'no age restrictions',
    'no catch', 'no experience', 'no fees', 'no gimmick', 'no inventory',
    'no obligation', 'no questions asked', 'no strings attached',
    'not intended', 'obligation', 'per day', 'per week', 'please read',
    'prize', 'pure profit', 'requires initial investment', 'risk free',
    'satisfaction guaranteed', 'serious cash', 'this isn\'t spam', 'urgent',
    'what are you waiting for', 'while supplies last', 'winner', 'you are a winner',
    'your income'
  ],

  // WhatsApp-Specific Ban Words (Very High Risk)
  whatsappBan: [
    'bulk message', 'bulk messaging', 'mass message', 'broadcast message',
    'automated message', 'bot message', 'marketing message', 'promotional message',
    'click my whatsapp link', 'join my whatsapp group', 'add me on whatsapp',
    'whatsapp business', 'whatsapp marketing', 'whatsapp blast',
    'send to all contacts', 'forward to all', 'share with all'
  ],

  // Pharmacy & Healthcare (Very High Risk - Legal Issues)
  healthcare: [
    'viagra', 'cialis', 'prescription', 'pills', 'pharmacy', 'drug',
    'medication', 'medicine', 'cure', 'treatment', 'lose weight',
    'weight loss', 'diet pills', 'fat burner', 'muscle gain'
  ],

  // Adult Content (Very High Risk - WhatsApp Ban)
  adult: [
    'dating', 'singles', 'meet singles', 'adult content', '18+', 'xxx',
    'mature content', 'hot singles', 'lonely', 'meet girls', 'meet boys'
  ],

  // Loan & Credit (High Risk)
  loan: [
    'loan approved', 'credit approved', 'get loan', 'instant loan',
    'easy loan', 'no credit check', 'bad credit', 'bankruptcy',
    'consolidate debt', 'eliminate debt', 'refinance', 'pre approved'
  ],

  // Cryptocurrency & Investment (High Risk)
  crypto: [
    'bitcoin', 'ethereum', 'crypto', 'cryptocurrency', 'blockchain',
    'trading bot', 'automated trading', 'forex', 'binary options',
    'investment scheme', 'roi guaranteed'
  ]
};

// Professional alternatives for spam words
export const PROFESSIONAL_ALTERNATIVES: { [key: string]: string[] } = {
  'urgent': ['important', 'time-sensitive', 'priority', 'attention needed'],
  'buy now': ['explore our options', 'view details', 'learn more', 'discover more'],
  'limited time': ['available for a period', 'special timeframe', 'seasonal'],
  'free': ['complimentary', 'included', 'at no additional cost', 'bonus'],
  'guaranteed': ['confident', 'assured quality', 'reliable', 'dependable'],
  'amazing': ['notable', 'impressive', 'quality', 'excellent'],
  'click here': ['view more information', 'see details', 'learn more'],
  'act now': ['take action', 'get started', 'begin today', 'start your journey'],
  'incredible': ['noteworthy', 'impressive', 'remarkable', 'significant'],
  'won\'t believe': ['might surprise you', 'interesting', 'noteworthy'],
  'congratulations': ['thank you', 'we appreciate', 'great to connect'],
  'special offer': ['opportunity', 'available now', 'current promotion'],
  'make money': ['earn income', 'generate revenue', 'business opportunity'],
  'risk free': ['low risk', 'secure', 'protected'],
  'limited offer': ['for a limited time', 'seasonal', 'current availability']
};

// Calculate spam score based on word frequency
export const calculateSpamScore = (message: string): { score: number; detectedWords: string[]; category: string } => {
  const lowerMessage = message.toLowerCase();
  const detectedWords: string[] = [];
  let score = 0;

  // Check each category with different weights
  const categoryWeights: { [key: string]: number } = {
    whatsappBan: 50,      // Highest risk
    financial: 40,
    healthcare: 45,
    adult: 50,
    spamTriggers: 35,
    winner: 30,
    clickbait: 25,
    guarantee: 20,
    urgency: 15,
    loan: 35,
    crypto: 30,
    sales: 10,
    freebies: 12,
    superlatives: 8
  };

  let highestRiskCategory = 'clean';
  let maxCategoryScore = 0;

  for (const [category, words] of Object.entries(SPAM_WORDS)) {
    let categoryScore = 0;
    const categoryDetected: string[] = [];

    for (const word of words) {
      if (lowerMessage.includes(word.toLowerCase())) {
        categoryDetected.push(word);
        categoryScore += categoryWeights[category] || 5;
      }
    }

    if (categoryDetected.length > 0) {
      detectedWords.push(...categoryDetected);
      score += categoryScore;

      if (categoryScore > maxCategoryScore) {
        maxCategoryScore = categoryScore;
        highestRiskCategory = category;
      }
    }
  }

  // Additional penalties
  const capsPercentage = (message.match(/[A-Z]/g) || []).length / message.length;
  if (capsPercentage > 0.3) score += 20; // Too many caps

  const exclamationCount = (message.match(/!/g) || []).length;
  if (exclamationCount > 3) score += 10; // Too many exclamations

  const emojiCount = (message.match(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu) || []).length;
  if (emojiCount > 5) score += 15; // Too many emojis

  return {
    score: Math.min(score, 100), // Cap at 100
    detectedWords: [...new Set(detectedWords)], // Remove duplicates
    category: highestRiskCategory
  };
};

// Get risk level based on score
export const getRiskLevel = (score: number): 'safe' | 'low' | 'medium' | 'high' | 'critical' => {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  if (score >= 20) return 'low';
  return 'safe';
};

// Check if message is safe to send
export const isSafeToSend = (score: number): boolean => {
  return score < 60; // Messages with score < 60 are relatively safe
};

export default {
  SPAM_WORDS,
  PROFESSIONAL_ALTERNATIVES,
  calculateSpamScore,
  getRiskLevel,
  isSafeToSend
};

