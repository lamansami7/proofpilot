import { contextFor, claimTemplate } from '../services/ai/purchaseContext';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from './Feather';
import {
  createAIService,
  type AIService,
  type ClaimType,
} from '../services/ai/AIService';
import { colors, radius, spacing, type } from '../design/tokens';
import { formatDate, formatMoney, isoDate } from '../lib/purchaseSelectors';
import type { Purchase, PurchaseDocument } from '../types/purchase';
import { Badge, Banner, Button, Card, Input } from './ui';

const MAX_CLAIM_ISSUE_LENGTH = 2000;

function factsFor(
  p: Purchase,
  claimType: ClaimType,
): Array<[string, string]> {
  return [
    ['Product', p.name],
    ['Merchant', p.merchant],
    ['Purchase date', formatDate(p.purchaseDate)],
    ['Price', formatMoney(p.price)],
    [
      claimType === 'return'
        ? 'Return deadline'
        : 'Warranty expiration',
      formatDate(
        claimType === 'return'
          ? p.returnDeadline
          : p.warrantyEnd,
      ),
    ],
    ...(claimType === 'warranty' && p.warrantyProvider
      ? [['Warranty provider', p.warrantyProvider] as [string, string]]
      : []),
    ...(p.serial
      ? [['Serial number', p.serial] as [string, string]]
      : []),
    [
      'Documents',
      p.documents.length
        ? `${p.documents.length} saved`
        : 'None saved',
    ],
  ];
}

function missingFor(
  p: Purchase,
  claimType: ClaimType,
): string[] {
  return [
    claimType === 'return' && !p.returnDeadline
      ? 'return deadline or the merchant’s return policy'
      : '',

    claimType === 'warranty' && !p.warrantyEnd
      ? 'warranty expiration or terms'
      : '',

    claimType === 'warranty' && !p.warrantyProvider
      ? 'warranty provider'
      : '',

    !p.documents.some((d) => d.kind === 'receipt')
      ? 'receipt or proof of purchase'
      : '',

    claimType === 'warranty' && !p.serial
      ? 'serial number, if the provider requires it'
      : '',
  ].filter(Boolean);
}

