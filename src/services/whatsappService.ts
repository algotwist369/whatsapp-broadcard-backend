import { Client, LocalAuth, Message } from 'whatsapp-web.js';
import fs from 'fs';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import QRCode from 'qrcode';
import dotenv from 'dotenv';
import autoReplyService from './autoReplyService';
dotenv.config();

interface WhatsAppConnection {
  client: Client;
  qr: string | null;
  isConnected: boolean;
  connectionState: string;
}

class WhatsAppService {
  private connections: Map<string, WhatsAppConnection> = new Map();
  private readonly sessionPath: string;
  private io: SocketIOServer | null = null;
  private connectionAttempts: Map<string, boolean> = new Map(); // Track connection attempts
  private messageListenersSetup: Map<string, boolean> = new Map(); // Track users with message listeners
  private isInitialized: boolean = false;

  constructor() {
    this.sessionPath = process.env.WHATSAPP_SESSION_PATH || './sessions';
    this.ensureSessionDirectory();
  }

  setSocketIO(io: SocketIOServer) {
    this.io = io;
  }

  // Initialize service and restore existing connections
  async initialize() {
    if (this.isInitialized) return;

    try {
      console.log('🔄 Initializing WhatsApp service and restoring connections...');
      await this.restoreExistingConnections();
      this.isInitialized = true;
      console.log('✅ WhatsApp service initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing WhatsApp service:', error);
    }
  }

  // Restore existing connections from database
  private async restoreExistingConnections() {
    try {
      // Import User model dynamically to avoid circular dependencies
      const User = (await import('../models/User.js')).default as any;

      // Find all users with active WhatsApp connections
      const connectedUsers = await User.find({
        whatsappConnected: true,
        isActive: true
      }).select('_id whatsappSessionId');

      console.log(`📱 Found ${connectedUsers.length} users with WhatsApp connections to restore`);

      for (const user of connectedUsers) {
        const userId = user._id.toString();
        const sessionPath = path.join(this.sessionPath, `session-${userId}`);

        // Check if session files exist
        if (fs.existsSync(sessionPath)) {
          console.log(`🔄 Restoring connection for user: ${userId}`);
          try {
            await this.restoreUserConnection(userId);
          } catch (error) {
            console.error(`❌ Failed to restore connection for user ${userId}:`, error);
            // Update user status if restoration fails
            await User.findByIdAndUpdate(userId, { whatsappConnected: false });
          }
        } else {
          console.log(`⚠️ No session files found for user ${userId}, marking as disconnected`);
          await User.findByIdAndUpdate(userId, { whatsappConnected: false });
        }
      }
    } catch (error) {
      console.error('Error restoring connections:', error);
    }
  }


  // Restore connection for a specific user (public method)
  async restoreUserConnection(userId: string): Promise<boolean> {
    try {
      const sessionPath = path.join(this.sessionPath, `session-${userId}`);

      if (!fs.existsSync(sessionPath)) {
        return false;
      }

      // Create WhatsApp client with existing session
      const client = new Client({
        authStrategy: new LocalAuth({
          clientId: `client-${userId}`,
          dataPath: sessionPath
        }),
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor'
          ]
        }
      });

      const connection: WhatsAppConnection = {
        client,
        qr: null,
        isConnected: false,
        connectionState: 'restoring',
      };

      this.connections.set(userId, connection);

      // Set up event handlers for restoration
      client.on('ready', () => {
        console.log(`✅ WhatsApp connection restored for user: ${userId}`);
        connection.isConnected = true;
        connection.connectionState = 'open';

        this.emitStatusUpdate(userId, {
          isConnected: true,
          state: 'open',
          qr: null
        });

        // Ensure message listener is set up after restoration
        try {
          this.setupMessageListener(userId, client);
        } catch (err) {
          console.error('Failed to set up message listener after restoration:', err);
        }
      });

