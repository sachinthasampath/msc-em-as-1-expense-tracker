import { parseAiExplanation } from './schema';

describe('parseAiExplanation', () => {
  it('parses a well-formed response', () => {
    const raw = JSON.stringify({ explanation: 'You spent more on food.', insights: ['Food up 10%'], limitations: [] });
    expect(parseAiExplanation(raw)).toEqual({
      explanation: 'You spent more on food.',
      insights: ['Food up 10%'],
      limitations: [],
    });
  });

  it('strips markdown code fences before parsing', () => {
    const raw = '```json\n' + JSON.stringify({ explanation: 'x', insights: [], limitations: [] }) + '\n```';
    expect(parseAiExplanation(raw)).not.toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(parseAiExplanation(undefined)).toBeNull();
    expect(parseAiExplanation(42)).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(parseAiExplanation('{not json')).toBeNull();
  });

  it('returns null when the schema does not match', () => {
    expect(parseAiExplanation(JSON.stringify({ explanation: '' }))).toBeNull();
  });

  it('returns null when a string field exceeds its length cap rather than passing through a huge payload', () => {
    const huge = 'x'.repeat(2000);
    expect(parseAiExplanation(JSON.stringify({ explanation: huge, insights: [], limitations: [] }))).toBeNull();
  });
});
