import { supabase } from "./supabase";

export type CommunitySort = "recent" | "helpful";
export type CommunityReactionType = "me_too" | "sending_support" | "helpful";
export type CommunityReportReason = "harassment" | "personal_information" | "dangerous_medical_advice" | "spam" | "inappropriate" | "other";

export type CommunityConfig = {
  minimum_age: number;
  guidelines_version: string;
  title_limit: number;
  post_limit: number;
  comment_limit: number;
  edit_window_minutes: number;
  helpful_window_days: number;
  posts_per_hour: number;
  posts_per_day: number;
  comments_per_hour: number;
  reports_per_hour: number;
  display_name_cooldown_days: number;
};

export type CommunityCircle = { slug: string; name: string; description: string };
export type CommunityProfile = { public_id: string; display_name: string; avatar_color: string };
export type CommunityPost = {
  id: string;
  circle_slug: string;
  author: CommunityProfile;
  title: string | null;
  body: string;
  topic_tag: string | null;
  status: "visible" | "hidden" | "removed";
  reaction_counts: Record<CommunityReactionType, number>;
  comments_count: number;
  helpful_count: number;
  created_at: string;
};
export type CommunityComment = {
  id: string;
  post_id: string;
  parent_id: string | null;
  author_public_id: string;
  author: CommunityProfile;
  body: string;
  status: "visible" | "hidden" | "removed";
  created_at: string;
};
export type CommunityCursor = { createdAt: string; helpfulCount?: number; id: string };
export type CommunityUserState = {
  profile: CommunityProfile | null;
  age_confirmed: boolean;
  guidelines_accepted: boolean;
  is_moderator: boolean;
  circles: string[];
};

export type CommunityModerationItem = {
  id: string;
  target_kind: "post" | "comment";
  target_id: string;
  reason: CommunityReportReason;
  detail: string | null;
  status: "open" | "resolved" | "dismissed";
  created_at: string;
  author: CommunityProfile;
  target_body: string;
  target_title: string | null;
  circle_slug: string;
};

const CIRCLES: CommunityCircle[] = [
  { slug: "endo-chronic-pain", name: "Endometriosis and Chronic Pain", description: "Share lived experience and support around chronic pelvic pain." },
  { slug: "irregular-cycles-pcos", name: "Irregular Cycles and PCOS", description: "A respectful space for experiences with irregular cycles and PCOS." },
  { slug: "painful-periods", name: "Painful Periods", description: "Talk about painful periods and the ways they affect everyday life." },
  { slug: "partners-supporters", name: "Partners and Supporters", description: "A space for supporters to learn from shared experiences." },
  { slug: "general-chat", name: "General Chat", description: "Everyday conversation and encouragement across the community." },
];

export const COMMUNITY_GUIDELINES = [
  "Be respectful and kind.",
  "Do not diagnose others; personal experience is not universal medical fact.",
  "Do not give medication or dosage instructions.",
  "No selling, solicitation, or contact details.",
  "Respect privacy and consent. Report concerns instead of escalating.",
];

const ERROR_MESSAGES: Array<[RegExp, string]> = [
  [/community_requirements_missing|age_confirmation_required|guideline_acknowledgement_required/i, "Confirm the community requirements before participating."],
  [/circle_membership_required/i, "Join this circle before posting or reacting."],
  [/rate_limited/i, "You’ve reached a community activity limit. Please try again later."],
  [/edit_window_expired/i, "The edit window for this content has ended."],
  [/contact_details_not_allowed/i, "Posts and comments cannot include contact information or links."],
  [/moderator_required/i, "You don’t have permission to use that moderation action."],
  [/duplicate key|23505/i, "That action was already recorded."],
  [/JWT|token|auth/i, "Your sign-in may have expired. Sign in again and retry."],
];

function safeError(error: unknown): Error {
  const message = error instanceof Error ? error.message : "Community is temporarily unavailable. Please try again.";
  const matching = ERROR_MESSAGES.find(([pattern]) => pattern.test(message));
  return new Error(matching?.[1] ?? "Community is temporarily unavailable. Please try again.");
}