export function ClaimGenerator({
  purchase,
  onSaveDraft,
  assistant = createAIService(),
}: {
  purchase: Purchase;
  onSaveDraft?: (
    document: PurchaseDocument,
  ) => Promise<void>;
  assistant?: AIService;
}) {
  const [claimType, setClaimType] =
    useState<ClaimType>('return');

  const [issue, setIssue] = useState('');
  const [draft, setDraft] = useState('');

  const [status, setStatus] = useState<
    'idle' | 'loading' | 'unavailable' | 'error' | 'ready'
  >('idle');

  const [extraMissing, setExtraMissing] =
    useState<string[]>([]);

  const [vaultState, setVaultState] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle');

  const [source, setSource] =
    useState<'AI' | 'Template'>('Template');

  const [copied, setCopied] = useState(false);

  const [actionError, setActionError] =
    useState<string | null>(null);

  const revision = useRef(0);
  const generating = useRef(false);
  const saving = useRef(false);
  const mounted = useRef(true);

  const copyTimer =
    useRef<ReturnType<typeof setTimeout> | undefined>(
      undefined,
    );

  useEffect(() => {
    mounted.current = true;

    revision.current++;
    generating.current = false;

    setDraft('');
    setIssue('');
    setClaimType('return');
    setStatus('idle');
    setExtraMissing([]);
    setVaultState('idle');
    setCopied(false);
    setActionError(null);

    return () => {
      mounted.current = false;
      revision.current++;

      if (copyTimer.current) {
        clearTimeout(copyTimer.current);
      }
    };
  }, [purchase.id]);

  const invalidate = () => {
    revision.current++;
    generating.current = false;

    setVaultState(
      saving.current ? 'saving' : 'idle',
    );

    setCopied(false);
    setActionError(null);

    if (copyTimer.current) {
      clearTimeout(copyTimer.current);
    }
  };

  const facts = useMemo(
    () => factsFor(purchase, claimType),
    [purchase, claimType],
  );

  const missing = useMemo(
    () =>
      [
        ...new Set([
          ...missingFor(purchase, claimType),
          ...extraMissing,
        ]),
      ],
    [purchase, claimType, extraMissing],
  );

  const select = (next: ClaimType) => {
    if (next === claimType) {
      return;
    }

    invalidate();

    setClaimType(next);
    setDraft('');
    setExtraMissing([]);
    setStatus('idle');
  };

  const generate = async () => {
    if (generating.current) {
      return;
    }

    if (issue.length > MAX_CLAIM_ISSUE_LENGTH) {
      setActionError(
        `Please keep the issue under ${MAX_CLAIM_ISSUE_LENGTH} characters.`,
      );
      return;
    }

    invalidate();

    generating.current = true;

    const owner = revision.current;

    setStatus('loading');

    try {
      const result =
        await assistant.generateClaim(
          contextFor(purchase),
          claimType,
          issue.trim() || undefined,
        );

      if (
        !mounted.current ||
        owner !== revision.current
      ) {
        return;
      }

      setDraft(result.draft);
      setSource('AI');
      setExtraMissing(
        result.missingInformation,
      );
      setStatus('ready');
    } catch (error) {
      if (
        !mounted.current ||
        owner !== revision.current
      ) {
        return;
      }

      if (draft) {
        setStatus('ready');

        setActionError(
          'The draft could not be regenerated. Your existing text has been kept.',
        );
      } else {
        const unavailable =
          error instanceof Error &&
          (error as { code?: string }).code ===
            'unavailable';

        setStatus(
          unavailable
            ? 'unavailable'
            : 'error',
        );
      }
    } finally {
      if (owner === revision.current) {
        generating.current = false;
      }
    }
  };

  const createTemplate = () => {
    invalidate();

    setDraft(
      claimTemplate(
        purchase,
        claimType,
        issue,
      ),
    );

    setExtraMissing([]);
    setSource('Template');
    setStatus('ready');
  };

  const transfer = async (
    text: string,
    clipboard: boolean,
  ) => {
    const owner = revision.current;

    setActionError(null);

    try {
      if (
        clipboard &&
        Platform.OS === 'web'
      ) {
        if (
          !navigator.clipboard ||
          !navigator.clipboard.writeText
        ) {
          throw new Error(
            'Clipboard unavailable',
          );
        }

        await navigator.clipboard.writeText(
          text,
        );

        if (
          mounted.current &&
          owner === revision.current
        ) {
          setCopied(true);

          if (copyTimer.current) {
            clearTimeout(copyTimer.current);
          }

          copyTimer.current =
            setTimeout(() => {
              if (
                mounted.current &&
                owner === revision.current
              ) {
                setCopied(false);
              }
            }, 2200);
        }
      } else {
        await Share.share({
          title: `${purchase.name} claim draft`,
          message: text,
        });
      }
    } catch {
      if (
        mounted.current &&
        owner === revision.current
      ) {
        setActionError(
          'Copy or sharing is unavailable. Select the text manually, or save the draft to Vault and export your records.',
        );
      }
    }
  };

  const copy = () => {
    if (!draft.trim()) {
      return;
    }

    transfer(draft, true);
  };

  const share = () => {
    if (!draft.trim()) {
      return;
    }

    transfer(draft, false);
  };

  const copyFacts = () => {
    const text = facts
      .map(
        ([label, value]) =>
          `${label}: ${value}`,
      )
      .join('\n');

    transfer(
      text,
      Platform.OS === 'web',
    );
  };

  const saveToVault = async () => {
    if (
      !onSaveDraft ||
      saving.current ||
      !draft.trim() ||
      vaultState === 'saved'
    ) {
      return;
    }

    saving.current = true;

    const owner = revision.current;

    setVaultState('saving');

    try {
      await onSaveDraft({
        id: `claim-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 6)}`,

        name: `${
          claimType === 'return'
            ? 'Return'
            : 'Warranty'
        } claim draft — ${
          purchase.name
        } (${isoDate(new Date())})`,

        kind: 'claim',
        mimeType: 'text/plain',
        content: draft,
        addedAt: isoDate(new Date()),
      });

      if (mounted.current) {
        setVaultState(
          owner === revision.current
            ? 'saved'
            : 'idle',
        );
      }
    } catch {
      if (mounted.current) {
        setVaultState(
          owner === revision.current
            ? 'error'
            : 'idle',
        );
      }
    } finally {
      saving.current = false;
    }
  };

  const issueLength = issue.length;

  return (
    <Card style={styles.card}>
      <Banner
        tone="info"
        icon="file-text"
        title="Drafts, never submissions"
        message="Saved facts are user-entered, not independently verified. Review every statement and policy before sending. No claim is submitted by ProofPilot."
      />

      <View style={styles.heading}>
        <View style={styles.icon}>
          <Feather
            name="file-text"
            size={18}
            color={colors.brandDark}
          />
        </View>

        <View style={styles.flex}>
          <Text style={type.heading}>
            Claim generator
          </Text>

          <Text style={type.bodySmall}>
            Drafts built only from your saved
            purchase facts.
          </Text>
        </View>
      </View>

      <ClaimStepper
        active={
          status === 'ready'
            ? 3
            : status === 'loading'
              ? 2
              : issue.trim()
                ? 1
                : 0
        }
      />

      <View style={styles.tabs}>
        {(
          ['return', 'warranty'] as ClaimType[]
        ).map((item) => {
          const selected =
            item === claimType;

          return (
            <Pressable
              key={item}
              accessibilityRole="button"
              accessibilityLabel={
                item === 'return'
                  ? 'Return claim'
                  : 'Warranty claim'
              }
              accessibilityState={{
                selected,
              }}
              // react-native-web 0.19 no longer maps accessibilityState to ARIA,
              // so the toggle state must be exposed explicitly or assistive
              // technology cannot tell which claim type is active.
              aria-pressed={selected}
              accessibilityHint={
                selected
                  ? 'Selected'
                  : `Switch to ${
                      item === 'return'
                        ? 'return'
                        : 'warranty'
                    } claim`
              }
              onPress={() =>
                select(item)
              }
              style={[
                styles.tab,
                selected &&
                  styles.tabActive,
              ]}
            >
              <Text
                style={
                  selected
                    ? styles.tabActiveText
                    : type.label
                }
              >
                {item === 'return'
                  ? 'Return claim'
                  : 'Warranty claim'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.eyebrow}>
        SAVED PURCHASE FACTS
      </Text>

      <View style={styles.factGrid}>
        {facts.map(
          ([label, value]) => (
            <View
              key={label}
              style={styles.fact}
            >
              <Text
                style={styles.factLabel}
              >
                {label.toUpperCase()}
              </Text>

              <Text style={type.bodySmall}>
                {value}
              </Text>
            </View>
          ),
        )}
      </View>

      {missing.length ? (
        <View style={styles.missing}>
          <Feather
            name="info"
            size={16}
            color={colors.warning}
            style={{
              marginTop: 1,
            }}
          />

          <View style={styles.flex}>
            <Text style={type.label}>
              Missing information
            </Text>

            <Text style={type.bodySmall}>
              Check these before sending:{' '}
              {missing.join(' · ')}
            </Text>
          </View>
        </View>
      ) : (
        <Banner
          tone="success"
          icon="check-circle"
          title="Core purchase fields are saved"
          message="The merchant or provider may still require more information."
        />
      )}

      {actionError ? (
        <Text
          accessibilityRole="alert"
          style={{
            color: colors.danger,
            marginTop: spacing.md,
          }}
        >
          {actionError}
        </Text>
      ) : null}

      {status === 'ready' ? (
        <View style={styles.draftBlock}>
          <Badge
            label={`${
              source === 'AI'
                ? 'AI-GENERATED'
                : 'TEMPLATE'
            } DRAFT — REVIEW BEFORE SENDING`}
            tone="warning"
            icon="alert-triangle"
          />

          <Text style={type.caption}>
            {source === 'AI'
              ? 'AI-generated draft · may contain errors · verify every claim against your documents'
              : 'Deterministic template · built only from the saved facts above'}
          </Text>

          <TextInput
            accessibilityLabel="Editable claim draft"
            value={draft}
            onChangeText={(value) => {
              invalidate();
              setDraft(value);
            }}
            multiline
            textAlignVertical="top"
            style={styles.editor}
          />

          {vaultState === 'error' ? (
            <Text
              accessibilityRole="alert"
              style={{
                color: colors.danger,
              }}
            >
              Draft could not be saved. Your
              text is still here; retry.
            </Text>
          ) : null}

          {vaultState === 'saved' ? (
            <Text
              accessibilityLiveRegion="polite"
              style={{
                color: colors.success,
              }}
            >
              Draft saved to Vault.
            </Text>
          ) : null}

          <View style={styles.actions}>
            {Platform.OS === 'web' ? (
              <Button
                size="sm"
                label={
                  copied
                    ? 'Copied'
                    : 'Copy draft'
                }
                icon={
                  copied
                    ? 'check'
                    : 'copy'
                }
                variant="secondary"
                onPress={copy}
                disabled={!draft.trim()}
              />
            ) : null}

            <Button
              size="sm"
              label="Share / export"
              icon="share"
              variant="secondary"
              onPress={share}
              disabled={!draft.trim()}
            />

            {onSaveDraft ? (
              <Button
                size="sm"
                label="Save to Vault"
                loading={
                  vaultState === 'saving'
                }
                disabled={
                  vaultState === 'saved' ||
                  !draft.trim()
                }
                icon="archive"
                variant="secondary"
                onPress={saveToVault}
              />
            ) : null}

            <Button
              size="sm"
              label="Start over"
              icon="edit-2"
              variant="ghost"
              onPress={() => {
                invalidate();
                setDraft('');
                setStatus('idle');
                setExtraMissing([]);
              }}
            />

            <Button
  size="sm"
  label="Regenerate"
  icon="refresh-cw"
  variant="ghost"
  onPress={generate}
  disabled={!assistant.isConfigured}
/>
          </View>

          <Text style={type.caption}>
            ProofPilot never sends this claim for
            you — review, edit, and send it
            yourself.
          </Text>
        </View>
      ) : (
        <View
          style={{
            marginTop: spacing.lg,
          }}
        >
          <Input
            label="WHAT WENT WRONG? (OPTIONAL)"
            value={issue}
            onChangeText={(value) => {
              if (
                value.length >
                MAX_CLAIM_ISSUE_LENGTH
              ) {
                return;
              }

              invalidate();
              setIssue(value);
              setStatus('idle');
            }}
            placeholder="e.g. The monitor flickers after 20 minutes of use"
            multiline
            containerStyle={
              styles.issueContainer
            }
          />

          <View style={styles.characterRow}>
            <Text style={type.caption}>
              Describe the problem accurately.
            </Text>

            <Text
              style={[
                type.caption,
                issueLength >=
                  MAX_CLAIM_ISSUE_LENGTH &&
                  styles.limitText,
              ]}
            >
              {issueLength}/
              {MAX_CLAIM_ISSUE_LENGTH}
            </Text>
          </View>

          <Button
            variant="secondary"
            icon="file-text"
            label="Create from saved facts (no AI)"
            onPress={createTemplate}
            fullWidth
          />

          {assistant.isConfigured ? (
            status === 'loading' ? (
              <View
                accessibilityLiveRegion="polite"
                style={styles.status}
              >
                <ActivityIndicator
                  size="small"
                  color={colors.brandDark}
                />

                <Text style={type.bodySmall}>
                  Creating a draft using only the
                  saved facts above…
                </Text>
              </View>
            ) : (
              <View
                style={{
                  marginTop: spacing.sm,
                }}
              >
                <Button
                  label={`Generate ${claimType} claim draft with AI`}
                  icon="file-text"
                  onPress={generate}
                  fullWidth
                  disabled={
                    issue.length >
                    MAX_CLAIM_ISSUE_LENGTH
                  }
                />
              </View>
            )
          ) : (
            <View
              style={{
                marginTop: spacing.md,
              }}
            >
              <Banner
                tone="info"
                icon="lock"
                title="AI generation is not connected"
                message="Use the saved-facts template above, or copy these fields into your own message. Templates do not require AI."
              />

              <Button
                label={
                  copied
                    ? 'Facts copied'
                    : Platform.OS === 'web'
                      ? 'Copy saved facts'
                      : 'Share saved facts'
                }
                icon={
                  copied
                    ? 'check'
                    : 'copy'
                }
                variant="secondary"
                onPress={copyFacts}
                style={{
                  marginTop: spacing.md,
                }}
                fullWidth
              />
            </View>
          )}

          {status === 'unavailable' ? (
            <View
              style={{
                marginTop: spacing.md,
              }}
            >
              <Banner
                tone="info"
                icon="lock"
                title="The secure AI service is temporarily unavailable"
                message="Try again shortly, or use the saved-facts template instead. Your purchase data has not changed."
              />
            </View>
          ) : null}

          {status === 'error' ? (
            <View
              style={{
                marginTop: spacing.md,
              }}
            >
              <Banner
                tone="danger"
                icon="alert-circle"
                title="ProofPilot could not create a draft right now"
                message="Your purchase data has not changed. Try again, or use the saved-facts template."
              />
            </View>
          ) : null}
        </View>
      )}
    </Card>
  );
}

const claimSteps = [
  'Verify facts',
  'Add issue',
  'Draft',
  'Review & export',
];

function ClaimStepper({
  active,
}: {
  active: number;
}) {
  return (
    <View
      accessibilityLabel={`Step ${
        active + 1
      } of ${claimSteps.length}: ${
        claimSteps[active]
      }`}
      style={styles.stepper}
    >
      {claimSteps.map(
        (label, index) => (
          <React.Fragment key={label}>
            <View
              style={[
                styles.step,
                index <= active &&
                  styles.stepActive,
              ]}
            >
              <Text
                style={[
                  styles.stepText,
                  index <= active &&
                    styles.stepTextActive,
                ]}
                numberOfLines={1}
              >
                {index + 1}. {label}
              </Text>
            </View>

            {index <
            claimSteps.length - 1 ? (
              <Feather
                name="chevron-right"
                size={12}
                color={colors.subtle}
              />
            ) : null}
          </React.Fragment>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    marginTop: spacing.sm,
  },

  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },

  flex: {
    flex: 1,
  },

  icon: {
    height: 38,
    width: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor:
      colors.brandMuted,
  },

  tabs: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    marginTop: spacing.lg,
    borderRadius: radius.md,
    backgroundColor:
      colors.surfaceMuted,
  },

  tab: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },

  tabActive: {
    backgroundColor: colors.surface,
    ...({
      shadowColor: '#1C2A3A',
      shadowOpacity: 0.06,
      shadowRadius: 6,
      shadowOffset: {
        width: 0,
        height: 2,
      },
    } as object),
  },

  tabActiveText: {
    ...type.label,
    color: colors.brandDark,
  },

  eyebrow: {
    ...type.eyebrow,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },

  factGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
  },

  fact: {
    flexGrow: 1,
    flexBasis: 170,
    padding: spacing.sm + 2,
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },

  factLabel: {
    ...type.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 3,
  },

  missing: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    marginTop: spacing.md,
    borderRadius: radius.md,
    backgroundColor:
      colors.warningSurface,
  },

  status: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },

  draftBlock: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },

  editor: {
    minHeight: 210,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 14,
    lineHeight: 21,
  },

  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },

  issueContainer: {
    marginBottom: spacing.xs,
  },

  characterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },

  limitText: {
    color: colors.danger,
  },

  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.md,
    flexWrap: 'wrap',
  },

  step: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor:
      colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },

  stepActive: {
    backgroundColor:
      colors.brandMuted,
    borderColor: colors.brand,
  },

  stepText: {
    ...type.caption,
    fontSize: 10.5,
    fontWeight: '700',
  },

  stepTextActive: {
    color: colors.ink,
    fontWeight: '800',
  },
});
