import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, Bookmark, Plus, RefreshCw, Shield, UsersRound, X } from "lucide-react";
import {
  acceptCommunityGuidelines,
  communityFriendlyError,
  confirmCommunityAdult,
  createCommunityPost,
  joinCommunityCircle,
  leaveCommunityCircle,
  loadCommunityModerationQueue,
  loadCommunityNotifications,
  loadMyCommunityState,
  markCommunityNotificationRead,
  moderateCommunityItem,
  moderateCommunityReport,
  removeCommunityPost,
  reportCommunityItem,
  setCommunityReaction,
  setCommunityRelationship,
  toggleCommunitySavedPost,
  updateCommunityPost,
  type CommunityModerationItem,
  type CommunityPost,
  type CommunityReactionType,
  type CommunityReportReason,
  type CommunitySort,
} from "../lib/community";
import { PostCard } from "./community/PostCard";
import { Composer, ModerationDialog, ReportDialog, RequirementsDialog, type ModerationAction } from "./community/dialogs";
import { toNotifications, useCommunityBootstrap, useCommunityFeed, useDraftStorage, type CommunityNotification } from "./community/hooks";
import { RELATIONSHIP_NOTICE, formatTimestamp, type Guard, type PostForm } from "./community/text";

type View = "feed" | "saved" | "notifications";
type Banner = { kind: "notice" | "error"; text: string } | null;
type ComposerState = { editingPostId: string | null; initial: PostForm } | null;
type ModerationState = { items: CommunityModerationItem[]; loading: boolean; error: string } | null;

const headerButton = "inline-flex min-h-11 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm font-medium text-zinc-700 disabled:opacity-50";

function notificationText(type: string): string {
  if (type === "reaction") return "reacted to your post.";
  if (type === "comment" || type === "reply") return "replied to your thread.";
  return "sent you an update.";
}

