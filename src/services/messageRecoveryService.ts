import PendingMessage from '../models/PendingMessage';
import ConversationHistory from '../models/ConversationHistory';
import autoReplyService from './autoReplyService';
import Contact from '../models/Contact';

interface RecoveryResult {
  totalPending: number;
  processed: number;
  replied: number;
  failed: number;
  errors: string[];
}

class MessageRecoveryService {
  private recoveryInProgress: Map<string, boolean> = new Map();

  /**
   * Save a message that couldn't be processed immediately (server issue, disconnection, etc.)
   */
  async savePendingMessage(
    userId: string,
    phoneNumber: string,
    message: string,
    messageId?: string
  ): Promise<boolean> {
    try {
      console.log(`💾 Saving pending message from ${phoneNumber} for later processing`);

      // Check if this message already exists (avoid duplicates)
      if (messageId) {
        const existing = await PendingMessage.findOne({
          userId,
          messageId,
          status: { $in: ['pending', 'processing'] }
        });

        if (existing) {
          console.log(`⏭️ Message ${messageId} already saved as pending`);
          return true;
        }
      }

      // Get contact ID if exists
      const contact = await Contact.findOne({
        userId,
        phone: phoneNumber,
        isActive: true
      });

      const pendingMessage = new PendingMessage({
        userId,
        phoneNumber,
        contactId: contact?._id,
        message,
        messageId,
        receivedAt: new Date(),
        status: 'pending',
        processingAttempts: 0
      });

      await pendingMessage.save();
      console.log(`✅ Pending message saved for ${phoneNumber}`);
      return true;

    } catch (error) {
      console.error('Error saving pending message:', error);
      return false;
    }
  }

  /**
   * Process all pending messages for a user when connection is restored
   */
  async processPendingMessages(userId: string): Promise<RecoveryResult> {
    const result: RecoveryResult = {
      totalPending: 0,
      processed: 0,
      replied: 0,
      failed: 0,
      errors: []
    };

    // Check if recovery is already in progress for this user
    if (this.recoveryInProgress.get(userId)) {
      console.log(`⏳ Message recovery already in progress for user: ${userId}`);
      return result;
    }

    try {
      this.recoveryInProgress.set(userId, true);
      console.log(`🔄 Starting message recovery for user: ${userId}`);

      // Get all pending messages for this user, ordered by received time
      const pendingMessages = await PendingMessage.find({
        userId,
        status: 'pending'
      }).sort({ receivedAt: 1 });

      result.totalPending = pendingMessages.length;
      console.log(`📋 Found ${result.totalPending} pending messages to process`);

      if (result.totalPending === 0) {
        return result;
      }

      // Group messages by phone number to maintain conversation context
      const messagesByPhone = new Map<string, typeof pendingMessages>();
      for (const msg of pendingMessages) {
        const existing = messagesByPhone.get(msg.phoneNumber) || [];
        existing.push(msg);
        messagesByPhone.set(msg.phoneNumber, existing);
      }

      console.log(`👥 Messages from ${messagesByPhone.size} different contacts`);

      // Process each conversation sequentially to maintain chat history
      for (const [phoneNumber, messages] of messagesByPhone.entries()) {
        console.log(`\n📞 Processing ${messages.length} messages from ${phoneNumber}`);
        
        try {
          // Get or create conversation history
          let conversation = await ConversationHistory.findOne({
            userId,
            phoneNumber,
            isActive: true
          });

          if (!conversation) {
            const contact = await Contact.findOne({
              userId,
              phone: phoneNumber,
              isActive: true
            });

            conversation = new ConversationHistory({
              userId,
              phoneNumber,
              contactId: contact?._id,
              messages: [],
              messageCount: 0,
              isActive: true
            });
          }

          // Process messages in chronological order
          for (const pendingMsg of messages) {
            try {
              // Mark as processing
              pendingMsg.status = 'processing';
              pendingMsg.processingAttempts += 1;
              pendingMsg.lastAttemptAt = new Date();
              await pendingMsg.save();

              console.log(`  ⚙️ Processing message: "${pendingMsg.message.substring(0, 50)}..."`);

              // Add user message to conversation history first
              (conversation as any).addMessage('user', pendingMsg.message);

              // Process with auto-reply service
              const autoReplyResult = await autoReplyService.processIncomingMessage(
                userId,
                phoneNumber,
                pendingMsg.message
              );

              // Update pending message with result
              pendingMsg.autoReplyResult = {
                shouldReply: autoReplyResult.shouldReply,
                response: autoReplyResult.response,
                autoReplyId: autoReplyResult.autoReplyId,
                confidence: autoReplyResult.confidence
              };

              // If auto-reply should be sent, send it
              if (autoReplyResult.shouldReply && autoReplyResult.response) {
                console.log(`  🤖 Sending auto-reply...`);
                
                const sendResult = await autoReplyService.sendAutoReply(
                  userId,
                  phoneNumber,
                  autoReplyResult.response
                );

                if (sendResult.success) {
                  console.log(`  ✅ Auto-reply sent successfully`);
                  result.replied++;

                  // Add assistant response to conversation history
                  (conversation as any).addMessage(
                    'assistant',
                    autoReplyResult.response,
                    autoReplyResult.autoReplyId
                  );
                } else {
                  console.log(`  ⚠️ Auto-reply send failed: ${sendResult.error}`);
                  pendingMsg.errorMessage = sendResult.error;
                }
              } else {
                console.log(`  ⏭️ No auto-reply needed for this message`);
              }

              // Mark as processed
              pendingMsg.status = 'processed';
              pendingMsg.processedAt = new Date();
              await pendingMsg.save();
              result.processed++;

            } catch (msgError) {
              console.error(`  ❌ Error processing message:`, msgError);
              pendingMsg.status = 'failed';
              pendingMsg.errorMessage = msgError instanceof Error ? msgError.message : 'Unknown error';
              await pendingMsg.save();
              result.failed++;
              result.errors.push(`${phoneNumber}: ${pendingMsg.errorMessage}`);
            }
          }

          // Save conversation history after processing all messages from this contact
          await conversation.save();
          console.log(`  💾 Conversation history saved for ${phoneNumber}`);

        } catch (conversationError) {
          console.error(`❌ Error processing conversation for ${phoneNumber}:`, conversationError);
          result.errors.push(`${phoneNumber}: ${conversationError instanceof Error ? conversationError.message : 'Unknown error'}`);
        }
      }

      console.log(`\n✅ Message recovery completed for user ${userId}:`);
      console.log(`   Total pending: ${result.totalPending}`);
      console.log(`   Processed: ${result.processed}`);
      console.log(`   Replied: ${result.replied}`);
      console.log(`   Failed: ${result.failed}`);

      return result;

    } catch (error) {
      console.error('Error in message recovery:', error);
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
      return result;

    } finally {
      this.recoveryInProgress.delete(userId);
    }
  }

