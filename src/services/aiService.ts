import OpenAI from 'openai';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
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
  private llm: ChatOpenAI;
  private spamDetectionPrompt!: PromptTemplate;
  private bulkMessagingPrompt!: PromptTemplate;
  private categoryPrompts!: Map<string, PromptTemplate>;
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

      this.llm = new ChatOpenAI({
        openAIApiKey: process.env.OPENAI_API_KEY,
        modelName: 'gpt-3.5-turbo',
        temperature: 0.7, // Increased for more natural variations
        maxTokens: 500, // Increased for better content generation
        timeout: 30000, // Increased timeout
      });

      this.initializePrompts();
      this.initializeCategoryPrompts();
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

  private initializePrompts(): void {
    this.spamDetectionPrompt = new PromptTemplate({
      template: `You are an expert at detecting spam and rewriting messages for WhatsApp Business compliance.

Analyze this message and provide a comprehensive spam analysis in JSON format.

Message: "{message}"
Category: "{category}"

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
{{
  "isSpam": boolean,
  "spamWords": ["word1", "word2"],
  "rewrittenMessage": "professionally rewritten version",
  "confidence": 0.95,
  "complianceScore": 88,
  "replacements": [
    {{"original": "urgent", "replacement": "important", "reason": "Less aggressive"}}
  ]
}}`,
      inputVariables: ['message', 'category'],
    });

    this.bulkMessagingPrompt = new PromptTemplate({
      template: `Create a UNIQUE, natural WhatsApp message for personalized bulk messaging.

Base Message: "{baseMessage}"
Contact Name: "{contactName}"
Message Category: "{category}"
Variation Number: {variationIndex}

CRITICAL REQUIREMENTS:
1. Each message MUST be completely different from the base message
2. Use the contact name naturally (max 2 times)
3. Maintain professional, conversational tone
4. Keep message under 280 characters (optimal for mobile)
5. NO spam words: avoid "urgent", "limited", "special offer", "click", "guaranteed"
6. NO generic greetings like "Dear Sir/Madam"
7. NO formal closings like "Best regards", "Sincerely"
8. Sound like a personal message from a real person
9. Use category context to personalize (promotional/informational/notification)
10. Add value and be helpful, not pushy

Generate a message that sounds genuinely personal and professional.
Output ONLY the message text, nothing else.`,
      inputVariables: ['baseMessage', 'contactName', 'category', 'variationIndex'],
    });
  }

  // Initialize category-specific prompts for better personalization
  private initializeCategoryPrompts(): void {
    this.categoryPrompts = new Map();

    for (const [category, template] of Object.entries(CATEGORY_TEMPLATES)) {
      this.categoryPrompts.set(category, new PromptTemplate({
        template: `${template}

Base Message: "{baseMessage}"
Contact Name: "{contactName}"
Variation: {variationIndex}

Requirements:
- Personalized for {contactName}
- Category: ${category}
- Natural and conversational
- Under 280 characters
- No spam words
- Professional tone
- Unique variation #{variationIndex}

Output only the personalized message.`,
        inputVariables: ['baseMessage', 'contactName', 'variationIndex'],
      }));
    }
  }

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
      if (this.llm && this.spamDetectionPrompt && localAnalysis.score < 80) {
        try {
          const prompt = await this.spamDetectionPrompt.format({ message, category });
          const response = await this.llm.invoke(prompt);
          const content = response.content as string;

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
      if (!this.llm || !this.bulkMessagingPrompt) {
        // Fallback: simple personalization
        return this.simplePersonalization(baseMessage, contactName, variationIndex);
      }

      // Use category-specific prompt if available
      const promptTemplate = this.categoryPrompts?.get(category) || this.bulkMessagingPrompt;

      const prompt = await promptTemplate.format({
        baseMessage,
        contactName,
        variationIndex,
        category
      });

      const response = await this.llm.invoke(prompt);
      let message = response.content as string;

      // Clean up the message
      message = this.cleanupGeneratedMessage(message, contactName);

      // Ensure it's not too similar to base message
      if (this.calculateSimilarity(message, baseMessage) > 0.8) {
        console.log('⚠️ Generated message too similar to base, applying variation');
        message = this.applyVariation(message, variationIndex);
      }

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

  // Calculate message similarity
  private calculateSimilarity(message1: string, message2: string): number {
    const words1 = message1.toLowerCase().split(/\s+/);
    const words2 = message2.toLowerCase().split(/\s+/);
    
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
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

  // Auto-reply specific methods
  async generateAutoReply(
    incomingMessage: string,
    contactName: string,
    contextData: any,
    personality: 'professional' | 'friendly' | 'casual' | 'formal' = 'professional',
    includeGreeting: boolean = true,
    includeClosing: boolean = true,
    conversationHistory: Array<{ role: string; content: string; timestamp: Date }> = []
  ): Promise<{
    response: string;
    confidence: number;
    processingTime: number;
  }> {
    const startTime = Date.now();
    
    try {
      if (!this.llm) {
        return {
          response: this.generateFallbackReply(incomingMessage, contactName, personality),
          confidence: 0.3,
          processingTime: Date.now() - startTime
        };
      }

      const prompt = this.buildAutoReplyPrompt(
        incomingMessage,
        contactName,
        contextData,
        personality,
        includeGreeting,
        includeClosing,
        conversationHistory
      );

      const response = await this.llm.invoke(prompt);
      let reply = response.content as string;

      // Clean up the response
      reply = this.cleanupAutoReply(reply, contactName);

      return {
        response: reply,
        confidence: 0.85,
        processingTime: Date.now() - startTime
      };

    } catch (error) {
      console.error('Error generating auto-reply:', error);
      return {
        response: this.generateFallbackReply(incomingMessage, contactName, personality),
        confidence: 0.3,
        processingTime: Date.now() - startTime
      };
    }
  }

  private buildAutoReplyPrompt(
    incomingMessage: string,
    contactName: string,
    contextData: any,
    personality: string,
    includeGreeting: boolean,
    includeClosing: boolean,
    conversationHistory: Array<{ role: string; content: string; timestamp: Date }> = []
  ): string {
    const personalityInstructions = {
      professional: 'Use a professional, business-like tone. Be polite and formal.',
      friendly: 'Use a warm, friendly tone. Be approachable and conversational.',
      casual: 'Use a casual, relaxed tone. Be informal but respectful.',
      formal: 'Use a very formal, official tone. Be extremely polite and structured.'
    };

    // Get current date and time information for time-aware responses
    const now = new Date();
    const currentTime = now.toLocaleTimeString('en-IN', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata'
    });
    const currentDate = now.toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Asia/Kolkata'
    });
    const currentHour = now.getHours();
    const dayOfWeek = now.toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'Asia/Kolkata' });
    
    // Determine time of day
    let timeOfDay = 'day';
    if (currentHour < 12) timeOfDay = 'morning';
    else if (currentHour < 17) timeOfDay = 'afternoon';
    else timeOfDay = 'evening';

    // Build conversation context if available
    let conversationContext = '';
    if (conversationHistory && conversationHistory.length > 0) {
      conversationContext = '\n\nPREVIOUS CONVERSATION (for context only - DO NOT repeat information):\n';
      conversationHistory.slice(-4).forEach(msg => { // Only last 4 messages
        const role = msg.role === 'user' ? 'Customer' : 'You';
        conversationContext += `${role}: ${msg.content}\n`;
      });
      conversationContext += '\nNOTE: Customer remembers previous conversation. DO NOT repeat yourself or greet again if you already did.';
    }

    // Detect customer intent
    const messageLower = incomingMessage.toLowerCase();
    const isHesitant = messageLower.includes('maybe') || messageLower.includes('thinking') || messageLower.includes('not sure') || messageLower.includes('expensive') || messageLower.includes('costly');
    const isNotInterested = messageLower.includes('not interested') || messageLower.includes('no thanks') || messageLower.includes('not now') || (messageLower.includes('no') && messageLower.split(' ').length < 5);
    
    let specialInstructions = '';
    if (isNotInterested) {
      specialInstructions = '\n\n⚠️ CUSTOMER NOT INTERESTED: Politely thank them, wish them well, mention they can visit https://spaadvisor.in/ for future reference, and gracefully end conversation. Keep it SHORT and respectful.';
    } else if (isHesitant) {
      specialInstructions = '\n\n💡 CUSTOMER HESITANT: Gently highlight benefits, mention special offers if applicable, address their concern positively, but don\'t be pushy. Keep it brief and helpful.';
    }

    return `You are a professional spa consultant responding via WhatsApp. Generate SHORT, PROFESSIONAL, PERSUASIVE responses.

INCOMING MESSAGE: "${incomingMessage}"
CONTACT NAME: "${contactName}"
PERSONALITY: ${personalityInstructions[personality as keyof typeof personalityInstructions]}
${conversationContext}${specialInstructions}

CURRENT DATE & TIME (IMPORTANT - Use this for time-aware responses):
- Current Date: ${currentDate}
- Current Time: ${currentTime}
- Day of Week: ${dayOfWeek}
- Time of Day: ${timeOfDay}
- Current Hour: ${currentHour}h (24-hour format)

⚠️ CRITICAL TIME RULES:
1. NEVER suggest appointments for times that have ALREADY PASSED today
2. If current time is 2pm, don't suggest "10am today" - suggest "tomorrow at 10am" or "later today at 4pm"
3. Business hours are typically 9 AM to 8 PM
4. If customer asks "can I come today at 3pm" and it's already 5pm, suggest tomorrow or next available time
5. Always be realistic about timing - check current time before suggesting

CONTEXT DATA:
- Messages exchanged: ${contextData.previousMessages || 0}
- Customer category: ${contextData.contactCategory || 'general'}

CONVERSATION STRATEGY:
1. UNDERSTAND: First understand what customer needs
2. EXTRACT KEY INFO: Focus on important details (service type, budget, timing, location)
3. PROVIDE VALUE: Give useful, relevant information
4. PERSUADE GENTLY: If hesitant, mention benefits/offers without being pushy
5. GRACEFUL EXIT: If not interested, politely say goodbye and mention website

RESPONSE RULES (Make it sound HUMAN):
1. Keep SHORT (80-120 chars ideal, MAX 150)
2. Be DIRECT and USEFUL
3. ${conversationHistory.length > 0 ? 'Continue naturally - NO repeat greeting' : includeGreeting ? `Brief greeting: "Hi ${contactName}!"` : 'Skip greeting'}
4. If INFO NOT AVAILABLE: Politely say "For detailed info, visit https://spaadvisor.in/ or call us!"
5. For HESITANT customers: Briefly mention benefits/offers, ask if they want to know more
6. Use conversational language (avoid robotic phrases)
7. Add appropriate emojis (1-2 max) to feel warm and human
8. If customer mentions specific time/date, validate it's in the future before confirming

BOOKING & TIMING EXAMPLES (Follow these patterns):
- If customer asks for appointment TODAY and it's already ${currentTime}:
  ✅ "Our slots for today are full. How about tomorrow at 11am?"
  ✅ "We can fit you in tomorrow morning. Would 10am work?"
  ❌ "Perfect! See you today at 10am" (if it's already past 10am)

- If customer asks "Can I come at 3pm?" and it's already 5pm:
  ✅ "3pm has passed for today. Would tomorrow at 3pm work for you?"
  ✅ "How about tomorrow at 3pm instead?"
  ❌ "Sure, 3pm works!" (time has passed)

- If it's ${timeOfDay} (${currentTime}):
  ✅ Suggest times AFTER current time
  ✅ Suggest tomorrow's times
  ❌ DON'T suggest times that already passed today

NATURAL CONVERSATION EXAMPLES:
- Instead of: "Your appointment has been confirmed for 10am"
  Say: "Great! I've noted down 10am tomorrow. See you then! 😊"

- Instead of: "We offer deep tissue massage at Rs 2000"
  Say: "Deep tissue is ₹2000 for 60 mins. Very popular! Want to book?"

- Instead of: "Please visit our website"
  Say: "Check out spaadvisor.in for more details! 😊"
6. For NOT INTERESTED: "No problem! Visit https://spaadvisor.in/ anytime. Have a great day! 🙏" and STOP
7. Use bullet points (•) for lists
8. NO repetition
9. Sound natural, like WhatsApp chat
10. End with engaging question (unless customer said NO)

SPECIFIC TIME/DATE HANDLING:
- Current time is ${currentTime} on ${dayOfWeek}
- If customer asks "today at 10am" and current time is after 10am:
  → Say: "10am has passed. Tomorrow at 10am work for you?"
- If customer asks "today at 5pm" and current time is 2pm:
  → Say: "Sure! 5pm today works. See you then!"
- If customer mentions specific date:
  → Validate it's not in the past
  → Confirm with day of week for clarity
- Always suggest NEXT AVAILABLE slot, not past times

EXAMPLES:
Query: "thai massage price"
✅ "Thai: 60min ₹2199, 90min ₹3199. Traditional stretching + acupressure. Interested?"

Hesitant: "expensive"
✅ "We have packages from ₹1499! Plus first-visit 20% off. Great value for wellness. Worth trying?"

Not interested: "no thanks"
✅ "No problem! Visit https://spaadvisor.in/ anytime. Have a wonderful day! 🙏"

Info not available: "special facial treatment"
✅ "For detailed facial options, please visit https://spaadvisor.in/ or call us. We'll help you find perfect treatment!"

Generate SHORT, PROFESSIONAL, PERSUASIVE response!`;
  }

  private generateFallbackReply(
    incomingMessage: string,
    contactName: string,
    personality: string
  ): string {
    const greetings = {
      professional: `Hello ${contactName}`,
      friendly: `Hi ${contactName}`,
      casual: `Hey ${contactName}`,
      formal: `Dear ${contactName}`
    };

    const closings = {
      professional: 'Best regards',
      friendly: 'Thanks!',
      casual: 'Cheers!',
      formal: 'Sincerely'
    };

    const greeting = greetings[personality as keyof typeof greetings];
    const closing = closings[personality as keyof typeof closings];

    // Simple keyword-based responses
    const message = incomingMessage.toLowerCase();
    
    if (message.includes('hello') || message.includes('hi') || message.includes('hey')) {
      return `${greeting}! How can I help you today? ${closing}`;
    }
    
    if (message.includes('price') || message.includes('cost')) {
      return `${greeting}! I'd be happy to provide pricing information. Let me get the details for you. ${closing}`;
    }
    
    if (message.includes('service') || message.includes('help')) {
      return `${greeting}! I'm here to help. What specific service are you interested in? ${closing}`;
    }
    
    if (message.includes('?')) {
      return `${greeting}! That's a great question. Let me provide you with the information you need. ${closing}`;
    }
    
    return `${greeting}! Thank you for your message. I'll get back to you with more information. ${closing}`;
  }

  private cleanupAutoReply(reply: string, contactName: string): string {
    let cleaned = reply;

    // Remove common AI artifacts
    cleaned = cleaned
      .replace(/^["']|["']$/g, '') // Remove surrounding quotes
      .replace(/\s*\[.*?\]\s*$/g, '') // Remove trailing brackets
      .replace(/^\s*-\s*/gm, '') // Remove leading dashes
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim();

    // Remove overly polite/lengthy phrases to keep it short
    cleaned = cleaned
      .replace(/Thank you (?:so much|very much) for (?:your|the) message[.!]?\s*/gi, '')
      .replace(/I(?:'d| would) be (?:happy|glad|delighted) to (?:help|assist)(?: you)?[.!]?\s*/gi, '')
      .replace(/Please (?:feel free to|don't hesitate to)\s+/gi, '')
      .replace(/(?:Is there anything else|Anything else) (?:I can help you with|that I can do for you)[?]?\s*/gi, '');

    // Ensure contact name is used appropriately (max 1 time for brevity)
    const nameCount = (cleaned.match(new RegExp(contactName, 'gi')) || []).length;
    if (nameCount > 1) {
      // Remove excess name mentions (keep only first occurrence)
      let count = 0;
      cleaned = cleaned.replace(new RegExp(contactName, 'gi'), (match) => {
        count++;
        return count === 1 ? match : '';
      });
    }

    // Enforce maximum length (250 chars for WhatsApp brevity)
    if (cleaned.length > 250) {
      // Try to cut at sentence boundary
      const sentences = cleaned.match(/[^.!?]+[.!?]+/g) || [cleaned];
      let truncated = '';
      for (const sentence of sentences) {
        if ((truncated + sentence).length <= 247) {
          truncated += sentence;
        } else {
          break;
        }
      }
      if (truncated.length > 50) {
        cleaned = truncated.trim();
      } else {
        cleaned = cleaned.substring(0, 247) + '...';
      }
    }

    return cleaned;
  }

  async findBestReplyMatch(
    incomingMessage: string,
    replyData: Array<{ key: string; value: string; priority?: number }>
  ): Promise<{
    bestMatch: { key: string; value: string; priority: number } | null;
    confidence: number;
    matches: Array<{ key: string; value: string; score: number }>;
  }> {
    const message = incomingMessage.toLowerCase();
    const matches: Array<{ key: string; value: string; score: number }> = [];

    for (const item of replyData) {
      const key = item.key.toLowerCase();
      let score = 0;

      // Exact match
      if (message.includes(key)) {
        score = 100;
      }
      // Partial match
      else if (key.includes(message) || message.includes(key)) {
        score = 80;
      }
      // Keyword matching
      else {
        const keywords = key.split(/\s+/);
        const matchedKeywords = keywords.filter(keyword => 
          keyword.length > 2 && message.includes(keyword)
        );
        score = (matchedKeywords.length / keywords.length) * 60;
      }

      if (score > 30) {
        matches.push({
          key: item.key,
          value: item.value,
          score
        });
      }
    }

    // Sort by score and priority
    matches.sort((a, b) => {
      const aPriority = replyData.find(item => item.key === a.key)?.priority || 1;
      const bPriority = replyData.find(item => item.key === b.key)?.priority || 1;
      return (b.score * bPriority) - (a.score * aPriority);
    });

    const bestMatch = matches.length > 0 ? {
      key: matches[0].key,
      value: matches[0].value,
      priority: replyData.find(item => item.key === matches[0].key)?.priority || 1
    } : null;

    return {
      bestMatch,
      confidence: matches.length > 0 ? matches[0].score / 100 : 0,
      matches: matches.slice(0, 5) // Top 5 matches
    };
  }
}

export default new AIService();
