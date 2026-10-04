import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { authThrottleMessage, createAuthThrottle, isRateLimitedError } from '../lib/authThrottle';
import { Feather } from './Feather';
import { colors, radius, spacing, type } from '../design/tokens';
import { Banner, BrandMark, Button, Card, Input, PasswordInput } from './ui';

export type AuthResult = void | { info?: string };

/** Maps provider errors to plain language without inventing causes. */
export function friendlyAuthError(message: string): string {
  const text = message || '';
  if (!text.trim()) return 'We could not continue. Check your connection and try again.';
  if (/invalid login credentials/i.test(text)) return 'Email or password is incorrect. Check them and try again.';
  if (/email not confirmed/i.test(text)) return 'Confirm your email first — open the confirmation link we sent, then sign in.';
  if (/already registered/i.test(text)) return 'An account with this email already exists. Sign in instead, or use a different email.';
  if (/password.*(?:\b[68]\b|at least|minimum length)/i.test(text)) return 'Password does not meet the minimum length. Use at least 8 characters.';
  if (/\brate[\s-]*limit|too many|\b429\b/i.test(text)) return 'Too many attempts. Wait a moment before trying again.';
  if (/network|fetch|failed to|timed? ?out/i.test(text)) return 'We could not reach the sign-in service. Check your connection and try again.';
  if (/(?:signup|sign.?up|registration).*(?:disabled|not allowed)/i.test(text)) return 'New account creation is disabled on this server.';
  return text.length <= 160 ? text : 'We could not continue. Check your connection and try again.';
}

