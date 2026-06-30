import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { LiveQuoteHub, type QuoteUpdate } from './live-quote-hub.js';

describe('LiveQuoteHub', () => {
  test('delivers a publish only to the addressed user', () => {
    const hub = new LiveQuoteHub();
    const toA: QuoteUpdate[] = [];
    const toB: QuoteUpdate[] = [];
    hub.subscribe('user-a', (u) => toA.push(u));
    hub.subscribe('user-b', (u) => toB.push(u));

    hub.publish('user-a', { listingIds: ['L1'], asOf: '2026-06-29T00:00:00Z' });

    assert.deepEqual(toA, [{ listingIds: ['L1'], asOf: '2026-06-29T00:00:00Z' }]);
    assert.deepEqual(toB, []);
  });

  test('fans out to every sink (tab) of the same user', () => {
    const hub = new LiveQuoteHub();
    let tab1 = 0;
    let tab2 = 0;
    hub.subscribe('user-a', () => (tab1 += 1));
    hub.subscribe('user-a', () => (tab2 += 1));

    hub.publish('user-a', { listingIds: ['L1'], asOf: null });

    assert.equal(tab1, 1);
    assert.equal(tab2, 1);
    assert.deepEqual(hub.connectedUserIds(), ['user-a']);
    assert.equal(hub.hasSubscribers('user-a'), true);
  });

  test('unsubscribe removes the sink and drops the user when the last tab closes', () => {
    const hub = new LiveQuoteHub();
    const received: QuoteUpdate[] = [];
    const off1 = hub.subscribe('user-a', (u) => received.push(u));
    const off2 = hub.subscribe('user-a', (u) => received.push(u));

    off1();
    assert.equal(hub.hasSubscribers('user-a'), true); // one tab remains
    off2();
    assert.equal(hub.hasSubscribers('user-a'), false);
    assert.deepEqual(hub.connectedUserIds(), []);

    hub.publish('user-a', { listingIds: ['L1'], asOf: null });
    assert.deepEqual(received, []); // nobody connected, nothing delivered
  });

  test('unsubscribe is idempotent', () => {
    const hub = new LiveQuoteHub();
    const off = hub.subscribe('user-a', () => undefined);
    off();
    assert.doesNotThrow(() => off());
    assert.equal(hub.hasSubscribers('user-a'), false);
  });
});
