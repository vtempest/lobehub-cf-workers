'use server';

/**
 * Team management server actions, called directly from the settings UI.
 *
 * Each action re-derives the caller from the session rather than trusting an id
 * from the client, and every write is scoped by a membership check first: an
 * action that takes a `teamId` is only as safe as the check in front of it.
 */
import { and, eq, like, or } from 'drizzle-orm';

import { requireSession } from '../auth/session';
import { getDb } from '../db';
import {
  organizationMembers,
  organizations,
  teamMembers,
  teams,
  userInvitations,
  users,
} from '../db/schema';
import { sendTeamInvitationEmail } from '../email/send-invitation';

export interface TeamMemberSummary {
  id: string;
  role: string;
  user: { id: string; name: string; email: string; image: string | null };
}

export interface TeamSummary {
  id: string;
  name: string;
  description: string | null;
  upgradeMembers: boolean;
  maxMembers: number;
  members: TeamMemberSummary[];
}

type ActionResult<T = unknown> = ({ success: true } & T) | { success: false; error: string };

/** How long an invitation stays valid. */
const INVITATION_TTL_DAYS = 14;

/** Whether the caller may administer this team. */
async function isTeamLead(userId: string, teamId: string): Promise<boolean> {
  const [membership] = await getDb()
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
    .limit(1);
  return membership?.role === 'lead';
}

/**
 * The caller's personal organization, created on first use.
 *
 * Teams hang off an organization, and this app never asks a user to create one,
 * so the first team quietly creates the org that owns it.
 */
async function ensureOrganization(userId: string, userName: string): Promise<string> {
  const db = getDb();

  const [existing] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.ownerId, userId))
    .limit(1);
  if (existing) return existing.id;

  const now = new Date();
  const organizationId = crypto.randomUUID();

  await db.insert(organizations).values({
    createdAt: now,
    description: null,
    id: organizationId,
    image: null,
    name: `${userName}'s workspace`,
    ownerId: userId,
    updatedAt: now,
  });
  await db.insert(organizationMembers).values({
    id: crypto.randomUUID(),
    joinedAt: now,
    organizationId,
    role: 'owner',
    userId,
  });

  return organizationId;
}

export async function getUserTeams(): Promise<TeamSummary[]> {
  const session = await requireSession();
  const db = getDb();

  const rows = await db
    .select({
      description: teams.description,
      id: teams.id,
      maxMembers: teams.maxMembers,
      name: teams.name,
      upgradeMembers: teams.upgradeMembers,
    })
    .from(teams)
    .innerJoin(teamMembers, eq(teamMembers.teamId, teams.id))
    .where(eq(teamMembers.userId, session.user.id));

  return Promise.all(
    rows.map(async (team) => {
      const members = await db
        .select({
          email: users.email,
          id: teamMembers.id,
          image: users.image,
          name: users.name,
          role: teamMembers.role,
          userId: users.id,
        })
        .from(teamMembers)
        .innerJoin(users, eq(teamMembers.userId, users.id))
        .where(eq(teamMembers.teamId, team.id));

      return {
        description: team.description,
        id: team.id,
        maxMembers: team.maxMembers ?? 8,
        members: members.map((member) => ({
          id: member.id,
          role: member.role,
          user: { email: member.email, id: member.userId, image: member.image, name: member.name },
        })),
        name: team.name,
        upgradeMembers: team.upgradeMembers ?? false,
      };
    }),
  );
}

export async function createTeam(
  name: string,
  description: string,
  upgradeMembers: boolean,
): Promise<ActionResult<{ teamId: string }>> {
  const session = await requireSession();
  if (!name.trim()) return { error: 'A team needs a name.', success: false };

  const db = getDb();
  const organizationId = await ensureOrganization(session.user.id, session.user.name);
  const now = new Date();
  const teamId = crypto.randomUUID();

  await db.insert(teams).values({
    createdAt: now,
    description: description.trim() || null,
    id: teamId,
    maxMembers: 8,
    name: name.trim(),
    organizationId,
    updatedAt: now,
    upgradeMembers,
  });

  // The creator is the team's first lead, so the team is never left
  // unadministered.
  await db.insert(teamMembers).values({
    id: crypto.randomUUID(),
    joinedAt: now,
    role: 'lead',
    teamId,
    userId: session.user.id,
  });

  return { success: true, teamId };
}

