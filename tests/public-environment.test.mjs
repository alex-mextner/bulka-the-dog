import test from 'node:test';
import assert from 'node:assert/strict';
import { publicEnvironmentFrom } from '../scripts/public-environment.mjs';

test('public build environment contains the exact preview origin and no secret fields', () => {
  const value = publicEnvironmentFrom({
    VERCEL_URL: 'bulka-preview.example',
    CONLOCA_BUILD_TOKEN: 'must-never-be-copied',
    PRIVATE_TOKEN: 'must-never-be-copied',
    PUBLIC_ENABLE_ANALYTICS: '1',
  });
  assert.deepEqual(value, {
    publicBaseUrl: 'https://bulka-preview.example', baseUrl: '/',
    siteUrl: 'https://bulka.rs',
    enableGame: false, enableAnalytics: true, enableDonations: false, donationUrl: '',
  });
  assert.equal(JSON.stringify(value).includes('must-never-be-copied'), false);
});

test('production SEO origin stays independent of the per-build editor asset origin', () => {
  const value = publicEnvironmentFrom({ VERCEL_URL: 'bulka-a1b2.vercel.app', VERCEL_ENV: 'production' });
  assert.equal(value.siteUrl, 'https://bulka.rs');
  assert.equal(value.publicBaseUrl, 'https://bulka-a1b2.vercel.app');
});

test('analytics preserve the existing enabled default and all flags use one boolean contract', () => {
  assert.equal(publicEnvironmentFrom({ VERCEL_ENV: 'production' }).enableAnalytics, true);
  // A registered build made outside Vercel must produce identical public bytes.
  assert.equal(publicEnvironmentFrom({}).enableAnalytics, true);
  for (const flag of ['1', 'true']) assert.equal(publicEnvironmentFrom({ PUBLIC_ENABLE_ANALYTICS: flag }).enableAnalytics, true);
  for (const flag of ['0', 'false']) assert.equal(publicEnvironmentFrom({ PUBLIC_ENABLE_ANALYTICS: flag }).enableAnalytics, false);
});

test('the existing game flag and its public alias both enable the optional game', () => {
  for (const flag of ['1', 'true']) {
    assert.equal(publicEnvironmentFrom({ VITE_ENABLE_GAME: flag }).enableGame, true);
    assert.equal(publicEnvironmentFrom({ PUBLIC_ENABLE_GAME: flag }).enableGame, true);
  }
  assert.equal(publicEnvironmentFrom({ PUBLIC_ENABLE_GAME: '0', VITE_ENABLE_GAME: '1' }).enableGame, false);
  assert.equal(publicEnvironmentFrom({}).enableGame, false);
});

test('explicit public URL wins for disposable registration and local builds have a stable fallback', () => {
  assert.equal(publicEnvironmentFrom({
    CONLOCA_PUBLIC_BASE_URL: 'https://isolated.example', VERCEL_URL: 'other.example',
  }).publicBaseUrl, 'https://isolated.example');
  assert.equal(publicEnvironmentFrom({}).publicBaseUrl, 'http://localhost:8080');
});

test('empty public flags use the existing default or legacy fallback', () => {
  assert.equal(publicEnvironmentFrom({ PUBLIC_ENABLE_ANALYTICS: '' }).enableAnalytics, true);
  assert.equal(publicEnvironmentFrom({ PUBLIC_ENABLE_GAME: '', VITE_ENABLE_GAME: '1' }).enableGame, true);
  assert.equal(publicEnvironmentFrom({ PUBLIC_ENABLE_GAME: '' }).enableGame, false);
  for (const value of ['0', 'false']) {
    assert.equal(publicEnvironmentFrom({ PUBLIC_ENABLE_ANALYTICS: value }).enableAnalytics, false);
    assert.equal(publicEnvironmentFrom({ PUBLIC_ENABLE_GAME: value, VITE_ENABLE_GAME: 'true' }).enableGame, false);
  }
});