function requireSupabase() {
  if (!supabase) throw new Error("Community is unavailable until secure sign-in is configured.");
  return supabase;
}

export async function loadCommunityConfig(): Promise<CommunityConfig> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("community_public_config");
  if (error || !data) throw safeError(error);
  return data as CommunityConfig;
}

export async function loadCommunityCircles(): Promise<CommunityCircle[]> {
  const client = requireSupabase();
  const { data, error } = await client.from("community_circles").select("slug,name,description").order("name");
  if (!error && data) return data as CommunityCircle[];
  return CIRCLES;
}

export async function loadMyCommunityState(): Promise<CommunityUserState> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("community_my_state");
  if (error || !data) throw safeError(error);
  return data as CommunityUserState;
}

export async function ensureCommunityProfile(): Promise<CommunityProfile> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("community_ensure_profile");
  if (error || !Array.isArray(data) || !data[0]) throw safeError(error);
  return data[0] as CommunityProfile;
}

export async function confirmCommunityAdult(): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("community_confirm_adult", { p_confirms_adult: true });
  if (error) throw safeError(error);
}

export async function acceptCommunityGuidelines(): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("community_accept_guidelines", { p_accepts: true, p_version: "v1" });
  if (error) throw safeError(error);
}

export async function joinCommunityCircle(slug: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("community_memberships").insert({ circle_slug: slug });
  if (error && error.code !== "23505") throw safeError(error);
}

export async function leaveCommunityCircle(slug: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("community_memberships").delete().eq("circle_slug", slug);
  if (error) throw safeError(error);
}

export async function loadCommunityFeed(options: {
  circleSlug?: string;
  myCircles: boolean;
  sort: CommunitySort;
  cursor?: CommunityCursor;
  limit?: number;
}): Promise<CommunityPost[]> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("community_feed_page", {
    p_circle_slug: options.circleSlug ?? null,
    p_my_circles: options.myCircles,
    p_sort: options.sort,
    p_before_created_at: options.cursor?.createdAt ?? null,
    p_before_helpful_count: options.cursor?.helpfulCount ?? null,
    p_before_id: options.cursor?.id ?? null,
    p_limit: options.limit ?? 20,
  });
  if (error) throw safeError(error);
  return (data ?? []) as CommunityPost[];
}

export async function createCommunityPost(input: { circleSlug: string; title?: string; body: string; topicTag?: string }): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("community_posts").insert({
    circle_slug: input.circleSlug,
    title: input.title?.trim() || null,
    body: input.body.trim(),
    topic_tag: input.topicTag?.trim() || null,
  });
  if (error) throw safeError(error);
}

export async function updateCommunityPost(id: string, input: { title?: string; body: string; topicTag?: string }): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("community_posts").update({
    title: input.title?.trim() || null,
    body: input.body.trim(),
    topic_tag: input.topicTag?.trim() || null,
  }).eq("id", id);
  if (error) throw safeError(error);
}

export async function removeCommunityPost(id: string): Promise<void> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("community_remove_own_post", { p_post_id: id });
  if (error || data !== true) throw safeError(error ?? new Error("post_not_found"));
}

export async function loadCommunityComments(postId: string): Promise<CommunityComment[]> {
  const client = requireSupabase();
  const { data, error } = await client.from("community_comments")
    .select("id,post_id,parent_id,author_public_id,body,status,created_at,author:community_profiles!community_comments_author_public_id_fkey(public_id,display_name,avatar_color)")
    .eq("post_id", postId).order("created_at").order("id");
  if (error) throw safeError(error);
  return (data ?? []).map((row) => ({ ...row, author: Array.isArray(row.author) ? row.author[0] : row.author })) as CommunityComment[];
}

export async function addCommunityComment(postId: string, body: string, parentId?: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("community_comments").insert({ post_id: postId, parent_id: parentId ?? null, body: body.trim() });
  if (error) throw safeError(error);
}

