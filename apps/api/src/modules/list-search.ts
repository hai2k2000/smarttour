import { BadRequestException } from '@nestjs/common';

export const LIST_SEARCH_MIN_LENGTH = 2;
export const LIST_SEARCH_MAX_LENGTH = 80;

export type InsensitiveContains = { contains: string; mode: 'insensitive' };

export function normalizeListSearch(value?: string | null, label = 'Từ khóa tìm kiếm') {
  const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!text || text.length < LIST_SEARCH_MIN_LENGTH) return undefined;
  if (text.length > LIST_SEARCH_MAX_LENGTH) {
    throw new BadRequestException(`${label} không được vượt quá ${LIST_SEARCH_MAX_LENGTH} ký tự`);
  }
  return text;
}

export function containsSearch(search: string): InsensitiveContains {
  return { contains: search, mode: 'insensitive' };
}
