export type PartnerInviteErrorCode =
  | "invalid_email"
  | "cannot_invite_self"
  | "already_linked"
  | "email_not_configured"
  | "invite_failed"
  | "email_failed"
  | "unauthorized"
  | "invalid_or_expired_code"
  | "cannot_accept_own_invite"
  | "already_linked_partner"
  | "not_authenticated";

export function formatInviteCode(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase();
  if (normalized.length <= 4) return normalized;
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

export function mapPartnerInviteError(code: string | null | undefined): string {
  switch (code) {
    case "invalid_email":
      return "Enter a valid email address.";
    case "cannot_invite_self":
      return "You cannot invite your own account.";
    case "already_linked":
      return "This account already has an active partner.";
    case "email_not_configured":
      return "Email delivery is not configured for this project.";
    case "invite_failed":
      return "We could not create the invitation. Please try again.";
    case "email_failed":
      return "The invitation could not be emailed. Please try again.";
    case "unauthorized":
      return "Please sign in again and try the invitation.";
    case "invalid_or_expired_code":
      return "That invite code is invalid or has expired.";
    case "cannot_accept_own_invite":
      return "You cannot accept your own invitation.";
    case "already_linked_partner":
      return "This account is already linked to a partner.";
    case "not_authenticated":
      return "Please sign in before accepting a partner code.";
    default:
      return "We couldn’t create that invitation. Please try again.";
  }
}
