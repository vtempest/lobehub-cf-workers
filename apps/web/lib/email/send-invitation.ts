import { BASE_URL } from '../constants';
import { sendEmail, type SendResult } from './send';
import { teamInvitationEmail } from './templates';

/**
 * Mail a team invitation.
 *
 * Returns the delivery outcome rather than throwing: the invitation row is
 * already written by the time this runs, so a deployment without Email Routing
 * should still report the invitation as created — the caller tells the user
 * whether the mail actually went out.
 */
export async function sendTeamInvitationEmail(
  email: string,
  teamName: string,
  inviterName: string,
  invitationId: string,
): Promise<SendResult> {
  const url = `${BASE_URL}/invitations/${invitationId}`;
  const body = teamInvitationEmail({ inviterName, teamName, url });

  return sendEmail({ ...body, to: email });
}
