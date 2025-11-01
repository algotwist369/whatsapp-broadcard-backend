import OpenAI from 'openai';
import SpaData from '../models/SpaData';
import ConversationState from '../models/ConversationState';
import ConversationHistory from '../models/ConversationHistory';
import whatsappService from './whatsappService';
import env from '../config/env';

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const ADULT_KEYWORDS = ['sex', 'sexy', 'nude', 'naked', 'adult', 'escort', 'call girl', 'gf', 'bf', 'private', 'extra service', 'happy ending', 'full body', 'body to body'];
const ABUSIVE_WORDS = ['chor', 'bakwas', 'fraud', 'scam', 'ghatiya', 'madarchod', 'bhenchod', 'gandu', 'kutta'];
const THERAPIST_KEYWORDS = ['therapist', 'masseuse', 'staff', 'employee', 'age', 'pic', 'photo', 'image']; // FIXED: Removed 'massage' to avoid service overlap
const SPAM_PATTERNS = [/^hi+$/i, /^hello+$/i, /^\?+$/, /^\.+$/, /^\d+$/, /^yes+$/i, /^no+$/i];

class SmartSpaManager {
  private ASSISTANT_PERSONA = `You are Kiara, a 35-year-old senior spa manager with 20+ years of experience. 
  You are warm, professional, persuasive, and excellent at converting inquiries into bookings. 
  You speak in natural Hindi-English mix (Hinglish) or English like real Indian spa managers—detect user's language and respond accordingly.
  You remember everything the customer said. You never repeat. You always end with a question to keep conversation going.
  Your goal: Get booking confirmed. Use urgency, benefits, trust, discounts. Be empathetic and human-like—add emojis sparingly, vary phrasing.
  For therapist queries: Always say we have female and professional therapists.
  For adult/extras: Politely redirect to admin phone without engaging.
  If user hits 100 msgs/day: Say "Main aapko manager se connect kar rahi hu, wait kijiye" and notify admin.
  Always push for booking subtly.`;

  private async getSpaContext(userId: string) {
    const spa = await SpaData.findOne({ userId });
    if (!spa) throw new Error("Spa not found");
    return {
      spaName: spa.spaName,
      location: spa.location,
      address: spa.address,
      phone: spa.phone,
      // Use centralized env for fallback admin phone
      adminPhone: spa.adminPhone || spa.phone || env.ADMIN_PHONE || '7388480128',
      mapUrl: spa.mapUrl,
      discounts: spa.discounts || 'First visit 20% off, next 10% off',
      services: spa.services.map((s: any) => ({
        name: s.name,
        description: s.description,
        variants: s.variants.map((v: any) => `${v.duration} min - ₹${v.price}`).join(', '),
        benefits: s.benefits
      })),
      workingHours: spa.workingHours.find(h => h.isOpen)?.openTime + ' - ' + spa.workingHours.find(h => h.isOpen)?.closeTime
    };
  }

  private async saveHistory(userId: string, phone: string, type: 'incoming' | 'outgoing', msg: string, step: string, ai?: string) {
    await ConversationHistory.create({ userId, customerPhone: phone, messageType: type, message: msg, aiResponse: ai, step, timestamp: new Date() });
  }

