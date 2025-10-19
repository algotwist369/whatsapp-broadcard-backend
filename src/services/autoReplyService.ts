import AutoReply from '../models/AutoReply';
import AutoReplyLog from '../models/AutoReplyLog';
// Removed: ReplyData - No longer using manual data entry
import Contact from '../models/Contact';
import ConversationHistory from '../models/ConversationHistory';
import aiService from './aiService';
import whatsappService from './whatsappService';
import ragService from './ragService';

interface AutoReplyContext {
  contactName: string;
  contactCategory?: string;
  previousMessages: number;
  messageTime: Date;
  messageLength: number;
}

interface AutoReplyResult {
  shouldReply: boolean;
  response?: string;
  autoReplyId?: string;
  confidence?: number;
  processingTime?: number;
  error?: string;
}

class AutoReplyService {
  private activeAutoReplies: Map<string, any[]> = new Map();
  // Removed: replyDataCache - No longer using manual data
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL = 300000; // 5 minutes cache
  private processingQueue: Map<string, Promise<any>> = new Map(); // Prevent duplicate processing

  constructor() {
    this.startCacheCleanup();
  }

  private startCacheCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, expiry] of this.cacheExpiry.entries()) {
        if (expiry < now) {
          this.activeAutoReplies.delete(key);
          // Removed: replyDataCache cleanup
          this.cacheExpiry.delete(key);
        }
      }
    }, 60000); // Clean up every minute
  }

  async processIncomingMessage(
    userId: string,
    phoneNumber: string,
    incomingMessage: string
  ): Promise<AutoReplyResult> {
    const startTime = Date.now();
    
    // Check if already processing this exact message (prevent duplicates)
    const queueKey = `${userId}:${phoneNumber}:${incomingMessage.substring(0, 50)}`;
    if (this.processingQueue.has(queueKey)) {
      console.log(`⏭️ Already processing similar message for ${phoneNumber}, skipping`);
      return { shouldReply: false };
    }
    
    try {
      console.log(`🤖 Processing auto-reply for user ${userId}, phone: ${phoneNumber}`);
      
      // Mark as processing
      const processingPromise = (async () => {
        // Get or load active auto-replies for user (cached)
        const autoReplies = await this.getActiveAutoReplies(userId);
        if (autoReplies.length === 0) {
          console.log('No active auto-replies found for user');
          return { shouldReply: false };
        }
        
        return autoReplies;
      })();
      
      this.processingQueue.set(queueKey, processingPromise);
      const autoReplies = await processingPromise;
      
      if (!Array.isArray(autoReplies) || autoReplies.length === 0) {
        return { shouldReply: false };
      }

      // Check if there's an AI auto-reply rule
      const aiAutoReply = autoReplies.find(ar => ar.responseType === 'ai_generated' && ar.isActive);
      if (aiAutoReply) {
        console.log('🎯 AI Auto-reply found, processing with AI...');
        return await this.processAIAutoReply(aiAutoReply, userId, phoneNumber, incomingMessage, startTime);
      }

      // Get contact information
      const contact = await Contact.findOne({
        userId,
        phone: phoneNumber,
        isActive: true
      });

      const contextData: AutoReplyContext = {
        contactName: contact?.name || 'Customer',
        contactCategory: contact?.category || 'general',
        previousMessages: await this.getPreviousMessageCount(userId, phoneNumber),
        messageTime: new Date(),
        messageLength: incomingMessage.length
      };

      // Check each auto-reply rule
      for (const autoReply of autoReplies) {
        const shouldTrigger = await this.shouldTriggerAutoReply(
          autoReply,
          incomingMessage,
          contextData
        );

        if (shouldTrigger) {
          console.log(`🎯 Auto-reply triggered: ${autoReply.name}`);
          
          const response = await this.generateResponse(
            autoReply,
            incomingMessage,
            contextData
          );

          if (response) {
            // Log the auto-reply
            await this.logAutoReply(
              userId,
              autoReply._id.toString(),
              contact?._id?.toString(),
              incomingMessage,
              autoReply.responseTemplate,
              response,
              autoReply.responseType,
              'success',
              Date.now() - startTime
            );

            // Update statistics
            await this.updateAutoReplyStats(autoReply._id.toString(), true);

            return {
              shouldReply: true,
              response,
              autoReplyId: autoReply._id.toString(),
              confidence: 0.85,
              processingTime: Date.now() - startTime
            };
          }
        }
      }

      console.log('No auto-reply triggered for this message');
      return { shouldReply: false };

    } catch (error) {
      console.error('Error processing auto-reply:', error);
      return {
        shouldReply: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    } finally {
      // Clean up processing queue
      this.processingQueue.delete(queueKey);
    }
  }

  private async processAIAutoReply(
    aiAutoReply: any,
    userId: string,
    phoneNumber: string,
    incomingMessage: string,
    startTime: number
  ): Promise<AutoReplyResult> {
    try {
      // Get contact information
      const contact = await Contact.findOne({
        userId,
        phone: phoneNumber,
        isActive: true
      });

      // Get or create conversation history
      let conversation = await ConversationHistory.findOne({
        userId,
        phoneNumber,
        isActive: true
      });

      if (!conversation) {
        conversation = new ConversationHistory({
          userId,
          phoneNumber,
          contactId: contact?._id,
          messages: [],
          messageCount: 0,
          isActive: true
        });
      }

      // Add incoming message to conversation
      (conversation as any).addMessage('user', incomingMessage);

      // Get recent conversation context (last 5 messages)
      const recentMessages = (conversation as any).getRecentMessages(5);

      const contextData: AutoReplyContext = {
        contactName: contact?.name || 'Customer',
        contactCategory: contact?.category || 'general',
        previousMessages: conversation.messageCount,
        messageTime: new Date(),
        messageLength: incomingMessage.length
      };

      // ✅ ONLY USE UPLOADED PDFs - NO MANUAL DATA
      console.log(`📚 Checking for uploaded PDF knowledge base...`);
      
      const knowledgeSummary = await ragService.getUserKnowledgeSummary(userId);
      
      if (knowledgeSummary.totalDocuments === 0) {
        console.log(`❌ No PDFs uploaded! Auto-reply requires uploaded business documents.`);
        
        // Log to auto-reply for tracking
        await this.logAutoReply(
          userId,
          aiAutoReply._id.toString(),
          undefined,
          incomingMessage,
          'No PDFs uploaded',
          'Please upload business PDFs in Knowledge Base to enable auto-replies.',
          'ai_generated',
          'failed',
          Date.now() - startTime
        );
        
        return {
          shouldReply: false,
          error: 'No PDF knowledge base uploaded. Please upload business documents.'
        };
      }
      
      console.log(`📚 Using RAG with ${knowledgeSummary.totalDocuments} PDF documents`);
      
      // Generate answer from PDF data (REQUIRED - no fallback to manual data)
      const ragAnswer = await ragService.generateAnswerFromKnowledge(
        userId,
        incomingMessage,
        contextData.contactName,
        recentMessages
      );
      
      if (ragAnswer.answer && ragAnswer.confidence > 0.15) {
        console.log(`✅ RAG found relevant answer (confidence: ${ragAnswer.confidence})`);
        
        // Add assistant response to conversation history
        (conversation as any).addMessage('assistant', ragAnswer.answer, aiAutoReply._id);
        await conversation.save();
        
        // Log the auto-reply
        await this.logAutoReply(
          userId,
          aiAutoReply._id.toString(),
          contact?._id?.toString(),
          incomingMessage,
          'AI Generated from PDF',
          ragAnswer.answer,
          'ai_generated',
          'success',
          Date.now() - startTime
        );
        
        // Update statistics
        await this.updateAutoReplyStats(aiAutoReply._id.toString(), true);
        
        // Use RAG answer directly from PDFs
        return {
          shouldReply: true,
          response: ragAnswer.answer,
          autoReplyId: aiAutoReply._id.toString(),
          confidence: ragAnswer.confidence,
          processingTime: Date.now() - startTime
        };
      } else {
        console.log(`⚠️ RAG confidence too low (${ragAnswer.confidence}) or no answer found`);
        console.log(`💡 Suggestion: Upload more detailed business PDFs to improve answers`);
        
        return {
          shouldReply: false,
          error: 'No relevant information found in uploaded PDFs. Please upload more detailed business documents.'
        };
      }

      // Removed: Old AI fallback without PDF data
      // System now REQUIRES uploaded PDFs for AI auto-replies
      
      console.log(`✅ PDF RAG system is the ONLY source for AI auto-replies`);
      return { shouldReply: false, error: 'PDF RAG did not find relevant answer' };

    } catch (error) {
      console.error('Error processing AI auto-reply:', error);
      return {
        shouldReply: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async getActiveAutoReplies(userId: string): Promise<any[]> {
    const cacheKey = `autoReplies_${userId}`;
    
    // Check cache first
    if (this.activeAutoReplies.has(cacheKey)) {
      const expiry = this.cacheExpiry.get(cacheKey);
      if (expiry && expiry > Date.now()) {
        return this.activeAutoReplies.get(cacheKey) || [];
      }
    }

    // Load from database
    const autoReplies = await AutoReply.find({
      userId,
      isActive: true
    }).sort({ priority: -1, createdAt: -1 });

    // Cache the results
    this.activeAutoReplies.set(cacheKey, autoReplies);
    this.cacheExpiry.set(cacheKey, Date.now() + this.CACHE_TTL);

    return autoReplies;
  }

  private async shouldTriggerAutoReply(
    autoReply: any,
    incomingMessage: string,
    contextData: AutoReplyContext
  ): Promise<boolean> {
    try {
      // Check time restrictions
      if (autoReply.conditions?.timeRestrictions) {
        const now = new Date();
        const currentHour = now.getHours();
        const currentDay = now.getDay();

        const { startTime, endTime, daysOfWeek } = autoReply.conditions.timeRestrictions;

        // Check day of week
        if (daysOfWeek && daysOfWeek.length > 0 && !daysOfWeek.includes(currentDay)) {
          return false;
        }

        // Check time range
        if (startTime && endTime) {
          const [startHour, startMin] = startTime.split(':').map(Number);
          const [endHour, endMin] = endTime.split(':').map(Number);
          const currentMinutes = currentHour * 60 + now.getMinutes();
          const startMinutes = startHour * 60 + startMin;
          const endMinutes = endHour * 60 + endMin;

          if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
            return false;
          }
        }
      }

      // Check contact filters
      if (autoReply.conditions?.contactFilters) {
        const { categories, tags, excludeContacts } = autoReply.conditions.contactFilters;

        if (categories && categories.length > 0 && !categories.includes(contextData.contactCategory)) {
          return false;
        }

        if (excludeContacts && excludeContacts.length > 0) {
          // This would need contact ID, skip for now
        }
      }

      // Check message filters
      if (autoReply.conditions?.messageFilters) {
        const { minLength, maxLength, containsAny, containsAll } = autoReply.conditions.messageFilters;

        if (minLength && contextData.messageLength < minLength) {
          return false;
        }

        if (maxLength && contextData.messageLength > maxLength) {
          return false;
        }

        if (containsAll && containsAll.length > 0) {
          const message = incomingMessage.toLowerCase();
          const allPresent = containsAll.every(term => message.includes(term.toLowerCase()));
          if (!allPresent) return false;
        }

        if (containsAny && containsAny.length > 0) {
          const message = incomingMessage.toLowerCase();
          const anyPresent = containsAny.some(term => message.includes(term.toLowerCase()));
          if (!anyPresent) return false;
        }
      }

      // Check trigger keywords
      if (autoReply.triggerKeywords && autoReply.triggerKeywords.length > 0) {
        const message = incomingMessage.toLowerCase();
        const keywordMatch = autoReply.triggerKeywords.some(keyword => 
          message.includes(keyword.toLowerCase())
        );
        if (!keywordMatch) return false;
      }

      // Check trigger patterns (regex)
      if (autoReply.triggerPatterns && autoReply.triggerPatterns.length > 0) {
        const patternMatch = autoReply.triggerPatterns.some(pattern => {
          try {
            const regex = new RegExp(pattern, 'i');
            return regex.test(incomingMessage);
          } catch (error) {
            console.error('Invalid regex pattern:', pattern, error);
            return false;
          }
        });
        if (!patternMatch) return false;
      }

      return true;

    } catch (error) {
      console.error('Error checking auto-reply conditions:', error);
      return false;
    }
  }

  private async generateResponse(
    autoReply: any,
    incomingMessage: string,
    contextData: AutoReplyContext
  ): Promise<string | null> {
    try {
      switch (autoReply.responseType) {
        case 'text':
          return autoReply.responseTemplate;

        case 'template':
          return this.processTemplate(autoReply.responseTemplate, contextData);

        case 'ai_generated':
          if (autoReply.aiSettings?.useAI) {
            const aiResult = await aiService.generateAutoReply(
              incomingMessage,
              contextData.contactName,
              contextData,
              autoReply.aiSettings.personality,
              autoReply.aiSettings.includeGreeting,
              autoReply.aiSettings.includeClosing
            );
            return aiResult.response;
          }
          return autoReply.responseTemplate;

        default:
          return autoReply.responseTemplate;
      }
    } catch (error) {
      console.error('Error generating response:', error);
      return autoReply.responseTemplate; // Fallback to template
    }
  }

  private processTemplate(template: string, contextData: AutoReplyContext): string {
    let processed = template;

    // Replace placeholders
    processed = processed.replace(/\{contactName\}/g, contextData.contactName);
    processed = processed.replace(/\{contactCategory\}/g, contextData.contactCategory || 'Customer');
    processed = processed.replace(/\{messageTime\}/g, contextData.messageTime.toLocaleString());
    processed = processed.replace(/\{previousMessages\}/g, contextData.previousMessages.toString());

    return processed;
  }

  private async getPreviousMessageCount(userId: string, phoneNumber: string): Promise<number> {
    try {
      // This would need to be implemented based on your message history
      // For now, return 0
      return 0;
    } catch (error) {
      console.error('Error getting previous message count:', error);
      return 0;
    }
  }

  private async logAutoReply(
    userId: string,
    autoReplyId: string,
    contactId: string | undefined,
    incomingMessage: string,
    originalResponse: string,
    finalResponse: string,
    responseType: string,
    status: string,
    processingTime: number
  ): Promise<void> {
    try {
      const log = new AutoReplyLog({
        userId,
        autoReplyId,
        contactId,
        incomingMessage,
        originalResponse,
        finalResponse,
        responseType,
        status,
        processingTime,
        contextData: {
          messageLength: incomingMessage.length,
          messageTime: new Date()
        }
      });

      await log.save();
    } catch (error) {
      console.error('Error logging auto-reply:', error);
    }
  }

  private async updateAutoReplyStats(autoReplyId: string, success: boolean): Promise<void> {
    try {
      const updateData: any = {
        $inc: { 'statistics.totalTriggers': 1 },
        $set: { 'statistics.lastTriggered': new Date() }
      };

      if (success) {
        updateData.$inc['statistics.successfulReplies'] = 1;
      } else {
        updateData.$inc['statistics.failedReplies'] = 1;
      }

      await AutoReply.findByIdAndUpdate(autoReplyId, updateData);
    } catch (error) {
      console.error('Error updating auto-reply stats:', error);
    }
  }

  async sendAutoReply(
    userId: string,
    phoneNumber: string,
    response: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const result = await whatsappService.sendMessage(userId, phoneNumber, response);
      
      if (result.success) {
        console.log(`✅ Auto-reply sent successfully to ${phoneNumber}`);
      } else {
        console.error(`❌ Failed to send auto-reply to ${phoneNumber}:`, result.error);
      }

      return result;
    } catch (error) {
      console.error('Error sending auto-reply:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Removed: getReplyData and findBestReplyFromData methods
  // System now ONLY uses uploaded PDFs via RAG service
  // No manual data entry supported

  // Clear cache for a specific user
  clearUserCache(userId: string): void {
    const keysToDelete = [];
    for (const key of this.activeAutoReplies.keys()) {
      if (key.startsWith(`autoReplies_${userId}`)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => {
      this.activeAutoReplies.delete(key);
      // Removed: replyDataCache
      this.cacheExpiry.delete(key);
    });
  }
}

export default new AutoReplyService();
