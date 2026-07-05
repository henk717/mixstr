import { useMutation } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';

export const REPORT_TYPES = [
  'spam',
  'impersonation',
  'illegal',
  'profanity',
  'nudity',
  'malware',
  'other',
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

/**
 * Publishes a NIP-56 report (kind 1984) for a profile.
 */
export function useReportUser() {
  const { user } = useCurrentUser();
  const { mutateAsync: publish } = useNostrPublish();

  return useMutation({
    mutationFn: async ({
      pubkey,
      type,
      reason,
    }: {
      pubkey: string;
      type: ReportType;
      reason?: string;
    }) => {
      if (!user?.pubkey) throw new Error('Not logged in');

      await publish({
        kind: 1984,
        content: reason?.trim() ?? '',
        tags: [['p', pubkey, type]],
      });
    },
  });
}
