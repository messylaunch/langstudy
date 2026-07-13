import { describe, it, expect } from 'vitest'
import { normalizePt, similarity } from './speech.js'

describe('normalizePt', () => {
  it('lowercases and strips accents', () => {
    expect(normalizePt('Você')).toBe('voce')
    expect(normalizePt('CORAÇÃO')).toBe('coracao')
    expect(normalizePt('São Paulo')).toBe('sao paulo')
  })
  it('removes punctuation and collapses whitespace', () => {
    expect(normalizePt('  tudo   bem?! ')).toBe('tudo bem')
    expect(normalizePt('bom-dia')).toBe('bomdia')
  })
  it('handles empty input', () => {
    expect(normalizePt('')).toBe('')
  })
})

describe('similarity', () => {
  it('is 1 for identical strings', () => {
    expect(similarity('obrigado', 'obrigado')).toBe(1)
  })
  it('is accent-insensitive (says it right without the accent)', () => {
    // "voce" vs "você" should score perfectly — accents are normalized away
    expect(similarity('voce', 'você')).toBe(1)
  })
  it('is 0 when either side is empty', () => {
    expect(similarity('', 'obrigado')).toBe(0)
    expect(similarity('obrigado', '')).toBe(0)
  })
  it('scores a close mispronunciation high but below 1', () => {
    const s = similarity('obrigada', 'obrigado') // one char off, len 8
    expect(s).toBeGreaterThan(0.8)
    expect(s).toBeLessThan(1)
  })
  it('scores an unrelated word low', () => {
    expect(similarity('cachorro', 'obrigado')).toBeLessThan(0.5)
  })
  it('never returns negative', () => {
    expect(similarity('a', 'completelydifferent')).toBeGreaterThanOrEqual(0)
  })
})