export async function removeCommunityComment(id: string): Promise<void> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("community_remove_own_comment", { p_comment_id: id });
  if (error || data !== true) throw safeError(error ?? new Error("comment_not_found"));
}

export async function setCommunityReaction(postId: string, reaction: CommunityReactionType, active: boolean): Promise<CommunityPost["reaction_counts"]> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("community_set_reaction", { p_post_id: postId, p_reaction_type: reaction, p_active: active });
  if (error || !data?.reaction_counts) throw safeError(error);
  return data.reaction_counts as CommunityPost["reaction_counts"];
}

export async function loadSavedCommunityPostIds(): Promise<string[]> {
  const client = requireSupabase();
  const { data, error } = await client.from("community_saved_posts").select("post_id").order("created_at", { ascending: false });
  if (error) throw safeError(error);
  return (data ?? []).map((row) => row.post_id as string);
}

export async function toggleCommunitySavedPost(postId: string, saved: boolean): Promise<void> {
  const client = requireSupabase();
  const result = saved
    ? await client.from("community_saved_posts").delete().eq("post_id", postId)
    : await client.from("community_saved_posts").insert({ post_id: postId });
  if (result.error) throw safeError(result.error);
}

export async function reportCommunityItem(input: { targetKind: "post" | "comment"; targetId: string; reason: CommunityReportReason; detail?: string }): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("community_reports").insert({
    target_kind: input.targetKind,
    target_id: input.targetId,
    reason: input.reason,
    detail: input.detail?.trim() || null,
  });
  if (error) throw safeError(error);
}

export async function setCommunityRelationship(targetPublicId: string, relationship: "block" | "mute", active: boolean): Promise<void> {
  const client = requireSupabase();
  const table = relationship === "block" ? "community_blocks" : "community_mutes";
  const result = active
    ? await client.from(table).delete().eq("target_public_id", targetPublicId)
    : await client.from(table).insert({ target_public_id: targetPublicId });
  if (result.error) throw safeError(result.error);
}

export async function loadCommunityNotifications(): Promise<Array<Record<string, unknown>>> {
  const client = requireSupabase();
  const { data, error } = await client.from("community_notifications")
    .select("id,actor_public_id,notification_type,target_kind,target_id,created_at,read_at,actor:community_profiles!community_notifications_actor_public_id_fkey(public_id,display_name,avatar_color)")
    .order("created_at", { ascending: false }).limit(50);
  if (error) throw safeError(error);
  return (data ?? []).map((row) => ({ ...row, actor: Array.isArray(row.actor) ? row.actor[0] : row.actor }));
}

export async function markCommunityNotificationRead(id: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("community_notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  if (error) throw safeError(error);
}

export function communityCursor(post: CommunityPost, sort: CommunitySort): CommunityCursor {
  return { createdAt: post.created_at, helpfulCount: sort === "helpful" ? post.helpful_count : undefined, id: post.id };
}

export function communityFriendlyError(error: unknown): Error {
  return safeError(error);
}

export async function loadCommunityModerationQueue(): Promise<CommunityModerationItem[]> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("community_moderation_queue", { p_limit: 50 });
  if (error) throw safeError(error);
  return (data ?? []) as CommunityModerationItem[];
}

export async function moderateCommunityItem(targetKind: "post" | "comment", targetId: string, action: "hide" | "restore" | "remove", reason?: string): Promise<void> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("community_moderate_item", { p_target_kind: targetKind, p_target_id: targetId, p_action: action, p_reason: reason ?? null });
  if (error || data !== true) throw safeError(error ?? new Error("moderation_target_unavailable"));
}

export async function moderateCommunityReport(reportId: string, action: "resolve" | "dismiss", reason?: string): Promise<void> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("community_moderate_report", { p_report_id: reportId, p_action: action, p_reason: reason ?? null });
  if (error || data !== true) throw safeError(error ?? new Error("report_unavailable"));
}