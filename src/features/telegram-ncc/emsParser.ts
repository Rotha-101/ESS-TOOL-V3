// Telegram export → EMS record parser. Ported verbatim (logic-wise) from the
// standalone PA Reporting Tool. Extracts TIME + per-unit P/Q/SOC from Telegram
// message `text_entities`, using the strict "#TAG followed by plain" rule.

import type {
  TelegramMessage,
  EmsRecord,
  ExtractionResult,
  EmsUnitData,
} from './types';
import { ValidationStatus } from './types';
import { REGEX_PATTERNS, SUPPORTED_UNITS } from './constants';

export class EmsParser {
  /** Handles both a single message object or an array/`{messages:[]}` wrapper. */
  static parse(jsonContent: any): ExtractionResult {
    try {
      const messages: TelegramMessage[] = Array.isArray(jsonContent)
        ? jsonContent
        : jsonContent.messages || [jsonContent];

      const records: EmsRecord[] = [];

      for (const msg of messages) {
        if (!this.isValidMessageFormat(msg)) continue;
        const record = this.extractFromMessage(msg);
        if (record) records.push(record);
      }

      if (records.length === 0) {
        return {
          records: [],
          status: ValidationStatus.FAIL,
          error:
            "No valid operational data found in the provided file. Ensure it contains 'text_entities' with '#SWG' hashtags followed by 'plain' text data.",
        };
      }

      return {
        records: records.sort(
          (a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime(),
        ),
        status: ValidationStatus.PASS,
      };
    } catch (err) {
      return {
        records: [],
        status: ValidationStatus.FAIL,
        error: 'Critical parsing error: ' + (err instanceof Error ? err.message : String(err)),
      };
    }
  }

  private static isValidMessageFormat(msg: any): boolean {
    return !!(msg && msg.text_entities && Array.isArray(msg.text_entities));
  }

  private static extractFromMessage(msg: TelegramMessage): EmsRecord | null {
    let timestamp: string | null = null;
    const units: Record<string, EmsUnitData> = {};

    // Find the TIME in any plain text entity.
    for (const entity of msg.text_entities) {
      if (entity.type === 'plain') {
        const timeMatch = entity.text.match(REGEX_PATTERNS.TIME);
        if (timeMatch) {
          timestamp = timeMatch[1].trim();
          break;
        }
      }
    }

    if (!timestamp) return null;

    // Strict parsing rule: hashtag entity immediately followed by plain entity.
    for (let i = 0; i < msg.text_entities.length - 1; i++) {
      const current = msg.text_entities[i];
      const next = msg.text_entities[i + 1];

      if (current.type === 'hashtag' && next.type === 'plain') {
        const unitName = current.text.replace('#', '').trim();

        if (SUPPORTED_UNITS.includes(unitName)) {
          const pMatch = next.text.match(REGEX_PATTERNS.P);
          const qMatch = next.text.match(REGEX_PATTERNS.Q);
          const socMatch = next.text.match(REGEX_PATTERNS.SOC);

          units[unitName] = {
            p: pMatch ? parseFloat(pMatch[1]) : 0,
            q: qMatch ? parseFloat(qMatch[1]) : 0,
            soc: socMatch ? parseFloat(socMatch[1]) : 0,
          };
        }
      }
    }

    // Ensure every supported unit exists in the record (default 0).
    const finalUnits: Record<string, EmsUnitData> = {};
    SUPPORTED_UNITS.forEach(unit => {
      finalUnits[unit] = units[unit] || { p: 0, q: 0, soc: 0 };
    });

    return { datetime: timestamp, units: finalUnits };
  }
}
