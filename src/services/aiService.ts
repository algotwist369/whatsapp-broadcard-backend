import OpenAI from 'openai';
import dotenv from 'dotenv';
import { 
  SPAM_WORDS, 
  PROFESSIONAL_ALTERNATIVES, 
  calculateSpamScore, 
  getRiskLevel, 
  isSafeToSend 
} from '../config/spam-words';
dotenv.config();

interface SpamAnalysisResult {
  isSpam: boolean;
  spamWords: string[];
  rewrittenMessage: string;
  confidence: number;
  complianceScore: number;
  riskLevel?: 'safe' | 'low' | 'medium' | 'high' | 'critical';
  spamScore?: number;
  replacements?: Array<{
    original: string;
    replacement: string;
    reason: string;
  }>;
}

interface BulkMessageResult {
  contactName: string;
  personalizedMessage: string;
  delaySeconds: number;
  isSpamFree: boolean;
  complianceScore: number;
  contactIndex: number;
  category?: string;
}

interface UserSettings {
  messageDelay?: number;
  maxRetries?: number;
  autoRetry?: boolean;
}

// Category-based message templates for better personalization
const CATEGORY_TEMPLATES: { [key: string]: string } = {
  promotional: 'Create a friendly promotional message that highlights value without being pushy',
  notification: 'Create a clear and informative notification message that provides important updates',
  advertising: 'Create a professional advertising message that focuses on benefits and value proposition',
  discount_offer: 'Create an appealing discount offer message that emphasizes value without using aggressive sales language',
  information: 'Create an informative message that educates and provides helpful information',
  other: 'Create a professional and personalized message that sounds natural and conversational'
};

class AIService {
  private openai: OpenAI;
  private cache: Map<string, any> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL = 3600000; // 1 hour cache expiry

  constructor() {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'sk-your-openai-api-key-here') {
      console.warn('⚠️  OpenAI API key not configured. AI features will be disabled.');
      return;
    }

