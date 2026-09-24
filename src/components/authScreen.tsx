import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, shadows, spacing, type } from '../design/tokens';
import { Banner, Button, Card, Input } from './ui';

export type AuthResult = void | { info?: string };

export function AuthScreen({ onSubmit }: { onSubmit: (email: string, password: string, signUp: boolean) => Promise<AuthResult> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signUp, setSignUp] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const nextErrors: { email?: string; password?: string } = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) nextErrors.email = 'Enter a valid email address.';
    if (password.length < 8) nextErrors.password = 'Use at least 8 characters.';
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setLoading(true); setError(''); setInfo('');
    try {
      const result = await onSubmit(email.trim(), password, signUp);
      if (result && result.info) setInfo(result.info);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not continue. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.page}>
      <View style={styles.brandRow}>
        <View style={styles.logo}><Feather name="shield" size={22} color={colors.ink} /></View>
        <View>
          <Text style={styles.brandName}>ProofPilot</Text>
          <Text style={styles.brandTag}>PURCHASE PROTECTION</Text>
        </View>
      </View>
      <Card style={styles.card}>
        <Text style={type.display}>{signUp ? 'Start protecting purchases' : 'Welcome back'}</Text>
        <Text style={[type.body, { marginTop: spacing.sm }]}>Sign in to keep your purchase protection record private and in sync.</Text>
        {info ? <View style={{ marginTop: spacing.lg }}><Banner tone="info" icon="mail" title="Check your inbox" message={info} /></View> : null}
        {error ? <View style={{ marginTop: spacing.lg }}><Banner tone="danger" icon="alert-circle" title="We couldn’t sign you in" message={error} /></View> : null}
        <View style={styles.form}>
          <Input label="EMAIL" value={email} onChangeText={(value) => { setEmail(value); setFieldErrors((current) => ({ ...current, email: undefined })); }} autoCapitalize="none" keyboardType="email-address" autoComplete="email" error={fieldErrors.email} />
          <Input label="PASSWORD" value={password} onChangeText={(value) => { setPassword(value); setFieldErrors((current) => ({ ...current, password: undefined })); }} secureTextEntry autoComplete={signUp ? 'new-password' : 'password'} error={fieldErrors.password} hint={signUp ? 'At least 8 characters' : undefined} />
          <Button label={loading ? 'Please wait…' : signUp ? 'Create account' : 'Sign in'} onPress={submit} icon="arrow-right" loading={loading} fullWidth />
        </View>
        <Button label={signUp ? 'I already have an account' : 'Create an account instead'} onPress={() => { setSignUp(!signUp); setError(''); setInfo(''); }} variant="ghost" fullWidth />
        <Text style={[type.caption, { textAlign: 'center', marginTop: spacing.md }]}>Your purchase data stays yours. ProofPilot never sells or shares it.</Text>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'center', padding: spacing.lg, backgroundColor: colors.canvas },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, alignSelf: 'center', marginBottom: spacing.xl, width: '100%', maxWidth: 460 },
  logo: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand },
  brandName: { fontSize: 18, fontWeight: '800', letterSpacing: -0.6, color: colors.ink },
  brandTag: { fontSize: 8.5, fontWeight: '800', letterSpacing: 1.1, color: colors.subtle, marginTop: 2 },
  card: { width: '100%', maxWidth: 460, alignSelf: 'center', padding: spacing.xxl, ...shadows.raised },
  form: { gap: spacing.md, marginVertical: spacing.xl },
});
