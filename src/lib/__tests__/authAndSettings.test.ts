import { friendlyAuthError } from '../../components/authScreen';
import { validateSettings } from '../../hooks/useAppSettings';

describe('auth error mapping stays truthful', () => {
  test('maps known provider errors to plain language', () => {
    expect(friendlyAuthError('Invalid login credentials')).toContain('Email or password is incorrect');
    expect(friendlyAuthError('Email not confirmed')).toContain('Confirm your email');
    expect(friendlyAuthError('User already registered')).toContain('already exists');
    expect(friendlyAuthError('rate limit exceeded')).toContain('Too many attempts');
    expect(friendlyAuthError('Network request failed')).toContain('could not reach');
  });

  test('passes through short unknown messages instead of inventing causes', () => {
    expect(friendlyAuthError('Database schema out of date')).toBe('Database schema out of date');
  });

  test('never surfaces an unbounded raw error blob', () => {
    const long = `boom ${'x'.repeat(400)}`;
    expect(friendlyAuthError(long)).toBe('We could not continue. Check your connection and try again.');
    expect(friendlyAuthError('')).toBe('We could not continue. Check your connection and try again.');
  });
});

describe('settings validation', () => {
  test('keeps a valid return window', () => {
    expect(validateSettings({ defaultReturnWindowDays: 45, sampleBannerDismissed: true })).toEqual({ defaultReturnWindowDays: 45, sampleBannerDismissed: true, onboardingCompleted: false });
  });

  test.each([-1, 0, 366, 30.5, NaN, '30' as unknown as number])('falls back to 30 days for %s', (value) => {
    expect(validateSettings({ defaultReturnWindowDays: value }).defaultReturnWindowDays).toBe(30);
  });

  test('rejects malformed stored settings without throwing', () => {
    expect(validateSettings(null)).toEqual({ defaultReturnWindowDays: 30, sampleBannerDismissed: false, onboardingCompleted: false });
    expect(validateSettings('junk')).toEqual({ defaultReturnWindowDays: 30, sampleBannerDismissed: false, onboardingCompleted: false });
    expect(validateSettings({ defaultReturnWindowDays: 10, sampleBannerDismissed: 'yes' })).toEqual({ defaultReturnWindowDays: 10, sampleBannerDismissed: false, onboardingCompleted: false });
  });
});
