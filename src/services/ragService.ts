import OpenAI from 'openai';
import { OpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { Document as LangchainDocument } from 'langchain/document';
import KnowledgeBase from '../models/KnowledgeBase';
import pdf from 'pdf-parse';
import fs from 'fs';

interface RAGSearchResult {
  relevantChunks: Array<{
    text: string;
    score: number;
    source: string;
    pageNumber?: number;
  }>;
  hasResults: boolean;
  confidence: number;
}

interface RAGAnswerResult {
  answer: string;
  sources: string[];
  confidence: number;
  shouldConvince: boolean; // Whether to add sales pitch
}

class RAGService {
  private openai: OpenAI;
  private embeddings: OpenAIEmbeddings;
  private vectorStores: Map<string, MemoryVectorStore> = new Map();
  private textSplitter: RecursiveCharacterTextSplitter;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: 'text-embedding-3-small'
    });

    // Optimized text splitter for WhatsApp responses
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
      separators: ['\n\n', '\n', '. ', ' ', '']
    });
  }

  /**
   * Process uploaded PDF and create embeddings
   */
  async processPDF(
    userId: string,
    filePath: string,
    fileName: string,
    category: string,
    description?: string
  ): Promise<string> {
    try {
      console.log(`📄 [START] Processing PDF: ${fileName} for user: ${userId}`);
      console.log(`📄 File path: ${filePath}`);
      console.log(`📄 Category: ${category}`);

      // Read PDF file
      console.log(`📄 [STEP 1] Reading PDF file...`);
      const dataBuffer = fs.readFileSync(filePath);
      console.log(`📄 File read successfully, size: ${dataBuffer.length} bytes`);
      
      console.log(`📄 [STEP 2] Parsing PDF with pdf-parse...`);
      const pdfData = await pdf(dataBuffer);
      console.log(`📄 PDF parsed: ${pdfData.numpages} pages, ${pdfData.text.length} characters`);

      // Split text into chunks
      console.log(`📄 [STEP 3] Splitting text into chunks...`);
      const chunks = await this.textSplitter.createDocuments([pdfData.text]);
      console.log(`📄 Created ${chunks.length} chunks from PDF`);

      // For faster processing, skip embeddings for now and add later
      console.log(`📄 [STEP 4] Creating knowledge base entry (without embeddings for speed)...`);
      const processedChunks = chunks.map((chunk, idx) => ({
        text: chunk.pageContent,
        embedding: [], // Skip embeddings for now - will add if needed
        chunkIndex: idx,
        pageNumber: Math.floor(idx / 4) + 1
      }));

      console.log(`📄 [STEP 5] Saving to database...`);

      // Create knowledge base entry
      console.log(`📄 [STEP 6] Creating database document...`);
      const kb = new KnowledgeBase({
        userId,
        fileName,
        originalFileName: fileName,
        fileType: 'pdf',
        filePath,
        fileSize: fs.statSync(filePath).size,
        category,
        description,
        rawText: pdfData.text,
        processedChunks,
        totalPages: pdfData.numpages,
        totalChunks: chunks.length,
        processingStatus: 'completed',
        embeddingModel: 'text-embedding-3-small',
        lastIndexedAt: new Date(),
        statistics: {
          queriesAnswered: 0,
          successRate: 0
        },
        isActive: true
      });

      console.log(`📄 [STEP 7] Saving to MongoDB...`);
      await kb.save();
      console.log(`📄 [STEP 8] Saved! KB ID: ${kb._id}`);

      // Create vector store for this knowledge base (async, don't wait)
      console.log(`📄 [STEP 9] Creating vector store in background...`);
      this.createVectorStore(userId, kb._id.toString()).catch(err => {
        console.error(`⚠️ Vector store creation failed (non-critical):`, err.message);
      });

      console.log(`✅ [COMPLETE] PDF processed successfully: ${kb._id}`);
      return kb._id.toString();

    } catch (error) {
      console.error('Error processing PDF:', error);
      throw error;
    }
  }

  /**
   * Create or update vector store for a user's knowledge bases
   */
  async createVectorStore(userId: string, knowledgeBaseId?: string): Promise<void> {
    try {
      // Get all active knowledge bases for user
      const query: any = { userId, isActive: true, processingStatus: 'completed' };
      if (knowledgeBaseId) {
        query._id = knowledgeBaseId;
      }

      const knowledgeBases = await KnowledgeBase.find(query);

      if (knowledgeBases.length === 0) {
        console.log(`No knowledge bases found for user: ${userId}`);
        return;
      }

      // Combine all chunks from all knowledge bases
      const allDocuments: LangchainDocument[] = [];

      for (const kb of knowledgeBases) {
        for (const chunk of kb.processedChunks) {
          allDocuments.push(new LangchainDocument({
            pageContent: chunk.text,
            metadata: {
              knowledgeBaseId: kb._id.toString(),
              fileName: kb.fileName,
              category: kb.category,
              chunkIndex: chunk.chunkIndex,
              pageNumber: chunk.pageNumber
            }
          }));
        }
      }

      console.log(`📚 Creating vector store with ${allDocuments.length} documents for user: ${userId}`);

      // Create vector store from documents
      const vectorStore = await MemoryVectorStore.fromDocuments(
        allDocuments,
        this.embeddings
      );

      // Cache the vector store
      this.vectorStores.set(userId, vectorStore);

      console.log(`✅ Vector store created for user: ${userId}`);

    } catch (error) {
      console.error('Error creating vector store:', error);
      throw error;
    }
  }

  /**
   * Search for relevant information from uploaded PDFs
   */
  async searchKnowledge(
    userId: string,
    query: string,
    topK: number = 3
  ): Promise<RAGSearchResult> {
    try {
      // Get or create vector store for user
      if (!this.vectorStores.has(userId)) {
        await this.createVectorStore(userId);
      }

      const vectorStore = this.vectorStores.get(userId);

      if (!vectorStore) {
        console.log(`No vector store found for user: ${userId}`);
        return {
          relevantChunks: [],
          hasResults: false,
          confidence: 0
        };
      }

      // Perform similarity search
      const results = await vectorStore.similaritySearchWithScore(query, topK);

      const relevantChunks = results.map(([doc, score]) => ({
        text: doc.pageContent,
        score: score,
        source: doc.metadata.fileName || 'Unknown',
        pageNumber: doc.metadata.pageNumber
      }));

      // Calculate average confidence
      const avgConfidence = relevantChunks.length > 0
        ? relevantChunks.reduce((sum, chunk) => sum + chunk.score, 0) / relevantChunks.length
        : 0;

      console.log(`🔍 Found ${relevantChunks.length} relevant chunks for query: "${query.substring(0, 50)}..."`);

      return {
        relevantChunks,
        hasResults: relevantChunks.length > 0,
        confidence: avgConfidence
      };

    } catch (error) {
      console.error('Error searching knowledge:', error);
      return {
        relevantChunks: [],
        hasResults: false,
        confidence: 0
      };
    }
  }

  /**
   * Generate AI answer from PDF data with sales focus
   */
  async generateAnswerFromKnowledge(
    userId: string,
    customerQuery: string,
    customerName: string,
    conversationHistory: Array<{ role: string; content: string }> = []
  ): Promise<RAGAnswerResult> {
    try {
      // Search relevant information
      const searchResult = await this.searchKnowledge(userId, customerQuery, 3);

      if (!searchResult.hasResults) {
        return {
          answer: '',
          sources: [],
          confidence: 0,
          shouldConvince: false
        };
      }

      // Build context from relevant chunks
      const context = searchResult.relevantChunks
        .map((chunk, idx) => `[Source ${idx + 1}: ${chunk.source}]\n${chunk.text}`)
        .join('\n\n---\n\n');

      // Build conversation history context
      let conversationContext = '';
      if (conversationHistory.length > 0) {
        conversationContext = '\n\nPREVIOUS CONVERSATION:\n';
        conversationHistory.slice(-4).forEach(msg => {
          conversationContext += `${msg.role === 'user' ? 'Customer' : 'You'}: ${msg.content}\n`;
        });
      }

      // Detect customer intent for sales focus
      const queryLower = customerQuery.toLowerCase();
      const isPriceQuery = queryLower.includes('price') || queryLower.includes('cost') || queryLower.includes('how much') || queryLower.includes('rates');
      const isBookingIntent = queryLower.includes('book') || queryLower.includes('appointment') || queryLower.includes('schedule') || queryLower.includes('reserve');
      const isComparing = queryLower.includes('better') || queryLower.includes('difference') || queryLower.includes('compare') || queryLower.includes('vs');
      const isHesitant = queryLower.includes('expensive') || queryLower.includes('costly') || queryLower.includes('maybe') || queryLower.includes('thinking');

      // Get current time for time-aware responses
      const now = new Date();
      const currentTime = now.toLocaleTimeString('en-IN', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata'
      });
      const currentDate = now.toLocaleDateString('en-IN', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        timeZone: 'Asia/Kolkata'
      });

      // Build sales-focused prompt
      const prompt = `You are a professional spa consultant with SALES EXPERTISE. Answer customer questions using ONLY the provided information from uploaded business documents.

CUSTOMER QUESTION: "${customerQuery}"
CUSTOMER NAME: "${customerName}"
${conversationContext}

CURRENT DATE & TIME:
- Date: ${currentDate}
- Time: ${currentTime}

BUSINESS INFORMATION (from uploaded PDFs):
${context}

CUSTOMER INTENT DETECTED:
${isPriceQuery ? '💰 Asking about PRICING - Show value, mention packages/offers if available' : ''}
${isBookingIntent ? '📅 Ready to BOOK - Make it easy, suggest times, create urgency' : ''}
${isComparing ? '🤔 COMPARING options - Highlight unique benefits, address concerns' : ''}
${isHesitant ? '⚠️ HESITANT about price - Emphasize value, mention ROI, suggest trial/smaller package' : ''}

SALES STRATEGY (CRITICAL - Follow this):
1. ANSWER THE QUESTION: Use ONLY information from sources above
2. ADD VALUE: Briefly mention a benefit or advantage
3. CREATE DESIRE: Make it sound appealing (use sensory words)
4. HANDLE OBJECTIONS: If price question, emphasize value not just cost
5. CALL TO ACTION: End with booking suggestion or question
6. BE NATURAL: Sound human, not salesy

RESPONSE RULES:
1. Keep SHORT (100-150 chars max) - WhatsApp users want quick answers
2. Use ONLY information from the sources provided above
3. If price mentioned, add "Great value for..." or "Popular choice!"
4. If service details, highlight 1-2 KEY benefits
5. ALWAYS end with engaging question: "Want to book?" or "Which time works?" or "Interested?"
6. Use emojis (1-2 max): 😊 🌿 ✨ 💆‍♀️ 🎁
7. Sound conversational, like WhatsApp chat
8. If customer is hesitant, briefly address concern + highlight benefit

EXAMPLES OF GOOD RESPONSES:
Price Query: "Swedish is ₹1800 for 60 mins. Super relaxing! Available today. Want to book? 😊"
Service Query: "Thai massage combines stretching + acupressure. Great for flexibility! Try it? 🌿"
Booking: "Perfect! We have slots at 11am, 2pm, 5pm today. Which works for you? 😊"
Hesitant: "₹2000 for deep tissue is great value - includes consultation + hot stones! Popular choice. Interested? ✨"

IMPORTANT:
- If information NOT in sources: Say "Let me check that for you! Call us at [number from PDF] or visit spaadvisor.in 😊"
- NEVER make up information not in the sources
- ALWAYS be truthful and accurate
- Use bullet points (•) for multiple items
- Be persuasive but NOT pushy

Generate your response (ONLY the response, no explanations):`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a professional spa sales consultant. Answer questions using provided business information and convince customers to book appointments. Keep responses SHORT (100-150 chars), PERSUASIVE, and NATURAL.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 200,
        top_p: 0.9
      });

      const answer = response.choices[0].message.content || '';

      // Update statistics
      await this.updateKnowledgeBaseStats(userId, searchResult.relevantChunks);

      return {
        answer: answer.trim(),
        sources: searchResult.relevantChunks.map(c => c.source),
        confidence: searchResult.confidence,
        shouldConvince: isPriceQuery || isBookingIntent || isHesitant
      };

    } catch (error) {
      console.error('Error generating answer from knowledge:', error);
      return {
        answer: '',
        sources: [],
        confidence: 0,
        shouldConvince: false
      };
    }
  }

  /**
   * Parse text from uploaded file
   */
  async parseTextFromFile(filePath: string, fileType: string): Promise<string> {
    try {
      if (fileType === 'pdf') {
        const dataBuffer = fs.readFileSync(filePath);
        const pdfData = await pdf(dataBuffer);
        return pdfData.text;
      } else if (fileType === 'txt') {
        return fs.readFileSync(filePath, 'utf-8');
      } else {
        throw new Error(`Unsupported file type: ${fileType}`);
      }
    } catch (error) {
      console.error('Error parsing file:', error);
      throw error;
    }
  }

  /**
   * Update knowledge base usage statistics
   */
  private async updateKnowledgeBaseStats(
    userId: string,
    relevantChunks: Array<{ source: string }>
  ): Promise<void> {
    try {
      // Get unique knowledge base IDs from chunks
      const sources = new Set(relevantChunks.map(c => c.source));

      for (const source of sources) {
        await KnowledgeBase.findOneAndUpdate(
          { userId, fileName: source },
          {
            $inc: { 'statistics.queriesAnswered': 1 },
            $set: { 'statistics.lastUsed': new Date() }
          }
        );
      }
    } catch (error) {
      console.error('Error updating stats:', error);
    }
  }

  /**
   * Clear vector store cache for a user
   */
  clearUserCache(userId: string): void {
    this.vectorStores.delete(userId);
    console.log(`🗑️ Cleared vector store cache for user: ${userId}`);
  }

  /**
   * Get knowledge base summary for user
   */
  async getUserKnowledgeSummary(userId: string): Promise<{
    totalDocuments: number;
    totalChunks: number;
    categories: string[];
    lastUpdated?: Date;
  }> {
    try {
      const knowledgeBases = await KnowledgeBase.find({
        userId,
        isActive: true,
        processingStatus: 'completed'
      });

      const categories = [...new Set(knowledgeBases.map(kb => kb.category))];
      const totalChunks = knowledgeBases.reduce((sum, kb) => sum + kb.totalChunks, 0);
      const lastUpdated = knowledgeBases.length > 0
        ? knowledgeBases.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0].updatedAt
        : undefined;

      return {
        totalDocuments: knowledgeBases.length,
        totalChunks,
        categories,
        lastUpdated
      };
    } catch (error) {
      console.error('Error getting knowledge summary:', error);
      return {
        totalDocuments: 0,
        totalChunks: 0,
        categories: []
      };
    }
  }

  /**
   * Delete knowledge base and update vector store
   */
  async deleteKnowledgeBase(userId: string, knowledgeBaseId: string): Promise<boolean> {
    try {
      const kb = await KnowledgeBase.findOne({
        _id: knowledgeBaseId,
        userId
      });

      if (!kb) {
        return false;
      }

      // Delete file
      if (fs.existsSync(kb.filePath)) {
        fs.unlinkSync(kb.filePath);
      }

      // Delete from database
      await KnowledgeBase.findByIdAndDelete(knowledgeBaseId);

      // Rebuild vector store without this document
      this.vectorStores.delete(userId);
      await this.createVectorStore(userId);

      console.log(`✅ Knowledge base deleted: ${knowledgeBaseId}`);
      return true;

    } catch (error) {
      console.error('Error deleting knowledge base:', error);
      return false;
    }
  }
}

export default new RAGService();