  /**
   * Retry failed messages
   */
  async retryFailedMessages(userId: string): Promise<RecoveryResult> {
    try {
      console.log(`🔄 Retrying failed messages for user: ${userId}`);

      // Reset failed messages to pending if they haven't exceeded max attempts
      const resetResult = await PendingMessage.updateMany(
        {
          userId,
          status: 'failed',
          processingAttempts: { $lt: 5 }
        },
        {
          $set: { status: 'pending' }
        }
      );

      console.log(`🔄 Reset ${resetResult.modifiedCount} failed messages to pending`);

      // Now process them
      return await this.processPendingMessages(userId);

    } catch (error) {
      console.error('Error retrying failed messages:', error);
      return {
        totalPending: 0,
        processed: 0,
        replied: 0,
        failed: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Get pending message stats for a user
   */
  async getPendingStats(userId: string): Promise<{
    pending: number;
    processing: number;
    processed: number;
    failed: number;
    oldestPending?: Date;
  }> {
    try {
      const [pending, processing, processed, failed, oldestPendingMsg] = await Promise.all([
        PendingMessage.countDocuments({ userId, status: 'pending' }),
        PendingMessage.countDocuments({ userId, status: 'processing' }),
        PendingMessage.countDocuments({ userId, status: 'processed' }),
        PendingMessage.countDocuments({ userId, status: 'failed' }),
        PendingMessage.findOne({ userId, status: 'pending' }).sort({ receivedAt: 1 })
      ]);

      return {
        pending,
        processing,
        processed,
        failed,
        oldestPending: oldestPendingMsg?.receivedAt
      };
    } catch (error) {
      console.error('Error getting pending stats:', error);
      return {
        pending: 0,
        processing: 0,
        processed: 0,
        failed: 0
      };
    }
  }

  /**
   * Clean up old processed messages
   */
  async cleanupOldMessages(userId: string, daysOld: number = 7): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await PendingMessage.deleteMany({
        userId,
        status: 'processed',
        processedAt: { $lt: cutoffDate }
      });

      console.log(`🧹 Cleaned up ${result.deletedCount} old processed messages`);
      return result.deletedCount;

    } catch (error) {
      console.error('Error cleaning up old messages:', error);
      return 0;
    }
  }

  /**
   * Check if recovery is needed for a user
   */
  async needsRecovery(userId: string): Promise<boolean> {
    try {
      const pendingCount = await PendingMessage.countDocuments({
        userId,
        status: 'pending'
      });

      return pendingCount > 0;
    } catch (error) {
      console.error('Error checking if recovery needed:', error);
      return false;
    }
  }
}

export default new MessageRecoveryService();