export function CommunityView({ isAuthenticated, onSignIn }: { isAuthenticated: boolean; onSignIn: () => void }) {
  const data = useCommunityBootstrap(isAuthenticated);
  const { circles, config, userState, setUserState, savedIds, setSavedIds, notifications, setNotifications, relations, setRelations } = data;
  const draftStore = useDraftStorage();

  const [view, setView] = useState<View>("feed");
  const [selectedCircle, setSelectedCircle] = useState<string | null>(null);
  const [myCirclesOnly, setMyCirclesOnly] = useState(false);
  const [sort, setSort] = useState<CommunitySort>("recent");
  const [banner, setBanner] = useState<Banner>(null);
  const [composer, setComposer] = useState<ComposerState>(null);
  const [termsOpen, setTermsOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ kind: "post" | "comment"; id: string } | null>(null);
  const [moderation, setModeration] = useState<ModerationState>(null);
  const [busyPostId, setBusyPostId] = useState<string | null>(null);
  const pendingAction = useRef<(() => void | Promise<void>) | null>(null);

  const feed = useCommunityFeed({
    view: view === "notifications" ? null : view,
    circleSlug: selectedCircle,
    myCircles: myCirclesOnly,
    sort: view === "saved" ? "recent" : sort,
    isAuthenticated,
  });
  const { setPosts } = feed;

  const flash = useCallback((kind: "notice" | "error", text: string) => setBanner({ kind, text }), []);
  const showError = useCallback((message: string) => flash("error", message), [flash]);

  useEffect(() => {
    if (banner?.kind !== "notice") return;
    const timeout = window.setTimeout(() => setBanner(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [banner]);
  useEffect(() => { if (feed.error) showError(feed.error); }, [feed.error, showError]);
  useEffect(() => { if (data.error) showError(data.error); }, [data.error, showError]);
  useEffect(() => { if (!isAuthenticated) { setView("feed"); draftStore.clear(); } }, [isAuthenticated, draftStore]);

  const circleNames = useMemo(() => new Map(circles.map((circle) => [circle.slug, circle.name])), [circles]);
  const hiddenAuthors = useMemo(() => new Set([...relations.blocked, ...relations.muted]), [relations.blocked, relations.muted]);
  const visiblePosts = useMemo(() => feed.posts.filter((post) => !hiddenAuthors.has(post.author.public_id)), [feed.posts, hiddenAuthors]);
  const unreadCount = notifications.filter((item) => item.read_at == null).length;
  const profileId = userState?.profile?.public_id;

  const run = useCallback(async (action: () => Promise<void>) => {
    try { await action(); } catch (error) { showError(communityFriendlyError(error).message); }
  }, [showError]);

  const guard: Guard = useCallback((action, needs = "all") => {
    if (!isAuthenticated) {
      flash("notice", "Sign in to take part. Public posts stay readable without an account.");
      onSignIn();
      return;
    }
    if (!userState) {
      flash("notice", "Your community profile is still loading. Try again in a moment.");
      return;
    }
    if (!userState.age_confirmed || (needs === "all" && !userState.guidelines_accepted)) {
      pendingAction.current = action; // resumes after the requirements dialog, so the person doesn't repeat the click
      setTermsOpen(true);
      return;
    }
    void action();
  }, [isAuthenticated, userState, flash, onSignIn]);

  /* ---------- circles ---------- */

  const joinCircle = (slug: string) => guard(() => run(async () => {
    await joinCommunityCircle(slug);
    setUserState((current) => current ? { ...current, circles: [...new Set([...current.circles, slug])] } : current);
    flash("notice", "You joined the circle.");
  }), "age");

  const leaveCircle = (slug: string) => {
    if (!isAuthenticated) return;
    void run(async () => {
      await leaveCommunityCircle(slug);
      setUserState((current) => current ? { ...current, circles: current.circles.filter((entry) => entry !== slug) } : current);
      flash("notice", "You left the circle.");
    });
  };

  /* ---------- requirements ---------- */

  async function saveRequirements({ age, guidelines }: { age: boolean; guidelines: boolean }): Promise<string | null> {
    try {
      if (age && !userState?.age_confirmed) await confirmCommunityAdult();
      if (guidelines && !userState?.guidelines_accepted) await acceptCommunityGuidelines();
      const next = await loadMyCommunityState();
      setUserState(next);
      if (!next.age_confirmed || !next.guidelines_accepted) return "Both confirmations are needed to take part.";
      setTermsOpen(false);
      const action = pendingAction.current;
      pendingAction.current = null;
      if (action) await action();
      else flash("notice", "You're all set to take part.");
      return null;
    } catch (error) {
      return communityFriendlyError(error).message;
    }
  }

  function closeRequirements() {
    pendingAction.current = null;
    setTermsOpen(false);
  }

  /* ---------- posts ---------- */

  const openComposer = () => guard(() => {
    const joined = circles.filter((circle) => userState?.circles.includes(circle.slug));
    if (!joined.length) return flash("notice", "Join a circle before sharing a post.");
    const saved = draftStore.load();
    const circleSlug = joined.some((circle) => circle.slug === saved.circleSlug) ? saved.circleSlug : joined[0].slug;
    setComposer({ editingPostId: null, initial: { ...saved, circleSlug } });
  });

  const openEditor = (post: CommunityPost) =>
    setComposer({ editingPostId: post.id, initial: { circleSlug: post.circle_slug, title: post.title ?? "", body: post.body, topic: post.topic_tag ?? "" } });

  async function submitPost(form: PostForm): Promise<string | null> {
    if (!composer) return null;
    const editing = composer.editingPostId;
    try {
      if (editing) await updateCommunityPost(editing, { title: form.title, body: form.body, topicTag: form.topic });
      else await createCommunityPost({ circleSlug: form.circleSlug, title: form.title, body: form.body, topicTag: form.topic });
      if (!editing) draftStore.clear();
      setComposer(null);
      flash("notice", editing ? "Your post was updated." : "Your post was shared.");
      void feed.reload();
      return null;
    } catch (error) {
      return communityFriendlyError(error).message;
    }
  }

  function removePost(post: CommunityPost) {
    if (!window.confirm("Remove this post? This can't be undone.")) return;
    void run(async () => {
      await removeCommunityPost(post.id);
      setPosts((list) => list.map((entry) => entry.id === post.id ? { ...entry, body: "[Post removed by author]", title: null, status: "removed" } : entry));
      flash("notice", "Your post was removed.");
    });
  }

  const adjustCommentCount = useCallback((postId: string, delta: number) =>
    setPosts((list) => list.map((post) => post.id === postId ? { ...post, comments_count: Math.max(0, post.comments_count + delta) } : post)), [setPosts]);

  /* ---------- reactions, saves, reports, relationships ---------- */

  const react = (post: CommunityPost, reaction: CommunityReactionType) => guard(async () => {
    const previous = relations.reactions[post.id] ?? [];
    const active = !previous.includes(reaction);
    const setMine = (value: CommunityReactionType[]) => setRelations((current) => ({ ...current, reactions: { ...current.reactions, [post.id]: value } }));
    setMine(active ? [...previous, reaction] : previous.filter((item) => item !== reaction)); // optimistic
    setBusyPostId(post.id);
    try {
      const counts = await setCommunityReaction(post.id, reaction, active);
      setPosts((list) => list.map((entry) => entry.id === post.id ? { ...entry, reaction_counts: counts, helpful_count: counts.helpful } : entry));
    } catch (error) {
      setMine(previous);
      showError(communityFriendlyError(error).message);
    } finally {
      setBusyPostId(null);
    }
  });

  const toggleSave = (postId: string) => guard(() => run(async () => {
    const saved = savedIds.includes(postId);
    await toggleCommunitySavedPost(postId, saved);
    setSavedIds((current) => saved ? current.filter((id) => id !== postId) : [...current, postId]);
    if (saved && view === "saved") setPosts((list) => list.filter((post) => post.id !== postId));
    flash("notice", saved ? "Post removed from saved." : "Post saved privately.");
  }));

  const openReport = (kind: "post" | "comment", id: string) => guard(() => setReportTarget({ kind, id }));

  async function submitReport(reason: CommunityReportReason, detail: string): Promise<string | null> {
    if (!reportTarget) return null;
    try {
      await reportCommunityItem({ targetKind: reportTarget.kind, targetId: reportTarget.id, reason, detail });
      setReportTarget(null);
      flash("notice", "Report sent privately to moderators.");
      return null;
    } catch (error) {
      return communityFriendlyError(error).message;
    }
  }

  const toggleRelationship = (publicId: string, relationship: "block" | "mute") => guard(() => run(async () => {
    const list = relationship === "block" ? relations.blocked : relations.muted;
    const active = !list.includes(publicId);
    await setCommunityRelationship(publicId, relationship, active);
    const key = relationship === "block" ? "blocked" : "muted";
    setRelations((current) => ({ ...current, [key]: active ? [...current[key], publicId] : current[key].filter((id) => id !== publicId) }));
    flash("notice", RELATIONSHIP_NOTICE[relationship][active ? "on" : "off"]);
  }));

  /* ---------- updates ---------- */

  const refreshNotifications = useCallback(async () => {
    try { setNotifications(toNotifications(await loadCommunityNotifications())); }
    catch (error) { showError(communityFriendlyError(error).message); }
  }, [setNotifications, showError]);

  function toggleUpdates() {
    if (view === "notifications") return setView("feed");
    setView("notifications");
    void refreshNotifications();
  }

  async function readNotification(item: CommunityNotification) {
    if (item.read_at != null) return;
    setNotifications((list) => list.map((entry) => entry.id === item.id ? { ...entry, read_at: new Date().toISOString() } : entry));
    try { await markCommunityNotificationRead(item.id); }
    catch (error) { showError(communityFriendlyError(error).message); void refreshNotifications(); }
  }

  /* ---------- moderation ---------- */

  async function openModeration() {
    if (!userState?.is_moderator) return;
    setModeration({ items: [], loading: true, error: "" });
    try {
      const items = await loadCommunityModerationQueue();
      setModeration({ items, loading: false, error: "" });
    } catch (error) {
      setModeration({ items: [], loading: false, error: communityFriendlyError(error).message });
    }
  }

  async function moderate(item: CommunityModerationItem, action: ModerationAction) {
    try {
      if (action === "resolve" || action === "dismiss") await moderateCommunityReport(item.id, action);
      else await moderateCommunityItem(item.target_kind, item.target_id, action);
      setModeration((current) => current && { ...current, error: "", items: current.items.filter((entry) => entry.id !== item.id) });
      flash("notice", "Moderation action recorded.");
    } catch (error) {
      setModeration((current) => current && { ...current, error: communityFriendlyError(error).message });
    }
  }

  /* ---------- render ---------- */

  const feedBody = feed.loading ? (
    <div role="status" aria-label="Loading community" className="space-y-4">
      <div className="h-36 animate-pulse rounded-lg bg-zinc-100" />
      <div className="h-36 animate-pulse rounded-lg bg-zinc-100" />
    </div>
  ) : visiblePosts.length === 0 ? (
    <div className="border-y border-zinc-200 py-12 text-center">
      <p className="font-display text-lg font-semibold text-zinc-800">{view === "saved" ? "No saved posts" : "A quiet space"}</p>
      <p className="mt-2 text-sm text-zinc-500">{view === "saved" ? "Posts you save are private to your account." : "No posts here yet. Share only what you choose."}</p>
    </div>
  ) : (
    <div className="divide-y divide-zinc-200 border-y border-zinc-200">
      {visiblePosts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          circleName={circleNames.get(post.circle_slug) ?? "Community"}
          isAuthenticated={isAuthenticated}
          profileId={profileId}
          joined={Boolean(userState?.circles.includes(post.circle_slug))}
          myReactions={relations.reactions[post.id] ?? []}
          saved={savedIds.includes(post.id)}
          busy={busyPostId === post.id}
          blocked={relations.blocked.includes(post.author.public_id)}
          muted={relations.muted.includes(post.author.public_id)}
          editWindowMinutes={config?.edit_window_minutes ?? 15}
          commentLimit={config?.comment_limit ?? 600}
          hiddenAuthors={hiddenAuthors}
          guard={guard}
          onReact={react}
          onToggleSave={toggleSave}
          onEdit={openEditor}
          onRemove={removePost}
          onReport={openReport}
          onRelationship={toggleRelationship}
          onCommentCount={adjustCommentCount}
          onError={showError}
        />
      ))}
      {feed.hasMore && (
        <button type="button" onClick={() => void feed.loadMore()} disabled={feed.loadingMore} className="my-4 min-h-11 w-full rounded-lg border border-zinc-200 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">
          {feed.loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );

  const updatesBody = notifications.length === 0 ? (
    <p className="py-10 text-center text-sm text-zinc-500">No updates yet.</p>
  ) : (
    <ul className="divide-y divide-zinc-200 border-y border-zinc-200">
      {notifications.map((item) => (
        <li key={item.id}>
          <button type="button" onClick={() => void readNotification(item)} className="flex min-h-16 w-full items-center justify-between gap-4 py-3 text-left hover:bg-zinc-50">
            <span className="text-sm text-zinc-700">
              <strong>{item.actor?.display_name ?? "A member"}</strong> {notificationText(item.notification_type)}
              <span className="mt-1 block text-sm text-zinc-500">{formatTimestamp(item.created_at)}</span>
            </span>
            {item.read_at == null && <span aria-label="Unread" className="h-2.5 w-2.5 rounded-full bg-sage" />}
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <section className="space-y-6" aria-labelledby="community-heading">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-sage-dark">Shared experiences, not medical advice</p>
          <h1 id="community-heading" className="mt-1 font-display text-2xl font-bold text-zinc-900">Community</h1>
          <p className="mt-1 text-sm text-zinc-500">A supportive space kept separate from your health history.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {userState?.is_moderator && <button type="button" onClick={() => void openModeration()} className={headerButton}><Shield className="h-4 w-4" />Moderation</button>}
          <button type="button" aria-pressed={view === "saved"} disabled={!isAuthenticated} onClick={() => setView(view === "saved" ? "feed" : "saved")} className={headerButton}><Bookmark className="h-4 w-4" />Saved</button>
          <button type="button" aria-pressed={view === "notifications"} disabled={!isAuthenticated} onClick={toggleUpdates} className={`${headerButton} relative`}>
            <Bell className="h-4 w-4" />Updates{unreadCount > 0 && <span className="rounded-full bg-sage px-1.5 text-xs text-white">{unreadCount}</span>}
          </button>
          <button type="button" onClick={openComposer} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-sage px-4 text-sm font-semibold text-white hover:bg-sage-dark"><Plus className="h-4 w-4" />Share something</button>
        </div>
      </div>

      <p className="text-sm text-zinc-500">Community members are not clinicians. Posts reflect personal experiences and are not medical advice.</p>
      {banner && (
        <div role={banner.kind === "error" ? "alert" : "status"} className={`flex items-start justify-between gap-4 rounded-lg border px-4 py-3 text-sm ${banner.kind === "error" ? "border-rose-300 bg-rose-50 text-rose-800" : "border-sage/30 bg-sage-light text-sage-dark"}`}>
          <span>{banner.text}</span>
          <button type="button" onClick={() => setBanner(null)} aria-label="Dismiss message"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="space-y-4 border-b border-zinc-200 pb-5 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-5">
          <h2 className="font-display text-base font-semibold text-zinc-900">Circles</h2>
          <button
            type="button"
            aria-pressed={myCirclesOnly}
            disabled={!isAuthenticated || !userState?.circles.length}
            onClick={() => { setView("feed"); setSelectedCircle(null); setMyCirclesOnly((value) => !value); }}
            className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-medium disabled:opacity-50 ${myCirclesOnly ? "bg-sage-light text-sage-dark" : "text-zinc-600 hover:bg-zinc-100"}`}
          >
            <UsersRound className="h-4 w-4" />My circles
          </button>
          <nav aria-label="Community circles">
            <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-1">
              {circles.map((circle) => {
                const joined = Boolean(userState?.circles.includes(circle.slug));
                const selected = selectedCircle === circle.slug;
                return (
                  <li key={circle.slug} className={`rounded-lg px-3 py-2 ${selected ? "bg-sage-light" : "hover:bg-zinc-100"}`}>
                    <button type="button" aria-current={selected ? "true" : undefined} onClick={() => { setView("feed"); setMyCirclesOnly(false); setSelectedCircle(selected ? null : circle.slug); }} className="min-h-11 w-full text-left">
                      <span className="block text-sm font-semibold text-zinc-800">{circle.name}</span>
                      <span className="mt-0.5 block text-sm leading-5 text-zinc-500">{circle.description}</span>
                    </button>
                    <button type="button" onClick={() => joined ? leaveCircle(circle.slug) : joinCircle(circle.slug)} className="mt-1 min-h-11 text-sm font-semibold text-sage-dark hover:underline">
                      {joined ? "Joined · Leave" : "Join circle"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>

        <div aria-label="Community posts" className="min-w-0 space-y-4">
          {view === "feed" && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Feed sort">
                {(["recent", "helpful"] as const).map((option) => (
                  <button key={option} type="button" aria-pressed={sort === option} onClick={() => setSort(option)} className={`min-h-11 rounded-full px-4 text-sm font-medium ${sort === option ? "bg-sage-light text-sage-dark" : "border border-zinc-200 text-zinc-600 hover:bg-zinc-100"}`}>
                    {option === "helpful" ? "Most helpful, 30 days" : "Recent"}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => void feed.reload()} aria-label="Refresh community feed" className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100"><RefreshCw className="h-4 w-4" /></button>
            </div>
          )}
          {view === "saved" && <h2 className="font-display text-lg font-semibold text-zinc-900">Saved privately</h2>}
          {view === "notifications" && <h2 className="font-display text-lg font-semibold text-zinc-900">Updates</h2>}

          {view === "notifications" ? updatesBody : feedBody}
        </div>
      </div>

      {composer && (
        <Composer
          key={composer.editingPostId ?? "new"}
          circles={circles.filter((circle) => composer.editingPostId ? circle.slug === composer.initial.circleSlug : userState?.circles.includes(circle.slug))}
          config={config}
          initial={composer.initial}
          editing={Boolean(composer.editingPostId)}
          onChange={composer.editingPostId ? undefined : draftStore.save}
          onSubmit={submitPost}
          onDiscard={() => { draftStore.clear(); setComposer(null); }}
          onClose={() => setComposer(null)}
        />
      )}
      {termsOpen && <RequirementsDialog minimumAge={config?.minimum_age ?? 18} userState={userState} onSave={saveRequirements} onClose={closeRequirements} />}
      {reportTarget && <ReportDialog onSubmit={submitReport} onClose={() => setReportTarget(null)} />}
      {moderation && userState?.is_moderator && (
        <ModerationDialog items={moderation.items} loading={moderation.loading} error={moderation.error} circleNames={circleNames} onAction={(item, action) => void moderate(item, action)} onClose={() => setModeration(null)} />
      )}
    </section>
  );
}