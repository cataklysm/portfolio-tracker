import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { classifyNews, classifySentiment, scoreRelevance, toNewsRows } from './mapping.js';

describe('news classification heuristics', () => {
  test('classifyNews picks the first matching category, else company', () => {
    assert.equal(classifyNews('Acme reports record quarterly earnings'), 'earnings');
    assert.equal(classifyNews('Analyst upgrades Acme to buy, raises price target'), 'analyst');
    assert.equal(classifyNews('Acme faces antitrust probe from regulators'), 'regulation');
    assert.equal(classifyNews('Fed signals interest rate cut amid inflation'), 'macro');
    assert.equal(classifyNews('Acme unveils new product line'), 'company');
    assert.equal(classifyNews('   '), null);
  });

  test('classifySentiment uses signal words, null when none', () => {
    assert.equal(classifySentiment('Shares surge on strong results'), 'positive');
    assert.equal(classifySentiment('Stock tumbles on weak demand'), 'negative');
    assert.equal(classifySentiment('Shares rally then tumble on the day'), 'neutral');
    assert.equal(classifySentiment('Acme holds annual meeting'), null);
  });

  test('scoreRelevance rewards category, sentiment and length', () => {
    const high = scoreRelevance('Acme beats earnings estimates and shares surge to record high');
    const low = scoreRelevance('Acme update');
    assert.ok(high > low);
    assert.ok(high <= 1 && low >= 0);
  });

  test('toNewsRows attaches classification and drops items missing url/timestamp', () => {
    const rows = toNewsRows('instr-1', 'yahoo', [
      { id: 'a', title: 'Acme reports record earnings', publisher: 'X', url: 'https://x/a', publishedAtMs: 1_700_000_000_000 },
      { id: 'b', title: 'No url item', publisher: 'X', url: null, publishedAtMs: 1_700_000_000_000 },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.category, 'earnings');
    assert.equal(typeof rows[0]?.relevance, 'string');
  });
});
