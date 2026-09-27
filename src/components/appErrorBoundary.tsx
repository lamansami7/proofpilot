import React from 'react';
import {Pressable, SafeAreaView, StyleSheet, Text, View} from 'react-native';
import {colors, spacing, type} from '../design/tokens';

/** A last-resort render fallback. Never clears caches or includes error details. */
export class AppErrorBoundary extends React.Component<{children: React.ReactNode}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() { return {failed: true}; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <SafeAreaView style={styles.page}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={type.title}>ProofPilot couldn’t display this screen</Text>
        <Text accessibilityRole="alert" style={type.body}>Your saved records have not been cleared. Retry to reopen the app. Unsaved form changes may be lost.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Retry opening ProofPilot" onPress={() => this.setState({failed: false})} style={styles.button}>
          <Text style={type.label}>Retry opening ProofPilot</Text>
        </Pressable>
        <Text style={type.bodySmall}>If this keeps happening, close and reopen the app. Do not clear browser or device storage to troubleshoot.</Text>
      </View>
    </SafeAreaView>;
  }
}
const styles=StyleSheet.create({
  page:{flex:1,backgroundColor:colors.canvas,justifyContent:'center',padding:spacing.xl},
  content:{width:'100%',maxWidth:520,alignSelf:'center',gap:spacing.lg},
  button:{minHeight:48,padding:spacing.md,borderRadius:12,backgroundColor:colors.brand,alignItems:'center'},
});