    try {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        timeout: 30000, // Increased timeout for better reliability
        maxRetries: 3, // Increased retries for production
      });

      // OpenAI client already initialized above

      // Prompts will be handled inline with OpenAI API calls
      this.startCacheCleanup();
      console.log('✅ AI service initialized with enhanced spam detection');
    } catch (error: any) {
      console.error('❌ Failed to initialize AI service:', error.message);
    }
  }

  // Start periodic cache cleanup to prevent memory leaks
  private startCacheCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, expiry] of this.cacheExpiry.entries()) {
        if (expiry < now) {
          this.cache.delete(key);
          this.cacheExpiry.delete(key);
        }
      }
    }, 600000); // Clean up every 10 minutes
  }

  // Prompts are now handled inline with OpenAI API calls

  // Category prompts are now handled inline with OpenAI API calls

  async analyzeMessage(message: string, category: string): Promise<SpamAnalysisResult> {
    try {
      // First, use local comprehensive spam detection
      const localAnalysis = calculateSpamScore(message);
      const riskLevel = getRiskLevel(localAnalysis.score);
      const isSafe = isSafeToSend(localAnalysis.score);

      console.log(`📊 Spam Analysis - Score: ${localAnalysis.score}, Risk: ${riskLevel}, Safe: ${isSafe}`);

      // If message has critical risk, rewrite it locally
      if (localAnalysis.score >= 80) {
        console.log('⚠️ Critical spam score detected, applying local cleanup');
        const cleanedMessage = this.localSpamCleanup(message, localAnalysis.detectedWords);
        return {
          isSpam: true,
          spamWords: localAnalysis.detectedWords,
          rewrittenMessage: cleanedMessage,
          confidence: 0.95,
          complianceScore: Math.max(20, 100 - localAnalysis.score),
          riskLevel,
          spamScore: localAnalysis.score,
          replacements: this.generateReplacements(localAnalysis.detectedWords)
        };
      }

      // Check cache with expiry
      const cacheKey = `analysis_${Buffer.from(message).toString('base64').substring(0, 50)}_${category}`;
      if (this.cache.has(cacheKey)) {
        const expiry = this.cacheExpiry.get(cacheKey);
        if (expiry && expiry > Date.now()) {
          console.log('📦 Using cached spam analysis');
          return this.cache.get(cacheKey);
        } else {
          this.cache.delete(cacheKey);
          this.cacheExpiry.delete(cacheKey);
        }
      }

      // Use AI for moderate risk messages if available
      if (this.openai && localAnalysis.score < 80) {
        try {
          const prompt = `You are an expert at detecting spam and rewriting messages for WhatsApp Business compliance.

Analyze this message and provide a comprehensive spam analysis in JSON format.

Message: "${message}"
Category: "${category}"

CRITICAL RULES:
1. Identify ALL spam/ban words that could trigger WhatsApp detection
2. Replace spam words with professional alternatives
3. Maintain the core message intent and value
4. Make it sound natural and conversational
5. Remove urgency/pressure tactics
6. Avoid superlatives and exaggerations
7. Keep under 300 characters for mobile optimization
8. DO NOT use: "urgent", "limited time", "act now", "buy now", "click here", "guaranteed", "free money", "congratulations", "winner", "amazing", "incredible"

Return ONLY valid JSON in this exact format:
{
  "isSpam": boolean,
  "spamWords": ["word1", "word2"],
  "rewrittenMessage": "professionally rewritten version",
  "confidence": 0.95,
  "complianceScore": 88,
  "replacements": [
    {"original": "urgent", "replacement": "important", "reason": "Less aggressive"}
  ]
}`;

          const response = await this.openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 500
          });
          
          const content = response.choices[0].message.content || '';

          // Parse AI response
          let aiAnalysis: any;
          try {
            // Extract JSON from response (handle cases where AI adds extra text)
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              aiAnalysis = JSON.parse(jsonMatch[0]);
            } else {
              throw new Error('No JSON found in response');
            }
          } catch (parseError) {
            console.warn('Failed to parse AI response, using local analysis');
            aiAnalysis = null;
          }

          // Combine local and AI analysis
          if (aiAnalysis) {
            const combinedAnalysis: SpamAnalysisResult = {
              isSpam: localAnalysis.score > 40 || aiAnalysis.isSpam,
              spamWords: [...new Set([...localAnalysis.detectedWords, ...(aiAnalysis.spamWords || [])])],
              rewrittenMessage: aiAnalysis.rewrittenMessage || message,
              confidence: Math.max(localAnalysis.score / 100, aiAnalysis.confidence || 0.5),
              complianceScore: Math.min(aiAnalysis.complianceScore || 50, 100 - localAnalysis.score),
              riskLevel,
              spamScore: localAnalysis.score,
              replacements: aiAnalysis.replacements || this.generateReplacements(localAnalysis.detectedWords)
            };

            // Cache the result
            this.cache.set(cacheKey, combinedAnalysis);
            this.cacheExpiry.set(cacheKey, Date.now() + this.CACHE_TTL);

            return combinedAnalysis;
          }
        } catch (aiError) {
          console.warn('AI analysis failed, falling back to local analysis:', aiError);
        }
      }

      // Fallback to local analysis
      const cleanedMessage = localAnalysis.score > 40 
        ? this.localSpamCleanup(message, localAnalysis.detectedWords) 
        : message;

      const finalAnalysis: SpamAnalysisResult = {
        isSpam: localAnalysis.score > 40,
        spamWords: localAnalysis.detectedWords,
        rewrittenMessage: cleanedMessage,
        confidence: localAnalysis.score / 100,
        complianceScore: Math.max(20, 100 - localAnalysis.score),
        riskLevel,
        spamScore: localAnalysis.score,
        replacements: this.generateReplacements(localAnalysis.detectedWords)
      };

      // Cache the result
      this.cache.set(cacheKey, finalAnalysis);
      this.cacheExpiry.set(cacheKey, Date.now() + this.CACHE_TTL);

      return finalAnalysis;

    } catch (error) {
      console.error('Error in comprehensive spam analysis:', error);
      
      // Emergency fallback
      const localAnalysis = calculateSpamScore(message);
      return {
        isSpam: localAnalysis.score > 40,
        spamWords: localAnalysis.detectedWords,
        rewrittenMessage: this.localSpamCleanup(message, localAnalysis.detectedWords),
        confidence: localAnalysis.score / 100,
        complianceScore: Math.max(20, 100 - localAnalysis.score),
        riskLevel: getRiskLevel(localAnalysis.score),
        spamScore: localAnalysis.score,
        replacements: this.generateReplacements(localAnalysis.detectedWords)
      };
    }
  }

  // Local spam cleanup without AI
  private localSpamCleanup(message: string, spamWords: string[]): string {
    let cleaned = message;
    
    // Replace spam words with professional alternatives
    for (const spamWord of spamWords) {
      const alternatives = PROFESSIONAL_ALTERNATIVES[spamWord.toLowerCase()];
      if (alternatives && alternatives.length > 0) {
        const replacement = alternatives[0];
        const regex = new RegExp(spamWord, 'gi');
        cleaned = cleaned.replace(regex, replacement);
      }
    }

    // Remove excessive exclamation marks (keep max 1)
    cleaned = cleaned.replace(/!{2,}/g, '!');
    cleaned = cleaned.replace(/\s!+\s/g, '. ');

    // Fix excessive caps (convert to sentence case)
    if ((cleaned.match(/[A-Z]/g) || []).length > cleaned.length * 0.3) {
      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
    }

    // Remove excessive emojis (keep max 3)
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
    const emojis = cleaned.match(emojiRegex) || [];
    if (emojis.length > 3) {
      cleaned = cleaned.replace(emojiRegex, '');
    }

    return cleaned.trim();
  }

  // Generate replacement suggestions
  private generateReplacements(spamWords: string[]): Array<{original: string; replacement: string; reason: string}> {
    const replacements: Array<{original: string; replacement: string; reason: string}> = [];
    
    for (const word of spamWords) {
      const alternatives = PROFESSIONAL_ALTERNATIVES[word.toLowerCase()];
      if (alternatives && alternatives.length > 0) {
        replacements.push({
          original: word,
          replacement: alternatives[0],
          reason: 'Professional alternative to avoid spam detection'
        });
      }
    }

    return replacements;
  }

  async generateBulkMessages(
    baseMessage: string,
    contacts: Array<{ name: string, phone: string }>,
    delayBetweenMessages: number = 30
  ): Promise<BulkMessageResult[]> {
    const results: BulkMessageResult[] = [];

    try {
      for (let i = 0; i < contacts.length; i++) {
        const contact = contacts[i];
        const variationIndex = (i % 10) + 1;
        const delaySeconds = i * delayBetweenMessages;

        const personalizedMessage = await this.generatePersonalizedMessage(
          baseMessage,
          contact.name,
          variationIndex
        );

        const spamAnalysis = await this.analyzeMessage(personalizedMessage, 'bulk');

        results.push({
          contactName: contact.name,
          personalizedMessage: spamAnalysis.rewrittenMessage,
          delaySeconds,
          isSpamFree: !spamAnalysis.isSpam && spamAnalysis.complianceScore > 80,
          complianceScore: spamAnalysis.complianceScore,
          contactIndex: i
        });

        if (i < contacts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
    } catch (error) {
      console.error('Error generating bulk messages:', error);
    }

    return results;
  }

  async generatePersonalizedMessage(
    baseMessage: string,
    contactName: string,
    variationIndex: number,
    category: string = 'other'
  ): Promise<string> {
    try {
      if (!this.openai) {
        // Fallback: simple personalization
        return this.simplePersonalization(baseMessage, contactName, variationIndex);
      }

      const categoryTemplate = CATEGORY_TEMPLATES[category] || CATEGORY_TEMPLATES.other;
      
      const prompt = `${categoryTemplate}

Base Message: "${baseMessage}"
Contact Name: "${contactName}"
Variation: ${variationIndex}

Requirements:
- Personalized for ${contactName}
- Category: ${category}
- Natural and conversational
- Under 280 characters
- No spam words
- Professional tone
- Unique variation #${variationIndex}

Output only the personalized message.`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 300
      });
      
      let message = response.choices[0].message.content || '';

      // Clean up the message
      message = this.cleanupGeneratedMessage(message, contactName);

      // Apply variation to ensure uniqueness
      message = this.applyVariation(message, variationIndex);

      return message;
    } catch (error) {
      console.error('Error generating personalized message:', error);
      return this.simplePersonalization(baseMessage, contactName, variationIndex);
    }
  }

  // Simple personalization without AI
  private simplePersonalization(baseMessage: string, contactName: string, variationIndex: number): string {
    const greetings = [
      `Hi ${contactName}`, 
      `Hello ${contactName}`, 
      `Hey ${contactName}`,
      `Good day ${contactName}`,
      `${contactName}`,
      `Hi there ${contactName}`
    ];

    const connectors = [
      ', hope you\'re doing well. ',
      ', wanted to reach out to you. ',
      ', I thought you\'d find this interesting. ',
      ', ',
      '! ',
      ', hope this finds you well. '
    ];

    const greeting = greetings[variationIndex % greetings.length];
    const connector = connectors[variationIndex % connectors.length];

    return `${greeting}${connector}${baseMessage}`;
  }

  // Clean up AI-generated messages
  private cleanupGeneratedMessage(message: string, contactName: string): string {
    let cleaned = message;

    // Remove common AI artifacts
    cleaned = cleaned
      .replace(/\s*(Best regards|Thanks|Thank you|Regards|Sincerely|Warm regards|Kind regards)[\s\S]*$/gi, '')
      .replace(/\s*\[.*?\]\s*$/g, '')
      .replace(/^["']|["']$/g, '') // Remove surrounding quotes
      .replace(/^\s*-\s*/gm, '') // Remove leading dashes
      .trim();

    // Ensure contact name is used (but not excessively)
    const nameCount = (cleaned.match(new RegExp(contactName, 'gi')) || []).length;
    if (nameCount === 0) {
      cleaned = `Hi ${contactName}, ${cleaned}`;
    } else if (nameCount > 3) {
      // Too many name mentions, remove excess
      let count = 0;
      cleaned = cleaned.replace(new RegExp(contactName, 'gi'), (match) => {
        count++;
        return count <= 2 ? match : '';
      });
    }

    // Limit message length for WhatsApp (recommended max 1000 chars)
    if (cleaned.length > 1000) {
      cleaned = cleaned.substring(0, 997) + '...';
    }

    return cleaned;
  }

  // Apply variation to make message more unique
  private applyVariation(message: string, variationIndex: number): string {
    // Apply different sentence structures based on variation index
    const variations = [
      (msg: string) => msg, // Original
      (msg: string) => msg.replace(/\. /g, '. By the way, '),
      (msg: string) => msg.replace(/^/, 'Just wanted to mention that '),
      (msg: string) => msg.replace(/\?/g, '? I\'d love to know your thoughts.'),
      (msg: string) => msg + ' Let me know what you think!'
    ];

    const variationFunc = variations[variationIndex % variations.length];
    return variationFunc(message);
  }




}

export default new AIService();
