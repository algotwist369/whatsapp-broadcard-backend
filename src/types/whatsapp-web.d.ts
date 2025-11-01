declare module 'whatsapp-web.js' {
  export interface Client {
    initialize(): Promise<void>;
    destroy(): Promise<void>;
    sendMessage(chatId: string, message: string): Promise<Message>;
    on(event: string, listener: (...args: any[]) => void): void;
    getChatById(chatId: string): Promise<Chat>;
  }

  export interface Message {
    id: {
      _serialized: string;
    };
  }

  export interface Chat {
    id: string;
    sendStateTyping?: () => Promise<void>;
    sendStateRecording?: () => Promise<void>;
    sendStatePaused?: () => Promise<void>;
  }

  export interface LocalAuth {
    clientId: string;
    dataPath: string;
  }

  export class Client {
    constructor(options: {
      authStrategy: LocalAuth;
      puppeteer?: {
        headless?: boolean;
        args?: string[];
      };
    });
    initialize(): Promise<void>;
    destroy(): Promise<void>;
    sendMessage(chatId: string, message: string): Promise<Message>;
    on(event: string, listener: (...args: any[]) => void): void;
    getChatById(chatId: string): Promise<Chat>;
  }

  export class LocalAuth {
    constructor(options: {
      clientId: string;
      dataPath: string;
    });
  }

  export class MessageMedia {
    static fromFilePath(filePath: string): Promise<MessageMedia>;
  }
}