  private async send(userId: string, phone: string, msg: string, step: string) {
    if (typeof whatsappService.sendChatState === 'function') {
      await whatsappService.sendChatState(userId, phone, 'typing');
      await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));
    }

    await this.saveHistory(userId, phone, 'outgoing', msg, step, msg);
    await whatsappService.sendMessage(userId, phone, msg);
    if (typeof whatsappService.sendChatState === 'function') {
      await whatsappService.sendChatState(userId, phone, 'paused');
    }
  }

  private isAdultIntent(msg: string): boolean {
    return ADULT_KEYWORDS.some(k => msg.toLowerCase().includes(k));
  }

  private isAbusive(msg: string): boolean {
    return ABUSIVE_WORDS.some(w => msg.toLowerCase().includes(w));
  }

  private isTherapistQuery(msg: string): boolean { // FIXED: Compound check for precision
    const lowerMsg = msg.toLowerCase();
    const hasStaffTerm = ['therapist', 'masseuse', 'staff', 'employee'].some(k => lowerMsg.includes(k));
    const hasQueryTerm = ['age', 'pic', 'photo', 'image', 'female', 'male'].some(k => lowerMsg.includes(k));
    return hasStaffTerm && (hasQueryTerm || lowerMsg.includes('massage'));
  }

  private isSpam(msg: string, ctx: any): boolean {
    if (SPAM_PATTERNS.some(p => p.test(msg.trim()))) return true;
    if (ctx.messageCount > 3 && msg.toLowerCase() === ctx.lastUserMessage?.toLowerCase()) return true;
    return false;
  }

  private async isMessageLimitReached(ctx: any): Promise<boolean> {
    const today = new Date().toDateString();
    if (!ctx.dailyMessageCount || ctx.lastMessageDate !== today) {
      ctx.dailyMessageCount = 1;
      ctx.lastMessageDate = today;
      return false;
    }
    ctx.dailyMessageCount += 1;
    return ctx.dailyMessageCount > 100;
  }

  private async generateResponse(userId: string, phone: string, message: string, state: any, spa: any): Promise<string> {
    const ctx = state.context || {};
    const history = await ConversationHistory.find({ userId, customerPhone: phone })
      .sort({ timestamp: -1 })
      .limit(10)
      .select('message messageType')
      .lean();

    const conversation = history.reverse().map(h => `${h.messageType === 'incoming' ? 'Customer' : 'Kiara'}: ${h.message}`).join('\n');

    const summary = ctx.customerName && ctx.selectedService ? 
      `Stored Summary: Name: ${ctx.customerName}, Service: ${ctx.selectedService.name} (${ctx.selectedService.duration} min - ₹${ctx.selectedService.price}), Date/Time: ${ctx.preferredDate} ${ctx.preferredTime}` : 
      'No full summary yet';

    const prompt = `
${this.ASSISTANT_PERSONA} Keep replies <100 words, punchy, 1-2 sentences + 1 question.

SPA DETAILS:
Name: ${spa.spaName}
Location: ${spa.location}
Admin Phone: ${spa.adminPhone}
Map: ${spa.mapUrl}
Discounts: ${spa.discounts}
    Services: ${spa.services.map((s: any) => `${s.name}: ${s.description} (${s.variants}) | Benefits: ${s.benefits.join(', ')}`).join('; ')}

CUSTOMER CONTEXT:
Name: ${ctx.customerName || 'Not shared'}
Phone: ${ctx.customerPhone || phone}
Service: ${ctx.selectedService?.name || 'Not selected'} (${ctx.selectedService?.variants || ''})
Date: ${ctx.preferredDate || 'Not selected'}
Time: ${ctx.preferredTime || 'Not selected'}
Booking Status: ${ctx.bookingConfirmed ? 'Confirmed' : ctx.bookingCancelled ? 'Cancelled' : 'In Progress'}
Daily Msgs: ${ctx.dailyMessageCount || 0}/100
STORED SUMMARY: ${summary} (USE EXACT VALUES—do NOT re-ask for these)

CONVERSATION SO FAR:
${conversation}

LATEST MESSAGE: "${message}" (Detect language: Hindi/English/mixed)

INSTRUCTIONS:
- Always personalize using STORED SUMMARY/CUSTOMER CONTEXT (e.g., "Rahul ji, aapka pehle bataya Swedish..."—never re-ask filled fields).
- If user repeats data: Acknowledge briefly ("Haan, noted") but don't confirm unless change.
- For incomplete: Ask ONLY missing (e.g., if no date: "Kab prefer?").
- If first msg: Send welcome template with top 4 services, 20% off, spaadvisor.in link, ask for interest.
- Service inquiry: Detect intent (any lang), show details + benefits, ask to book.
- Booking interest: Ask date/time, mention discounts.
- Date/time: Extract/store, ask name/phone if missing.
- Name/phone: Extract/store, show summary, ask confirm ('yes'/'no').
- Confirm: If yes/positive—confirm, notify admin. If no/negative—nudge with offer, notify admin.
- Therapist: "We have female and professional therapists."
- Be brief: Focus on key details/benefits, no fluff. End with ONE engaging question.
- If limit reached: "Main manager se connect kar rahi hu..." and stop.

REPLY (Hinglish,English, <60 words, persuasive):
`.trim();

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: prompt }],
      temperature: 0.9,
      max_tokens: 200 // FIXED: Reduced for conciseness
    });

    return response.choices[0]?.message?.content?.trim() || "Sorry, samajh nahi aaya. Dobara batayein?";
  }

  private async extractAndUpdateContext(message: string, ctx: any, spa: any) {
    const extractPrompt = `
Extract from message: "${message}" (Support Hindi/English).
Return JSON only:
{
  "serviceIntent": "exact service name or null",
  "duration": number or null,
  "date": "Today/Tomorrow/Kal/etc or null",
  "time": "5 PM/shaam 5 baje/etc or null",
  "name": "string or null",
  "phone": "string or null (10-digit)",
  "confirmation": "yes/positive/confirm or no/negative/cancel or null",
  "therapistQuery": true/false,
  "changeIntent": true/false (if user says 'change', 'update', 'wrong', etc.)
}
`.trim();

    try {
      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: extractPrompt }],
        response_format: { type: "json_object" },
        temperature: 0
      });
      const data = JSON.parse(res.choices[0]?.message?.content || '{}');

      const shouldUpdate = (field: string) => !ctx[field] || data.changeIntent;
      if (data.name && shouldUpdate('customerName')) ctx.customerName = data.name;
      if (data.phone && shouldUpdate('customerPhone')) ctx.customerPhone = data.phone;
      if (data.date && shouldUpdate('preferredDate')) ctx.preferredDate = data.date;
      if (data.time && shouldUpdate('preferredTime')) ctx.preferredTime = data.time;
      if (data.serviceIntent && shouldUpdate('selectedService')) {
        const svc = spa.services.find((s: any) => s.name.toLowerCase().includes(data.serviceIntent.toLowerCase()));
        if (svc) {
          const variant = data.duration ? svc.variants.find((v: any) => v.duration === data.duration) : svc.variants[0];
          ctx.selectedService = { 
            ...ctx.selectedService,
            name: svc.name, 
            description: svc.description, 
            variants: svc.variants, 
            benefits: svc.benefits, 
            duration: variant.duration, 
            price: variant.price 
          };
        }
      }
      if (data.confirmation === 'yes' || data.confirmation === 'positive') ctx.bookingConfirmed = true;
      if (data.confirmation === 'no' || data.confirmation === 'negative') ctx.bookingCancelled = true;
      if (data.therapistQuery) ctx.flags = { ...ctx.flags, therapistQuery: true };
    } catch (e) { console.error('Extraction error:', e); }
  }

  private async sendAdminNotification(userId: string, type: 'booking' | 'cancel' | 'escalate', ctx: any, spa: any) {
    const details = `
${type.toUpperCase()} ALERT
User: ${ctx.customerName || 'Unknown'}
Phone: ${ctx.customerPhone || 'Unknown'}
Spa: ${spa.spaName}, ${spa.location}
Service: ${ctx.selectedService?.name || 'None'} (${ctx.selectedService?.duration} min - ₹${ctx.selectedService?.price})
Date/Time: ${ctx.preferredDate} ${ctx.preferredTime}
Map: ${spa.mapUrl}
${type === 'escalate' ? 'Reason: Message limit reached (100+/day). Please follow up.' : ''}
    `;
    await whatsappService.sendMessageToAdmin(details);
  }

  private async scheduleReminder(ctx: any, userId: string, phone: string, spa: any) {
    const bookingDate = new Date(ctx.preferredDate === 'Tomorrow' ? Date.now() + 86400000 : Date.now());
    bookingDate.setHours(parseInt(ctx.preferredTime?.split(' ')[0]) || 17, 0, 0, 0);
    const reminderTime = new Date(bookingDate.getTime() - 30 * 60000);
    if (reminderTime > new Date()) {
      setTimeout(async () => {
        const reminder = `Reminder: Aapka ${ctx.selectedService.name} ${ctx.preferredDate} ${ctx.preferredTime} ke liye confirmed hai at ${spa.spaName}. 30 min bache hain! 😊`;
        await this.send(userId, phone, reminder, 'reminder');
      }, reminderTime.getTime() - Date.now());
    }
  }

  async processMessage(userId: string, customerPhone: string, message: string): Promise<void> {
    try {
      const spaDoc = await SpaData.findOne({ userId });
      if (!spaDoc || !spaDoc.autoReplySettings.isEnabled) return;

      const spa = await this.getSpaContext(userId);

      let state = await ConversationState.findOne({ userId, customerPhone });
      if (!state) {
        state = new ConversationState({ userId, customerPhone, currentStep: 'greeting', context: { dailyMessageCount: 0, lastMessageDate: new Date().toDateString() } });
      }

      const ctx: any = state.context;
      ctx.messageCount = (ctx.messageCount || 0) + 1;
      ctx.lastActivity = new Date();
      ctx.lastUserMessage = message;

      await this.saveHistory(userId, customerPhone, 'incoming', message, state.currentStep);

      if (await this.isMessageLimitReached(ctx)) {
        await this.send(userId, customerPhone, "Main aapko manager se connect kar rahi hu, thoda wait kijiye. Aapki madad manager karenge!", 'escalate');
        await this.sendAdminNotification(userId, 'escalate', ctx, spa);
        state.isActive = false;
        await state.save();
        return;
      }

      // FIXED: Extraction FIRST, before special checks
      await this.extractAndUpdateContext(message, ctx, spaDoc);
      await state.save();

      if (this.isAdultIntent(message)) {
        const reply = `Sir/Ma'am, hum sirf professional spa services dete hain. Privacy ke liye, ${spa.adminPhone} par call karein.`;
        await this.send(userId, customerPhone, reply, 'adult_redirect');
        await this.sendAdminNotification(userId, 'cancel', ctx, spa);
        return;
      }

      if (this.isTherapistQuery(message)) {
        const reply = `Humare paas experienced female aur professional therapists hain. Sab certified aur trained! Booking ke time choose kar sakte hain. Kya aur kuch jaanna hai?`;
        await this.send(userId, customerPhone, reply, 'therapist_info');
        return;
      }

      if (this.isAbusive(message)) {
        ctx.abuseCount = (ctx.abuseCount || 0) + 1;
        if (ctx.abuseCount >= 2) {
          state.isActive = false;
          await this.send(userId, customerPhone, `Sorry, respectful language please.`, 'blocked');
        } else {
          await this.send(userId, customerPhone, `Please respectful rahein. Kaise madad kar sakti hu?`, 'abuse_warning');
        }
        await state.save();
        return;
      }

      if (this.isSpam(message, ctx)) {
        ctx.spamCount = (ctx.spamCount || 0) + 1;
        if (ctx.spamCount >= 5) {
          state.isActive = false;
          await state.save();
          return;
        }
        if (ctx.spamCount === 3) {
          await this.send(userId, customerPhone, `Main yahan spa booking ke liye hu. Service ya booking ke baare mein puchiye!`, 'spam_warning');
        }
        await state.save();
        return;
      }

      const ready = ctx.customerName && ctx.customerPhone && ctx.selectedService?.duration && ctx.preferredDate && ctx.preferredTime && !ctx.bookingConfirmed && !ctx.bookingCancelled;

      if (ready) {
        if (ctx.bookingConfirmed) {
          const confirmMsg = `Thank you ${ctx.customerName}! Aapki booking confirmed hai:\n\nUser: ${ctx.customerName} (${ctx.customerPhone})\nSpa: ${spa.spaName}, ${spa.location}\nService: ${ctx.selectedService.name} (${ctx.selectedService.duration} min - ₹${ctx.selectedService.price})\nDate/Time: ${ctx.preferredDate} ${ctx.preferredTime}\nMap: ${spa.mapUrl}\n\nCenter pe 10-15 min pehle pahunchiye. Kuch poochna ho to puchiye! 🌿`;
          await this.send(userId, customerPhone, confirmMsg, 'confirmed');
          await this.sendAdminNotification(userId, 'booking', ctx, spa);
          await this.scheduleReminder(ctx, userId, customerPhone, spa);
          await state.save();
          return;
        }

        if (ctx.bookingCancelled) {
          const cancelMsg = `Koi baat nahi ${ctx.customerName}! Humare paas amazing offers hain—center visit karke benefits le lijiye. 20% off first visit! Kab free hain aap?`;
          await this.send(userId, customerPhone, cancelMsg, 'cancelled');
          await this.sendAdminNotification(userId, 'cancel', ctx, spa);
          await state.save();
          return;
        }

        const summaryMsg = `Thank you ${ctx.customerName || 'Sir/Maam'}!\n\nAapke details:\nName: ${ctx.customerName || 'Please share'}\nPhone: ${ctx.customerPhone || customerPhone}\nSpa: ${spa.spaName}, ${spa.location}\nService: ${ctx.selectedService.name} (${ctx.selectedService.duration} min - ₹${ctx.selectedService.price})\nDate/Time: ${ctx.preferredDate} ${ctx.preferredTime}\nMap: ${spa.mapUrl}\n\nConfirm kar dein ('yes') ya change chahiye ('no')? Note: Center pe change kar sakte hain.`;
        await this.send(userId, customerPhone, summaryMsg, 'summary');
        await state.save();
        return;
      }

      const reply = await this.generateResponse(userId, customerPhone, message, state, spa);
      await this.send(userId, customerPhone, reply, 'ai_response');

      state.context = ctx;
      state.markModified('context');
      await state.save();

    } catch (error: any) {
      console.error('AutoReply Error:', error);
    }
  }
}

export default new SmartSpaManager();