      client.on('disconnected', (reason) => {
        console.log(`🔌 Restored connection lost for user ${userId}:`, reason);
        connection.isConnected = false;
        connection.connectionState = 'disconnected';
        this.connections.delete(userId);
        this.messageListenersSetup.delete(userId);

        this.emitStatusUpdate(userId, {
          isConnected: false,
          state: 'disconnected',
          qr: null
        });
      });

      client.on('auth_failure', (msg) => {
        console.log(`❌ Auth failure for restored connection user ${userId}:`, msg);
        connection.isConnected = false;
        connection.connectionState = 'auth_error';
        this.connections.delete(userId);
        this.messageListenersSetup.delete(userId);

        this.emitStatusUpdate(userId, {
          isConnected: false,
          state: 'auth_error',
          qr: null
        });
      });

      // Initialize the client
      await client.initialize();

      // Wait longer for connection to establish (WhatsApp can take 10-15 seconds)
      console.log(`⏳ Waiting for WhatsApp connection to establish for user: ${userId}...`);

      // Wait up to 30 seconds for connection
      for (let i = 0; i < 30; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));

        if (connection.isConnected && connection.connectionState === 'open') {
          console.log(`✅ Successfully restored WhatsApp connection for user: ${userId} after ${i + 1} seconds`);
          return true;
        }

        // Log progress every 5 seconds
        if ((i + 1) % 5 === 0) {
          console.log(`⏳ Still waiting for connection... ${i + 1}s elapsed (state: ${connection.connectionState})`);
        }
      }

      if (connection.isConnected) {
        console.log(`✅ WhatsApp connection restored for user: ${userId}`);
        return true;
      } else {
        console.log(`⚠️ Connection restoration taking longer than expected for user: ${userId}, but session exists`);
        // Return true as the connection is still establishing and will emit status when ready
        return true;
      }
    } catch (error) {
      console.error(`Error restoring connection for user ${userId}:`, error);
      this.connections.delete(userId);
      return false;
    }
  }

  private emitStatusUpdate(userId: string, status: { isConnected: boolean; state: string; qr?: string | null }) {
    if (this.io) {
      console.log('📡 About to emit status update to user:', userId, 'Status:', status);
      this.io.to(`user-${userId}`).emit('whatsapp-status-update', status);
      console.log('📡 Status update emitted successfully to user:', userId);
    } else {
      console.log('❌ Socket.IO not available for status update');
    }
  }

  private ensureSessionDirectory(): void {
    if (!fs.existsSync(this.sessionPath)) {
      fs.mkdirSync(this.sessionPath, { recursive: true });
    }
  }

  async createConnection(userId: string, settings?: any): Promise<{ qr?: string; success: boolean; message: string }> {
    try {
      // Check if connection attempt is already in progress
      if (this.connectionAttempts.has(userId)) {
        console.log('Connection attempt already in progress for user:', userId);
        return { success: false, message: 'Connection attempt already in progress' };
      }

      // Mark connection attempt as started
      this.connectionAttempts.set(userId, true);

      // Check if user already has an active connection
      if (this.connections.has(userId)) {
        const connection = this.connections.get(userId)!;
        if (connection.isConnected) {
          console.log('User already has active connection, returning success');
          this.connectionAttempts.delete(userId);
          return { success: true, message: 'WhatsApp already connected' };
        }

        // Try to auto-reconnect if session exists but not connected
        if (!connection.isConnected && connection.client) {
          console.log(`Attempting auto-reconnection for user ${userId}`);
          try {
            await connection.client.initialize();
            // Wait for connection to establish
            await new Promise(resolve => setTimeout(resolve, 5000));

            if (connection.isConnected) {
              console.log(`Auto-reconnection successful for user ${userId}`);
              this.connectionAttempts.delete(userId);
              return { success: true, message: 'WhatsApp reconnected successfully' };
            }
          } catch (reconnectError) {
            console.log(`Auto-reconnection failed for user ${userId}:`, reconnectError);
            // Clean up failed connection and create new one
            this.connections.delete(userId);
          }
        }

        // If connection exists but not connected, check if it's still in connecting state
        if (connection.connectionState === 'connecting') {
          console.log('Connection already in progress, waiting for QR...');
          // Wait a bit for QR to be generated
          await new Promise(resolve => setTimeout(resolve, 2000));
          if (connection.qr) {
            this.connectionAttempts.delete(userId);
            return { success: true, qr: connection.qr, message: 'QR code already available' };
          }
        }

        // Clean up existing connection if not connected
        console.log('Cleaning up existing disconnected connection...');
        await this.disconnect(userId);
      }

      const sessionPath = path.join(this.sessionPath, `session-${userId}`);

      // Clean up any existing session files that might be corrupted
      if (fs.existsSync(sessionPath)) {
        console.log('Cleaning up existing session files...');
        try {
          fs.rmSync(sessionPath, { recursive: true, force: true });
        } catch (error) {
          console.error('Error cleaning up session:', error);
        }
      }

      // Create WhatsApp client with optimized settings for faster connection
      const client = new Client({
        authStrategy: new LocalAuth({
          clientId: `client-${userId}`,
          dataPath: sessionPath
        }),
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-extensions',
            '--disable-plugins',
            '--disable-images',
            '--disable-javascript',
            '--disable-default-apps',
            '--disable-sync',
            '--disable-translate',
            '--hide-scrollbars',
            '--mute-audio',
            '--no-default-browser-check',
            '--no-pings',
            '--password-store=basic',
            '--use-mock-keychain',
            '--disable-background-networking',
            '--disable-component-extensions-with-background-pages',
            '--disable-default-apps',
            '--disable-extensions',
            '--disable-sync',
            '--disable-translate',
            '--hide-scrollbars',
            '--mute-audio',
            '--no-default-browser-check',
            '--no-first-run',
            '--no-pings',
            '--password-store=basic',
            '--use-mock-keychain',
            '--disable-blink-features=AutomationControlled',
            '--disable-features=VizDisplayCompositor',
            '--disable-ipc-flooding-protection',
            '--disable-hang-monitor',
            '--disable-prompt-on-repost',
            '--disable-domain-reliability',
            '--disable-client-side-phishing-detection',
            '--disable-component-update',
            '--disable-default-apps',
            '--disable-dev-shm-usage',
            '--disable-extensions',
            '--disable-features=TranslateUI',
            '--disable-ipc-flooding-protection',
            '--disable-renderer-backgrounding',
            '--disable-sync',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--no-default-browser-check',
            '--no-first-run',
            '--no-pings',
            '--password-store=basic',
            '--use-mock-keychain'
          ]
        }
      });

      const connection: WhatsAppConnection = {
        client,
        qr: null,
        isConnected: false,
        connectionState: 'connecting',
      };

      this.connections.set(userId, connection);

      // Add connection timeout to detect stuck connections
      const connectionTimeout = setTimeout(() => {
        if (connection.connectionState === 'connecting' && !connection.isConnected) {
          console.log('⏰ Connection timeout - QR may not have been scanned within 60 seconds');
          // Emit timeout status IMMEDIATELY
          console.log('📡 Emitting connection timeout status update for user:', userId);
          this.emitStatusUpdate(userId, {
            isConnected: false,
            state: 'timeout',
            qr: connection.qr
          });

          // Also emit a follow-up update
          setTimeout(() => {
            console.log('📡 Sending follow-up timeout status update for user:', userId);
            this.emitStatusUpdate(userId, {
              isConnected: false,
              state: 'timeout',
              qr: connection.qr
            });
          }, 100);
        }
      }, 20000); // Reduced to 20 seconds timeout for faster feedback

      // Handle QR code generation
      client.on('qr', async (qr) => {
        console.log('QR code received for user:', userId);

        try {
          // Convert QR string to base64 image format with optimized settings
          const qrImageData = await QRCode.toDataURL(qr, {
            width: 256,
            margin: 1,
            color: {
              dark: '#000000',
              light: '#FFFFFF'
            },
            errorCorrectionLevel: 'M'
          });
          connection.qr = qrImageData;
          connection.isConnected = false;

          // Emit real-time update immediately
          this.emitStatusUpdate(userId, {
            isConnected: false,
            state: 'connecting',
            qr: qrImageData
          });
        } catch (error) {
          console.error('Error generating QR code image:', error);
          // Fallback to original string if QRCode fails
          const qrImageData = `data:image/png;base64,${qr}`;
          connection.qr = qrImageData;
          connection.isConnected = false;

          this.emitStatusUpdate(userId, {
            isConnected: false,
            state: 'connecting',
            qr: qrImageData
          });
        }
      });

      // Handle successful connection
      client.on('ready', async () => {
        console.log('🎉 WhatsApp client is ready for user:', userId);
        connection.isConnected = true;
        connection.qr = null;
        connection.connectionState = 'open';
        clearTimeout(connectionTimeout);
        this.connectionAttempts.delete(userId);

        // Update database with connection status
        try {
          const User = (await import('../models/User.js')).default as any;
          await User.findByIdAndUpdate(userId, {
            whatsappConnected: true,
            whatsappSessionId: `session-${userId}`
          });
          console.log(`✅ Updated database for user ${userId}: WhatsApp connected`);
        } catch (error) {
          console.error(`❌ Failed to update database for user ${userId}:`, error);
        }


        // Emit real-time update IMMEDIATELY
        console.log('📡 Emitting WhatsApp connected status update for user:', userId);
        this.emitStatusUpdate(userId, {
          isConnected: true,
          state: 'open',
          qr: null
        });

        // Also emit a second update after a short delay to ensure it's received
        setTimeout(() => {
          console.log('📡 Sending follow-up status update for user:', userId);
          this.emitStatusUpdate(userId, {
            isConnected: true,
            state: 'open',
            qr: null
          });
        }, 100);

        // Set up message listener for auto-reply
        this.setupMessageListener(userId, client);

      });

      // Handle authentication failure
      client.on('auth_failure', async (msg) => {
        console.log('Authentication failed for user:', userId, msg);
        connection.isConnected = false;
        connection.qr = null;
        connection.connectionState = 'auth_error';
        this.connections.delete(userId);
        this.connectionAttempts.delete(userId);
        this.messageListenersSetup.delete(userId);
        clearTimeout(connectionTimeout);

        // Update database with auth failure status
        try {
          const User = (await import('../models/User.js')).default as any;
          await User.findByIdAndUpdate(userId, {
            whatsappConnected: false,
            whatsappSessionId: null
          });
          console.log(`✅ Updated database for user ${userId}: WhatsApp auth failed`);
        } catch (error) {
          console.error(`❌ Failed to update database for user ${userId}:`, error);
        }

        // Clean up session files on auth failure
        try {
          if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
          }
        } catch (err) {
          console.error('Error cleaning up session:', err);
        }

        // Emit auth failure status IMMEDIATELY
        console.log('📡 Emitting auth failure status update for user:', userId);
        this.emitStatusUpdate(userId, {
          isConnected: false,
          state: 'auth_error',
          qr: null
        });

        // Also emit a follow-up update
        setTimeout(() => {
          console.log('📡 Sending follow-up auth failure status update for user:', userId);
          this.emitStatusUpdate(userId, {
            isConnected: false,
            state: 'auth_error',
            qr: null
          });
        }, 100);
      });

      // Handle disconnection
      client.on('disconnected', async (reason) => {
        console.log('🔌 WhatsApp client disconnected for user:', userId, 'Reason:', reason);
        connection.isConnected = false;
        connection.qr = null;
        connection.connectionState = 'disconnected';
        this.connections.delete(userId);
        this.connectionAttempts.delete(userId);
        this.messageListenersSetup.delete(userId);
        clearTimeout(connectionTimeout);

        // Update database with disconnection status
        try {
          const User = (await import('../models/User.js')).default as any;
          await User.findByIdAndUpdate(userId, {
            whatsappConnected: false,
            whatsappSessionId: null
          });
          console.log(`✅ Updated database for user ${userId}: WhatsApp disconnected`);
        } catch (error) {
          console.error(`❌ Failed to update database for user ${userId}:`, error);
        }

        // Emit disconnect status IMMEDIATELY
        console.log('📡 Emitting WhatsApp disconnected status update for user:', userId);
        this.emitStatusUpdate(userId, {
          isConnected: false,
          state: 'disconnected',
          qr: null
        });

        // Also emit a follow-up update to ensure it's received
        setTimeout(() => {
          console.log('📡 Sending follow-up disconnect status update for user:', userId);
          this.emitStatusUpdate(userId, {
            isConnected: false,
            state: 'disconnected',
            qr: null
          });
        }, 100);
      });

      // Initialize the client
      await client.initialize();

      // Return immediately for faster response - QR will be sent via WebSocket
      this.connectionAttempts.delete(userId);

      // Emit initial status immediately
      this.emitStatusUpdate(userId, {
        isConnected: false,
        state: 'connecting',
        qr: null
      });

      return {
        success: true,
        message: 'Connection initiated. QR code will appear shortly via WebSocket.'
      };

    } catch (error) {
      console.error('Error creating WhatsApp connection:', error);
      this.connectionAttempts.delete(userId);
      return {
        success: false,
        message: 'Failed to create WhatsApp connection'
      };
    }
  }

  /**
   * Send an interactive message with buttons
   */
  async sendInteractiveMessage(userId: string, phoneNumber: string, message: string, menu: any): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const connection = this.connections.get(userId);
      if (!connection || !connection.client) {
        console.log(`❌ WhatsApp client not connected for user ${userId}`);
        return { success: false, error: 'WhatsApp client not connected' };
      }

      const client = connection.client;

      // Check if client is ready - use connection state instead of client.info
      if (!connection.isConnected || connection.connectionState !== 'open') {
        console.log(`❌ WhatsApp client not ready for user ${userId}, state: ${connection.connectionState}`);
        return { success: false, error: 'WhatsApp client not ready' };
      }

      // Format message with clickable buttons
      let buttonText = message;

      if (menu && menu.buttons && menu.buttons.length > 0) {
        buttonText += '\n\n📱 **Clickable Options:**\n';
        menu.buttons.forEach((button: any, index: number) => {
          buttonText += `🔘 ${button.title}`;
          if (button.description) {
            buttonText += ` (${button.description})`;
          }
          buttonText += '\n';
        });
      }

      if (menu && menu.footer) {
        buttonText += `\n\n${menu.footer}`;
      }

      // Add instructions for clicking buttons
      buttonText += '\n\n💡 *Tap any option above to continue!*';

      console.log(`📤 Sending interactive message to ${phoneNumber}: ${buttonText.substring(0, 100)}...`);

      // Use regular sendMessage with better error handling
      const result = await this.sendMessage(userId, phoneNumber, buttonText);

      if (result.success) {
        console.log(`✅ Interactive message sent successfully to ${phoneNumber}`);
        return {
          success: true,
          messageId: result.messageId
        };
      } else {
        console.log(`❌ Failed to send interactive message to ${phoneNumber}: ${result.error}`);
        return {
          success: false,
          error: result.error || 'Failed to send message'
        };
      }

    } catch (error) {
      console.error(`❌ Error in sendInteractiveMessage to ${phoneNumber}:`, error);

      // Fallback to regular message
      try {
        console.log(`🔄 Attempting fallback to regular message for ${phoneNumber}`);
        const fallbackResult = await this.sendMessage(userId, phoneNumber, message);
        return fallbackResult;
      } catch (fallbackError) {
        console.error(`❌ Fallback also failed for ${phoneNumber}:`, fallbackError);
        return {
          success: false,
          error: `Interactive message failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
    }
  }

  async sendMessage(
    userId: string,
    phoneNumber: string,
    message: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      console.log(`Attempting to send message for user ${userId} to ${phoneNumber}`);

      const connection = this.connections.get(userId);

      if (!connection || !connection.isConnected) {
        console.log(`Connection not found or not connected for user ${userId}`);
        return {
          success: false,
          error: 'WhatsApp not connected. Please connect first.'
        };
      }

      const client = connection.client;

      // Check if client is ready - use connection state instead of client.info
      if (!connection.isConnected || connection.connectionState !== 'open') {
        console.log(`❌ WhatsApp client not ready for user ${userId}, state: ${connection.connectionState}`);
        return { success: false, error: 'WhatsApp client not ready' };
      }

      // Format phone number for India (+91)
      let formattedNumber = phoneNumber.replace(/\D/g, '');

      // Handle India phone numbers specifically
      if (formattedNumber.startsWith('91')) {
        // Already has country code
        formattedNumber = formattedNumber;
      } else if (formattedNumber.startsWith('0')) {
        // Remove leading 0 and add 91
        formattedNumber = '91' + formattedNumber.substring(1);
      } else if (formattedNumber.length === 10) {
        // 10-digit Indian number, add 91
        formattedNumber = '91' + formattedNumber;
      } else if (!formattedNumber.startsWith('91') && formattedNumber.length > 10) {
        // International number, keep as is
        formattedNumber = formattedNumber;
      }

      const chatId = `${formattedNumber}@c.us`;

      console.log(`Sending message to chatId: ${chatId} (Original: ${phoneNumber})`);

      // Validate Indian phone number format
      if (formattedNumber.startsWith('91') && formattedNumber.length !== 12) {
        return {
          success: false,
          error: 'Invalid Indian phone number format. Please use 10-digit number or +91XXXXXXXXXX'
        };
      }

      // Send message using whatsapp-web.js with better error handling
      console.log(`📤 Attempting to send message to ${chatId}`);

      try {
        const sent = await connection.client.sendMessage(chatId, message);

        console.log(`✅ Message sent successfully to ${chatId}`);
        console.log(`📱 Message ID: ${sent.id?._serialized || sent.id || 'unknown'}`);

        return {
          success: true,
          messageId: typeof sent.id === 'string' ? sent.id : sent.id?._serialized || 'unknown'
        };
      } catch (sendError) {
        console.error(`❌ Error sending message to ${chatId}:`, sendError);

        // Check if it's a specific evaluation error
        if (sendError instanceof Error && sendError.message.includes('Evaluation failed')) {
          console.log(`🔄 Evaluation error detected, trying alternative approach...`);

          // Try sending with a simpler message first
          try {
            const simpleMessage = message.length > 100 ? message.substring(0, 100) + '...' : message;
            const sent = await connection.client.sendMessage(chatId, simpleMessage);

            console.log(`✅ Fallback message sent successfully to ${chatId}`);
            return {
              success: true,
              messageId: (sent.id?._serialized || sent.id) as string || 'unknown'
            };
          } catch (fallbackError) {
            console.error(`❌ Fallback also failed:`, fallbackError);
            return {
              success: false,
              error: `Message sending failed: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`
            };
          }
        }

        return {
          success: false,
          error: `Message sending failed: ${sendError instanceof Error ? sendError.message : 'Unknown error'}`
        };
      }

    } catch (error) {
      console.error('Error sending WhatsApp message:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Indicate chat state (typing/paused/recording) to a specific chat
   */
  async sendChatState(
    userId: string,
    phoneNumber: string,
    state: 'typing' | 'paused' | 'recording' = 'typing'
  ): Promise<boolean> {
    try {
      const connection = this.connections.get(userId);
      if (!connection || !connection.isConnected || connection.connectionState !== 'open') {
        return false;
      }

      // Format phone number similar to sendMessage
      let formattedNumber = phoneNumber.replace(/\D/g, '');
      if (formattedNumber.startsWith('91')) {
        formattedNumber = formattedNumber;
      } else if (formattedNumber.startsWith('0')) {
        formattedNumber = '91' + formattedNumber.substring(1);
      } else if (formattedNumber.length === 10) {
        formattedNumber = '91' + formattedNumber;
      }
      const chatId = `${formattedNumber}@c.us`;

      const chat: any = await connection.client.getChatById(chatId);
      if (!chat) return false;

      if (state === 'typing' && typeof chat.sendStateTyping === 'function') {
        await chat.sendStateTyping();
        return true;
      }
      if (state === 'recording' && typeof chat.sendStateRecording === 'function') {
        await chat.sendStateRecording();
        return true;
      }
      if (typeof chat.sendStatePaused === 'function') {
        await chat.sendStatePaused();
        return true;
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  async sendBulkMessages(
    userId: string,
    contacts: Array<{ phone: string; message: string; contactId: string }>
  ): Promise<Array<{ contactId: string; success: boolean; messageId?: string; error?: string }>> {
    const results = [];
    const batchSize = 5; // Process 5 messages at a time for better performance

    for (let i = 0; i < contacts.length; i += batchSize) {
      const batch = contacts.slice(i, i + batchSize);

      // Process batch in parallel with controlled concurrency
      const batchPromises = batch.map(async (contact) => {
        try {
          // Adaptive delay based on batch position (slower at start, faster in middle)
          const delay = i === 0 ? 2000 : Math.random() * 1000 + 500;
          await new Promise(resolve => setTimeout(resolve, delay));

          const result = await this.sendMessage(userId, contact.phone, contact.message);

          return {
            contactId: contact.contactId,
            success: result.success,
            messageId: result.messageId,
            error: result.error,
          };

        } catch (error) {
          return {
            contactId: contact.contactId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      });

      // Wait for batch to complete
      const batchResults = await Promise.allSettled(batchPromises);

      // Process results
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            contactId: batch[index].contactId,
            success: false,
            error: result.reason?.message || 'Batch processing failed',
          });
        }
      });

      // Add delay between batches to avoid rate limiting
      if (i + batchSize < contacts.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  /**
   * Send an admin notification using the first available active connection.
   * Admin phone must be set in ENV as ADMIN_PHONE (e.g., +9198XXXXXXXX or 98XXXXXXXX).
   */
  async sendMessageToAdmin(message: string): Promise<{ success: boolean; error?: string }> {
    try {
      const adminPhone = (process.env.ADMIN_PHONE || '+91 7388480128').trim();
      if (!adminPhone) {
        console.warn('ADMIN_PHONE not configured; cannot send admin notification');
        return { success: false, error: 'ADMIN_PHONE not set' };
      }
  
      for (const [userId, connection] of this.connections.entries()) {
        if (connection.isConnected && connection.connectionState === 'open') {
          const result = await this.sendMessage(userId, adminPhone, message.replace(/\n/g, '\n'));
          return { success: result.success, error: result.error };
        }
      }
  
      return { success: false, error: 'No active WhatsApp connections available' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  
  getConnectionStatus(userId: string): { isConnected: boolean; state: string } {
    const connection = this.connections.get(userId);

    if (!connection) {
      // If no active connection but session files exist, start restoration
      if (this.hasExistingSession(userId)) {
        // Kick off restoration asynchronously; don't await to keep response fast
        this.restoreUserConnection(userId).catch(err => {
          console.error(`Auto-restore failed for user ${userId}:`, err);
        });
        return { isConnected: false, state: 'restoring' };
      }
      return { isConnected: false, state: 'not_connected' };
    }

    // Return the actual connection state from our internal tracking
    return {
      isConnected: connection.isConnected,
      state: connection.connectionState,
    };
  }

  hasActiveConnection(userId: string): boolean {
    return this.connections.has(userId);
  }

  async disconnect(userId: string): Promise<boolean> {
    try {
      const connection = this.connections.get(userId);

      if (connection) {
        await connection.client.destroy();
        this.connections.delete(userId);
        this.connectionAttempts.delete(userId);
        this.messageListenersSetup.delete(userId);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error disconnecting WhatsApp:', error);
      return false;
    }
  }

  isConnected(userId: string): boolean {
    const connection = this.connections.get(userId);
    if (!connection) return false;

    return connection.isConnected;
  }

  getQRCode(userId: string): string | null {
    const connection = this.connections.get(userId);
    if (connection && connection.qr && !connection.isConnected) {
      return connection.qr;
    }
    return null;
  }

  async waitForQRCode(userId: string, timeoutMs: number = 30000): Promise<string | null> {
    const connection = this.connections.get(userId);
    if (!connection) {
      return null;
    }

    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (connection.qr && !connection.isConnected) {
        return connection.qr;
      }

      if (connection.isConnected) {
        return null; // Already connected, no QR needed
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return null;
  }

  async waitForConnection(userId: string, timeoutMs: number = 60000): Promise<boolean> {
    const connection = this.connections.get(userId);
    if (!connection) {
      return false;
    }

    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (connection.isConnected && connection.connectionState === 'open') {
        console.log('Connection established successfully');
        return true;
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log('Connection timeout - QR may not have been scanned');
    return false;
  }

  // Check if user has existing session files
  hasExistingSession(userId: string): boolean {
    const sessionPath = path.join(this.sessionPath, `session-${userId}`);
    return fs.existsSync(sessionPath);
  }

  // Get all active connections count
  getActiveConnectionsCount(): number {
    return this.connections.size;
  }

  // Get connection info for debugging
  getConnectionInfo(userId: string): any {
    const connection = this.connections.get(userId);
    if (!connection) {
      return { exists: false };
    }

    return {
      exists: true,
      isConnected: connection.isConnected,
      state: connection.connectionState,
      hasQR: !!connection.qr,
      hasSession: this.hasExistingSession(userId)
    };
  }

  // Set up message listener for auto-reply
  private setupMessageListener(userId: string, client: Client): void {
    // Check if listener is already set up to avoid duplicates
    if (this.messageListenersSetup.has(userId)) {
      console.log(`Message listener already set up for user ${userId}`);
      return;
    }

    console.log(`Setting up message listener for auto-reply for user ${userId}`);

    client.on('message', async (message: any) => {
      try {
        // Only process incoming messages (not outgoing)
        if (message.fromMe) {
          return;
        }

        // Skip group messages and status broadcasts
        if (typeof message.from === 'string' && message.from.endsWith('@g.us')) {
          return;
        }
        if (typeof message.from === 'string' && message.from === 'status@broadcast') {
          return;
        }

        // Process if there's textual content
        const messageBody = (message.body || '').toString().trim();
        if (!messageBody) {
          return;
        }
        const fromNumber = message.from.replace('@c.us', '');

        console.log(`📨 Incoming message from ${fromNumber}: ${messageBody.substring(0, 50)}...`);

        // Process auto-reply
        await autoReplyService.processMessage(userId, fromNumber, messageBody);

      } catch (error) {
        console.error('Error processing incoming message for auto-reply:', error);
      }
    });

    // Mark listener as set up
    this.messageListenersSetup.set(userId, true);
    console.log(`✅ Message listener set up for auto-reply for user ${userId}`);
  }
}

export default new WhatsAppService();