export function AuthScreen({ onSubmit, onResetPassword, onResendConfirmation }: { onResetPassword?: (email: string) => Promise<void>; onResendConfirmation?: (email: string) => Promise<void>; onSubmit: (email: string, password: string, signUp: boolean) => Promise<AuthResult> }) {
  const compact = useWindowDimensions().width < 380;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signUp, setSignUp] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  // Client-side pacing only; Supabase's server-side limits remain the real control.
  const throttle = useMemo(() => createAuthThrottle(), []);
  const request = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const blocked = () => {
    const wait = throttle.remaining();
    if (wait > 0) { setError(authThrottleMessage(wait)); return true; }
    return false;
  };
  const submit = async () => {
    if (request.current) return;
    const nextErrors: { email?: string; password?: string } = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) nextErrors.email = 'Enter a valid email address.';
    if (signUp ? password.length < 8 : !password.length) nextErrors.password = signUp ? 'Use at least 8 characters.' : 'Enter your password.';
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    if (blocked()) return;
    request.current = true; setLoading(true); setError(''); setInfo('');
    try {
      const result = await onSubmit(email.trim(), password, signUp);
      if (active.current && result && result.info) setInfo(result.info);
      if (!result) throttle.reset();
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      if (isRateLimitedError(message)) throttle.penalize();
      if (active.current) setError(friendlyAuthError(message));
    } finally {
      const wait = throttle.record();
      request.current = false;
      if (active.current) { setLoading(false); if (wait > 0) setError(authThrottleMessage(wait)); }
    }
  };

  const resetPassword = async () => {
    if (request.current || !onResetPassword) return;
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setFieldErrors({ email: 'Enter your email first.' }); return; }
    if (blocked()) return;
    request.current = true; setLoading(true); setError(''); setInfo('');
    try { await onResetPassword(email.trim()); if (active.current) setInfo('If an account exists for this email, a password reset link will be sent.'); }
    catch (e) { const message = e instanceof Error ? e.message : ''; if (isRateLimitedError(message)) throttle.penalize(); if (active.current) setError(friendlyAuthError(message)); }
    finally { request.current = false; if (active.current) setLoading(false); }
  };

  const resendConfirmation = async () => {
    if (request.current || !onResendConfirmation) return;
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setFieldErrors({ email: 'Enter your email first.' }); return; }
    if (blocked()) return;
    request.current = true; setLoading(true); setError(''); setInfo('');
    try {
      await onResendConfirmation(email.trim());
      // Deliberately identical whether or not the address has an account: a
      // differing reply here would turn this screen into an account oracle.
      if (active.current) setInfo('If an account is waiting for confirmation, a new link is on its way. Check your inbox and spam folder.');
    } catch (e) { const message = e instanceof Error ? e.message : ''; if (isRateLimitedError(message)) throttle.penalize(); if (active.current) setError(friendlyAuthError(message)); }
    finally { request.current = false; if (active.current) setLoading(false); }
  };

  return (
    <ScrollView contentContainerStyle={[styles.page, { flexGrow: 1 }]} keyboardShouldPersistTaps="handled">
      <View style={styles.brandRow}>
        <BrandMark size={44} />
        <View>
          <Text style={styles.brandName}>ProofPilot</Text>
          <Text style={styles.brandTag}>PURCHASE PROTECTION</Text>
        </View>
      </View>
      <Card style={[styles.card, compact && { padding: spacing.lg }]} >
        <Text style={type.display}>{signUp ? 'Start protecting purchases' : 'Welcome back'}</Text>
        <Text style={[type.body, { marginTop: spacing.sm }]}>Sign in to keep your purchase protection record private and in sync.</Text>
        {info ? <View style={{ marginTop: spacing.lg }}><Banner tone="info" icon="mail" title="Check your inbox" message={info} /></View> : null}
        {error ? <View style={{ marginTop: spacing.lg }}><Banner tone="danger" icon="alert-circle" title="We couldn’t sign you in" message={error} /></View> : null}
        <View style={styles.form}>
          <Input
            editable={!loading}
            label="EMAIL"
            value={email}
            onChangeText={(value) => { setEmail(value); setFieldErrors((current) => ({ ...current, email: undefined })); }}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            error={fieldErrors.email}
          />
          <PasswordInput
            ref={passwordRef}
            editable={!loading}
            label="PASSWORD"
            value={password}
            onChangeText={(value) => { setPassword(value); setFieldErrors((current) => ({ ...current, password: undefined })); }}
            autoComplete={signUp ? 'new-password' : 'password'}
            textContentType={signUp ? 'newPassword' : 'password'}
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
            error={fieldErrors.password}
            hint={signUp ? 'At least 8 characters' : undefined}
          />
          <Button label={signUp ? 'Create account' : 'Sign in'} onPress={submit} icon="arrow-right" loading={loading} fullWidth />
        </View>
        {onResetPassword && !signUp ? <Button label="Forgot password?" variant="ghost" onPress={resetPassword} disabled={loading} fullWidth /> : null}
        {onResendConfirmation && signUp ? <Button label="Resend confirmation email" variant="ghost" onPress={resendConfirmation} disabled={loading} fullWidth /> : null}
        <Button disabled={loading} label={signUp ? 'I already have an account' : 'Create an account instead'} onPress={() => { setSignUp(!signUp); setError(''); setInfo(''); }} variant="ghost" fullWidth />
        <Text style={[type.caption, { textAlign: 'center', marginTop: spacing.md }]}>Account and synchronized purchase data are processed by Supabase. Document files remain on this device; keep your originals.</Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { justifyContent: 'center', padding: spacing.lg, backgroundColor: colors.canvas },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, alignSelf: 'center', marginBottom: spacing.xl, width: '100%', maxWidth: 460 },
  brandName: { fontSize: 18, fontWeight: '800', letterSpacing: -0.6, color: colors.ink },
  brandTag: { fontSize: 8.5, fontWeight: '800', letterSpacing: 1.1, color: colors.subtle, marginTop: 2 },
  card: { width: '100%', maxWidth: 460, alignSelf: 'center', padding: spacing.xxl, gap: spacing.md },
  form: { gap: spacing.md, marginVertical: spacing.xl },
  recoveryIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.brandMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export function PasswordRecovery({ onSave }: { onSave: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const save = async () => {
    if (request.current) return;
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    request.current = true; setBusy(true); setError('');
    try { await onSave(password); }
    catch { if (active.current) setError('Password change could not be confirmed. Retry or request a new recovery link.'); }
    finally { request.current = false; if (active.current) setBusy(false); }
  };
  return (
    <ScrollView contentContainerStyle={[styles.page, { flexGrow: 1 }]} keyboardShouldPersistTaps="handled">
      <View style={styles.brandRow}>
        <BrandMark size={44} />
        <View>
          <Text style={styles.brandName}>ProofPilot</Text>
          <Text style={styles.brandTag}>PURCHASE PROTECTION</Text>
        </View>
      </View>
      <Card style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View style={styles.recoveryIcon}><Feather name="lock" size={18} color={colors.brandDark} /></View>
          <Text style={type.heading}>Choose a new password</Text>
        </View>
        <Text style={type.body}>
          You opened a valid password-recovery link. Pick a new password for your account — your purchase records are untouched.
        </Text>
        <PasswordInput
          editable={!busy}
          label="NEW PASSWORD"
          autoComplete="new-password"
          textContentType="newPassword"
          value={password}
          onChangeText={setPassword}
          error={error}
          hint="At least 8 characters"
        />
        <Button label="Save new password" onPress={save} loading={busy} icon="check" fullWidth />
      </Card>
    </ScrollView>
  );
}
