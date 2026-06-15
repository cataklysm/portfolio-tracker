import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeMarketSession, type ExchangeCalendar } from './session.js';

const XETRA: ExchangeCalendar = { timezone: 'Europe/Berlin', openLocal: '09:00', closeLocal: '17:30', holidays: [] };
const NYSE: ExchangeCalendar = { timezone: 'America/New_York', openLocal: '09:30', closeLocal: '16:00', holidays: ['2026-01-01'] };

describe('computeMarketSession', () => {
  test('open during regular local hours', () => {
    // 2026-01-08 is a Thursday. 12:00 Berlin local.
    const s = computeMarketSession(new Date('2026-01-08T11:00:00Z'), XETRA);
    assert.equal(s.status, 'open');
    assert.equal(s.local_date, '2026-01-08');
    assert.equal(s.current_trading_date, '2026-01-08');
    assert.equal(s.previous_trading_date, '2026-01-07');
  });

  test('closed before the open', () => {
    // 07:00 Berlin (06:00Z) on a Thursday — before 09:00 open.
    const s = computeMarketSession(new Date('2026-01-08T06:00:00Z'), XETRA);
    assert.equal(s.status, 'closed');
    assert.equal(s.current_trading_date, '2026-01-08');
  });

  test('closed after the close', () => {
    // 18:00 Berlin (17:00Z) — after 17:30 close.
    const s = computeMarketSession(new Date('2026-01-08T17:00:00Z'), XETRA);
    assert.equal(s.status, 'closed');
  });

  test('weekend status; prior trading date is the Friday', () => {
    // 2026-01-10 is a Saturday.
    const s = computeMarketSession(new Date('2026-01-10T12:00:00Z'), XETRA);
    assert.equal(s.status, 'weekend');
    assert.equal(s.current_trading_date, '2026-01-09'); // Friday
    assert.equal(s.previous_trading_date, '2026-01-08'); // Thursday
  });

  test('holiday status; current trading date falls back to the prior session', () => {
    // 2026-01-01 (Thu) is a listed NYSE holiday.
    const s = computeMarketSession(new Date('2026-01-01T15:00:00Z'), NYSE);
    assert.equal(s.status, 'holiday');
    assert.equal(s.current_trading_date, '2025-12-31'); // Wed
    assert.equal(s.previous_trading_date, '2025-12-30');
  });

  test('previous_trading_date skips both a holiday and the weekend', () => {
    // Monday 2026-01-05; the Thu before was a holiday and Fri 01-02 trades.
    const s = computeMarketSession(new Date('2026-01-05T15:00:00Z'), NYSE);
    assert.equal(s.local_date, '2026-01-05');
    assert.equal(s.current_trading_date, '2026-01-05');
    assert.equal(s.previous_trading_date, '2026-01-02'); // Fri (01-01 holiday skipped)
  });

  test('NYSE open uses local time, not UTC (15:00Z = 10:00 ET → open)', () => {
    const s = computeMarketSession(new Date('2026-01-08T15:00:00Z'), NYSE);
    assert.equal(s.status, 'open');
  });

  test('unknown when there is no exchange or timezone', () => {
    assert.equal(computeMarketSession(new Date(), null).status, 'unknown');
    const s = computeMarketSession(new Date('2026-01-08T11:00:00Z'), {
      timezone: 'Europe/Berlin',
      openLocal: null,
      closeLocal: null,
      holidays: [],
    });
    // A trading day but no hours → status unknown, dates still resolved.
    assert.equal(s.status, 'unknown');
    assert.equal(s.current_trading_date, '2026-01-08');
  });

  test('invalid timezone resolves to unknown', () => {
    assert.equal(computeMarketSession(new Date(), { timezone: 'Not/AZone', openLocal: '09:00', closeLocal: '17:00', holidays: [] }).status, 'unknown');
  });
});
