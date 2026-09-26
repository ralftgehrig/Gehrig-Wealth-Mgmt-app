import { detectBarclays, parseBarclays } from './barclays';
import { detectWise, parseWise } from './wise';
import { parseAmex } from './amex';
import { parseGeneric } from './generic';
import type { ParsedStatement } from '../types';

export interface UploadedFile {
  name: string;
  buffer: ArrayBuffer;
}

/** Detects the statement format and parses it into normalised rows. */
export function parseStatementFile(file: UploadedFile, selfNames: string[]): ParsedStatement {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
    return parseAmex(file.buffer, file.name);
  }

  const text = new TextDecoder('utf-8').decode(file.buffer);

  if (detectBarclays(text)) return parseBarclays(text, file.name, selfNames);
  if (detectWise(text)) return parseWise(text, file.name, selfNames);
  return parseGeneric(text, file.name);
}
