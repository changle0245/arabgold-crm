/**
 * WhatsApp Chat Parser
 *
 * Parses WhatsApp exported .txt files into structured message data.
 *
 * WhatsApp export format examples:
 * - Standard message: "2024/1/15 14:32 - 张三: 消息内容"
 * - Attachment: "2024/1/15 14:35 - 李四: <attached: 00000123-PHOTO-2024-01-15-14-35-45.jpg>"
 * - System message: "Messages and calls are end-to-end encrypted..."
 */

export interface ParsedWhatsAppMessage {
  sentAt: Date;
  senderName: string;
  content: string;
  isAttachment: boolean;
}

// WhatsApp message line pattern: "YYYY/MM/DD HH:MM - Sender: Content"
const MESSAGE_PATTERN = /^(\d{4}\/\d{1,2}\/\d{1,2})\s+(\d{1,2}:\d{2})\s+-\s+([^:]+):\s*(.*)$/;

// Attachment pattern: "<attached: filename>"
const ATTACHMENT_PATTERN = /<attached:\s*([^>]+)>/;

/**
 * Parse WhatsApp exported txt file content
 * @param content - Raw text content from WhatsApp export
 * @returns Array of parsed messages
 */
export function parseWhatsAppChat(content: string): ParsedWhatsAppMessage[] {
  const lines = content.split('\n');
  const messages: ParsedWhatsAppMessage[] = [];
  let currentMessage: ParsedWhatsAppMessage | null = null;

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    const match = MESSAGE_PATTERN.exec(trimmedLine);

    if (match) {
      // Save previous message if exists
      if (currentMessage) {
        messages.push(currentMessage);
      }

      // Parse new message
      const [, datePart, timePart, senderName, content] = match;

      // Parse date: "2024/1/15" -> Date object
      const [year, month, day] = datePart.split('/').map(Number);
      const [hour, minute] = timePart.split(':').map(Number);
      const sentAt = new Date(year, month - 1, day, hour, minute);

      // Check if content is an attachment
      const isAttachment = ATTACHMENT_PATTERN.test(content);

      currentMessage = {
        sentAt,
        senderName: senderName.trim(),
        content: content.trim(),
        isAttachment,
      };
    } else {
      // Multi-line message continuation
      if (currentMessage) {
        currentMessage.content += '\n' + trimmedLine;
      }
      // Else: System message or unrecognized line, skip
    }
  }

  // Don't forget the last message
  if (currentMessage) {
    messages.push(currentMessage);
  }

  return messages;
}

/**
 * Detect message direction based on sender name
 * @param senderName - Name of the message sender
 * @param myCompanyKeywords - Keywords to identify outgoing messages (e.g., company name, employee names)
 * @returns 'outgoing' if sent by us, 'incoming' if from customer
 */
export function detectMessageDirection(
  senderName: string,
  myCompanyKeywords: string[] = []
): 'outgoing' | 'incoming' {
  const lowerName = senderName.toLowerCase();

  // Check if sender name contains any company keywords
  for (const keyword of myCompanyKeywords) {
    if (lowerName.includes(keyword.toLowerCase())) {
      return 'outgoing';
    }
  }

  // Default: assume incoming (from customer)
  return 'incoming';
}

/**
 * Validate WhatsApp export file format
 * @param content - Raw text content
 * @returns True if content looks like WhatsApp export
 */
export function isValidWhatsAppExport(content: string): boolean {
  const lines = content.split('\n').filter(line => line.trim());

  if (lines.length === 0) return false;

  // Check if at least one line matches the message pattern
  for (const line of lines.slice(0, 10)) { // Check first 10 lines
    if (MESSAGE_PATTERN.test(line)) {
      return true;
    }
  }

  return false;
}
