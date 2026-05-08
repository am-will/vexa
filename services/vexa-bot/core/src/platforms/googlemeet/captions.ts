export interface GoogleMeetCaptionEvent {
  event_type: 'CAPTION_TEXT';
  participant_name: string;
  caption_text: string;
  /** Relative to Vexa session/audio start, in milliseconds when sessionStartMs is known. */
  relative_timestamp_ms: number;
  source: 'google_meet_captions';
}

const UI_NAME_PATTERNS = [
  /turn on captions/i,
  /turn off captions/i,
  /captions are on/i,
  /captions are off/i,
  /let participants/i,
  /send messages/i,
  /activities/i,
  /people/i,
  /chat/i,
  /present/i,
  /leave call/i,
  /^you$/i,
  /^unknown$/i,
  /^google participant \(/i,
  /spaces\//i,
  /devices\//i,
  /^keyboard_arrow_/i,
  /^format_size$/i,
  /^language$/i,
  /^send$/i,
  /^info$/i,
  /^\d{1,2}:\d{2}$/,
  /_/,
];

const UI_TEXT_PATTERNS = [
  /turn on microphone/i,
  /turn on camera/i,
  /audio settings/i,
  /video settings/i,
  /font size/i,
  /font color/i,
  /caption settings/i,
  /open caption settings/i,
  /meeting details/i,
  /chat with everyone/i,
  /meeting tools/i,
  /^send message$/i,
  /^english$/i,
];

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function isUiOrBotName(name: string, botName?: string): boolean {
  const normalized = normalizeSpaces(name);
  if (!normalized) return true;
  if (normalized.length > 80) return true;

  const lower = normalized.toLowerCase();
  if (botName) {
    const botLower = normalizeSpaces(botName).toLowerCase();
    if (botLower && (lower.includes(botLower) || botLower.includes(lower))) return true;
  }

  return UI_NAME_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isUiCaptionText(text: string, participantName: string): boolean {
  const normalized = normalizeSpaces(text);
  if (!normalized) return true;
  if (normalized.length > 1000) return true;
  const lower = normalized.toLowerCase();
  const speakerLower = normalizeSpaces(participantName).toLowerCase();
  if (speakerLower && lower === speakerLower) return true;
  return UI_TEXT_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function normalizeGoogleMeetCaptionEvent(
  speakerName: string,
  captionText: string,
  timestampMs: number,
  sessionStartMs: number = 0,
  botName?: string,
): GoogleMeetCaptionEvent | null {
  const participantName = normalizeSpaces(speakerName);
  const text = normalizeSpaces(captionText);

  if (isUiOrBotName(participantName, botName)) return null;
  if (isUiCaptionText(text, participantName)) return null;
  if (!text || text.length < 2) return null;
  if (text.length > 1000) return null;

  const relativeTimestampMs = sessionStartMs > 0
    ? Math.max(0, Math.round(timestampMs - sessionStartMs))
    : Math.max(0, Math.round(timestampMs));

  return {
    event_type: 'CAPTION_TEXT',
    participant_name: participantName,
    caption_text: text,
    relative_timestamp_ms: relativeTimestampMs,
    source: 'google_meet_captions',
  };
}

/**
 * Accumulates Google Meet caption observations as a conservative side-channel.
 * Google Meet mutates captions in-place while it finalizes text; when the same
 * speaker's next event extends the previous text inside a short window we
 * replace the previous partial instead of appending duplicates.
 */
export class GoogleMeetCaptionAccumulator {
  private events: GoogleMeetCaptionEvent[] = [];

  constructor(
    private readonly maxEvents: number = 5000,
    private readonly partialWindowMs: number = 5000,
    private readonly botName?: string,
  ) {}

  add(speakerName: string, captionText: string, timestampMs: number, sessionStartMs: number = 0): GoogleMeetCaptionEvent | null {
    const event = normalizeGoogleMeetCaptionEvent(
      speakerName,
      captionText,
      timestampMs,
      sessionStartMs,
      this.botName,
    );
    if (!event) return null;

    const prev = this.events[this.events.length - 1];
    if (prev && prev.participant_name === event.participant_name) {
      const delta = event.relative_timestamp_ms - prev.relative_timestamp_ms;
      const prevText = prev.caption_text.toLowerCase();
      const newText = event.caption_text.toLowerCase();

      if (delta >= 0 && delta <= this.partialWindowMs) {
        if (newText === prevText) return prev;
        if (newText.startsWith(prevText) || prevText.startsWith(newText)) {
          if (event.caption_text.length > prev.caption_text.length) {
            prev.caption_text = event.caption_text;
          }
          return prev;
        }
      }
    }

    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events.splice(0, this.events.length - this.maxEvents);
    }
    return event;
  }

  snapshot(): GoogleMeetCaptionEvent[] {
    return this.events.map((event) => ({ ...event }));
  }

  count(): number {
    return this.events.length;
  }
}