export async function updateTeam(
  teamId: string,
  name: string,
  description: string,
  upgradeMembers: boolean,
): Promise<ActionResult> {
  const session = await requireSession();
  if (!(await isTeamLead(session.user.id, teamId))) {
    return { error: 'Only a team lead can change the team.', success: false };
  }
  if (!name.trim()) return { error: 'A team needs a name.', success: false };

  await getDb()
    .update(teams)
    .set({
      description: description.trim() || null,
      name: name.trim(),
      updatedAt: new Date(),
      upgradeMembers,
    })
    .where(eq(teams.id, teamId));

  return { success: true };
}

export async function deleteTeam(teamId: string): Promise<ActionResult> {
  const session = await requireSession();
  if (!(await isTeamLead(session.user.id, teamId))) {
    return { error: 'Only a team lead can delete the team.', success: false };
  }

  // Memberships and invitations go with it through `on delete cascade`.
  await getDb().delete(teams).where(eq(teams.id, teamId));
  return { success: true };
}

/**
 * Add a member, or invite them if they have no account yet.
 *
 * `invited` in the result tells the UI which of the two happened, and
 * `emailDelivered` whether the invitation actually went out — a deployment
 * without Email Routing still records the invitation.
 */
export async function inviteMemberToTeam(
  teamId: string,
  email: string,
): Promise<ActionResult<{ invited: boolean; emailDelivered?: boolean }>> {
  const session = await requireSession();
  if (!(await isTeamLead(session.user.id, teamId))) {
    return { error: 'Only a team lead can invite members.', success: false };
  }

  const db = getDb();
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!team) return { error: 'Team not found.', success: false };

  const current = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(eq(teamMembers.teamId, teamId));
  if (current.length >= (team.maxMembers ?? 8)) {
    return { error: `This team is limited to ${team.maxMembers ?? 8} members.`, success: false };
  }

  const normalized = email.trim().toLowerCase();
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1);

  if (existingUser) {
    const [already] = await db
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, existingUser.id)))
      .limit(1);
    if (already) return { error: 'They are already on this team.', success: false };

    await db.insert(teamMembers).values({
      id: crypto.randomUUID(),
      joinedAt: new Date(),
      role: 'member',
      teamId,
      userId: existingUser.id,
    });
    return { invited: false, success: true };
  }

  const now = new Date();
  const invitationId = crypto.randomUUID();
  await db.insert(userInvitations).values({
    createdAt: now,
    email: normalized,
    expiresAt: new Date(now.getTime() + INVITATION_TTL_DAYS * 86_400_000),
    id: invitationId,
    inviterId: session.user.id,
    organizationId: team.organizationId,
    status: 'pending',
    teamId,
  });

  const delivery = await sendTeamInvitationEmail(
    normalized,
    team.name,
    session.user.name,
    invitationId,
  );

  return { emailDelivered: delivery.delivered, invited: true, success: true };
}

export async function removeMemberFromTeam(
  teamId: string,
  userId: string,
): Promise<ActionResult> {
  const session = await requireSession();
  if (!(await isTeamLead(session.user.id, teamId))) {
    return { error: 'Only a team lead can remove members.', success: false };
  }

  const leads = await getDb()
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.role, 'lead')));

  // Removing the last lead would leave the team with no one able to administer
  // it — and no way back, since only a lead can add one.
  if (leads.length === 1 && leads[0].userId === userId) {
    return { error: 'A team must keep at least one lead.', success: false };
  }

  await getDb()
    .delete(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));

  return { success: true };
}

/**
 * Autocomplete for the invite field. Signed-in only, capped, and matching on
 * name or e-mail prefix — enough to pick a colleague, not enough to enumerate
 * the user table.
 */
export async function searchUsers(
  query: string,
): Promise<{ id: string; name: string; email: string }[]> {
  await requireSession();

  const term = query.trim();
  if (term.length < 2) return [];

  return getDb()
    .select({ email: users.email, id: users.id, name: users.name })
    .from(users)
    .where(or(like(users.email, `${term}%`), like(users.name, `${term}%`)))
    .limit(8);
}
