import React, { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Users, Plus, HelpCircle, MessageSquare, ArrowLeft, BadgeCheck } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '../components/AppShell';
import { Avatar, EmptyStateArt, Starburst } from '../components/BrandMark';
import { apiFetch, useAuth } from '../lib/api';
import { formatPKT, type Niche } from '../shared/types';

interface GroupSummary {
  id: string;
  mentor_id: string;
  niche_slug: string;
  niche_name: string;
  name: string;
  description: string;
  mentor_name: string;
  mentor_profession: string;
  members_count: number;
  posts_count: number;
  is_member: boolean;
}

interface GroupPost {
  id: string;
  group_id: string;
  author_id: string;
  parent_id: string | null;
  body: string;
  is_question: boolean;
  is_mentor_answer: boolean;
  author_name: string;
  author_avatar: string | null;
  author_role: string;
  author_grade: string | null;
  author_profession: string | null;
  created_at: string;
}

export function GroupsListPage() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [niches, setNiches] = useState<Niche[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [nicheSlug, setNicheSlug] = useState('software-engineering');
  const [description, setDescription] = useState('');

  const load = useCallback(() => {
    apiFetch<{ groups: GroupSummary[] }>('/api/groups')
      .then((d) => setGroups(d.groups))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    apiFetch<{ niches: Niche[] }>('/api/niches')
      .then((d) => setNiches(d.niches))
      .catch(() => {});
  }, [load]);

  const joinGroup = async (id: string) => {
    try {
      await apiFetch(`/api/groups/${id}/join`, { method: 'POST' });
      toast.success('Joined group!');
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const createGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/groups', {
        method: 'POST',
        body: JSON.stringify({ name, niche_slug: nicheSlug, description }),
      });
      toast.success('Niche group created!');
      setShowCreate(false);
      setName('');
      setDescription('');
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const isApprovedMentor = user?.role === 'mentor' && user.mentor_details?.status === 'approved';

  return (
    <AppShell title="Niche Groups">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Starburst size={24} color="#F6D66D" />
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold">
                Career <span className="italic text-[#C83D42]">Niche Groups</span>
              </h1>
              <p className="text-sm text-[#5A4F4F]">
                Always free. Join a community, ask career questions, and learn from verified mentors.
              </p>
            </div>
          </div>
          {isApprovedMentor && (
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#C83D42] border-2 border-[#252020] editorial-shadow-sm text-white text-sm font-bold hover:bg-[#B23237] self-start"
            >
              <Plus className="w-4 h-4" />
              <span>Create Group</span>
            </button>
          )}
        </div>

        {groups.length === 0 ? (
          <EmptyStateArt
            title="No niche groups yet"
            subtitle="Verified mentors are spinning up career discussion circles soon."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {groups.map((g, idx) => (
              <div
                key={g.id}
                className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 flex flex-col justify-between gap-4 hover:-translate-y-0.5 transition-transform"
              >
                <div>
                  <div
                    className={`inline-block px-2.5 py-1 rounded-lg border border-[#252020] text-xs font-bold ${
                      idx % 2 === 0 ? 'bg-[#F6D66D]' : 'bg-[#F7A98A]'
                    }`}
                  >
                    {g.niche_name || g.niche_slug}
                  </div>
                  <Link to={`/groups/${g.id}`} className="font-display text-xl font-bold hover:underline mt-2.5 block">
                    {g.name}
                  </Link>
                  <p className="text-sm text-[#5A4F4F] mt-2">{g.description}</p>
                </div>

                <div className="pt-4 border-t border-[#252020]/15 flex items-center justify-between gap-3">
                  <div className="text-xs text-[#6B5E5E] tabular-nums">
                    Led by <span className="font-bold text-[#252020]">{g.mentor_name}</span> · {g.members_count} members
                    · {g.posts_count} posts
                  </div>
                  {g.is_member ? (
                    <Link
                      to={`/groups/${g.id}`}
                      className="px-4 py-2 rounded-xl bg-[#F6D66D] border-2 border-[#252020] text-xs font-bold hover:-translate-y-0.5 transition-transform"
                    >
                      Open →
                    </Link>
                  ) : (
                    <button
                      onClick={() => joinGroup(g.id)}
                      className="px-4 py-2 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-xs font-bold hover:bg-[#B23237]"
                    >
                      Join Group
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {showCreate && (
          <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
            <form
              onSubmit={createGroup}
              className="bg-white rounded-3xl border-2 border-[#252020] editorial-shadow max-w-md w-full p-6 space-y-4"
            >
              <h3 className="font-display text-xl font-bold">Create Niche Group</h3>
              <div>
                <label className="block text-xs font-bold mb-1">Group Name</label>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Pre-Engineering Guidance Pakistan"
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/35 text-sm focus:outline-none focus:border-[#252020]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">Career Niche</label>
                <select
                  value={nicheSlug}
                  onChange={(e) => setNicheSlug(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/35 text-sm bg-white focus:outline-none focus:border-[#252020]"
                >
                  {niches.map((n) => (
                    <option key={n.slug} value={n.slug}>
                      {n.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">Description</label>
                <textarea
                  required
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/35 text-sm focus:outline-none focus:border-[#252020]"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 rounded-xl border-2 border-[#252020] text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-xs font-bold"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </AppShell>
  );
}

export function GroupDetailPage() {
  const { id } = useParams();
  const [group, setGroup] = useState<GroupSummary | null>(null);
  const [posts, setPosts] = useState<GroupPost[]>([]);
  const [body, setBody] = useState('');
  const [isQuestion, setIsQuestion] = useState(true);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');

  const load = useCallback(() => {
    if (!id) return;
    apiFetch<{ group: GroupSummary; posts: GroupPost[] }>(`/api/groups/${id}`)
      .then((d) => {
        setGroup(d.group);
        setPosts(d.posts);
      })
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const join = async () => {
    if (!id) return;
    await apiFetch(`/api/groups/${id}/join`, { method: 'POST' });
    toast.success('Joined group! You can now post questions.');
    load();
  };

  const submitPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !body.trim()) return;
    try {
      const res = await apiFetch<{ was_masked: boolean }>(`/api/groups/${id}/posts`, {
        method: 'POST',
        body: JSON.stringify({ body, is_question: isQuestion }),
      });
      setBody('');
      toast.success(res.was_masked ? 'Posted (contact details hidden for safety).' : 'Posted to group!');
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const submitReply = async (parentId: string) => {
    if (!id || !replyBody.trim()) return;
    try {
      await apiFetch(`/api/groups/${id}/posts`, {
        method: 'POST',
        body: JSON.stringify({ body: replyBody, parent_id: parentId, is_question: false }),
      });
      setReplyTo(null);
      setReplyBody('');
      toast.success('Reply posted!');
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const topPosts = posts.filter((p) => !p.parent_id);
  const repliesByParent = posts.reduce<Record<string, GroupPost[]>>((acc, p) => {
    if (p.parent_id) {
      acc[p.parent_id] = acc[p.parent_id] || [];
      acc[p.parent_id].push(p);
    }
    return acc;
  }, {});

  return (
    <AppShell title={group?.name || 'Group'}>
      {!group ? (
        <div className="py-12 text-center text-sm text-[#6B5E5E]">Loading group...</div>
      ) : (
        <div className="max-w-3xl mx-auto space-y-6">
          <Link to="/groups" className="inline-flex items-center gap-1.5 text-xs font-bold text-[#5A4F4F] hover:text-[#C83D42]">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>All Groups</span>
          </Link>

          <div className="bg-white rounded-3xl border-2 border-[#252020] editorial-shadow p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div>
                <div className="inline-block px-2.5 py-1 rounded-lg bg-[#F6D66D] border border-[#252020] text-xs font-bold text-[#252020]">
                  {group.niche_name || group.niche_slug}
                </div>
                <h1 className="font-display text-2xl sm:text-3xl font-bold mt-2">{group.name}</h1>
                <p className="text-sm text-[#5A4F4F] mt-1">{group.description}</p>
                <div className="mt-3 text-xs text-[#6B5E5E] flex items-center gap-2">
                  <Users className="w-3.5 h-3.5" />
                  <span>
                    Mentor:{' '}
                    <Link to={`/u/${group.mentor_id}`} className="font-bold text-[#252020] hover:underline">
                      {group.mentor_name}
                    </Link>{' '}
                    · {group.members_count} members
                  </span>
                </div>
              </div>
              {!group.is_member && (
                <button
                  onClick={join}
                  className="px-5 py-2.5 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-xs font-bold hover:bg-[#B23237] shrink-0"
                >
                  Join Group
                </button>
              )}
            </div>
          </div>

          {group.is_member && (
            <form
              onSubmit={submitPost}
              className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-5 space-y-3"
            >
              <textarea
                required
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Ask a question about degrees, daily work, or university admissions..."
                className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/30 text-sm focus:outline-none focus:border-[#252020]"
              />
              <div className="flex items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 text-xs font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isQuestion}
                    onChange={(e) => setIsQuestion(e.target.checked)}
                    className="accent-[#C83D42]"
                  />
                  <HelpCircle className="w-3.5 h-3.5 text-[#C83D42]" />
                  <span>Tag as Question</span>
                </label>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-xs font-bold hover:bg-[#B23237]"
                >
                  Post to Group
                </button>
              </div>
            </form>
          )}

          {topPosts.length === 0 ? (
            <EmptyStateArt
              title="No questions asked yet"
              subtitle="Be the first student to kick off the conversation in this niche group."
            />
          ) : (
            <div className="space-y-4">
              {topPosts.map((post) => {
                const replies = repliesByParent[post.id] || [];
                return (
                  <div
                    key={post.id}
                    className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-5 space-y-4"
                  >
                    <div className="flex items-start gap-3">
                      <Avatar src={post.author_avatar} name={post.author_name} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link to={`/u/${post.author_id}`} className="font-display font-bold text-sm hover:underline">
                            {post.author_name}
                          </Link>
                          {post.is_question && (
                            <span className="px-2 py-0.5 rounded-md bg-[#F7A98A]/50 border border-[#252020] text-[10px] font-bold text-[#252020]">
                              Question
                            </span>
                          )}
                          <span className="text-[11px] text-[#6B5E5E] font-mono">{formatPKT(post.created_at)}</span>
                        </div>
                        <p className="text-sm text-[#252020] mt-1.5 leading-relaxed">{post.body}</p>
                      </div>
                    </div>

                    {/* Replies (1 level) */}
                    {replies.length > 0 && (
                      <div className="pl-5 sm:pl-10 space-y-3 border-t border-[#252020]/15 pt-3">
                        {replies.map((rep) => (
                          <div
                            key={rep.id}
                            className={`p-3.5 rounded-xl border-2 border-[#252020] ${
                              rep.is_mentor_answer ? 'bg-[#F6D66D]/45' : 'bg-[#FFF5E8]'
                            }`}
                          >
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-display font-bold text-[#252020]">{rep.author_name}</span>
                              {rep.is_mentor_answer && (
                                <span className="inline-flex items-center gap-1 font-bold text-[#C83D42]">
                                  <BadgeCheck className="w-3.5 h-3.5" />
                                  Mentor Answer
                                </span>
                              )}
                              <span className="text-[#6B5E5E] font-mono">{formatPKT(rep.created_at)}</span>
                            </div>
                            <p className="text-sm text-[#252020] mt-1">{rep.body}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {group.is_member && (
                      <div>
                        {replyTo === post.id ? (
                          <div className="pl-5 sm:pl-10 flex items-center gap-2">
                            <input
                              value={replyBody}
                              onChange={(e) => setReplyBody(e.target.value)}
                              placeholder="Write a reply..."
                              className="flex-1 px-3 py-2 rounded-xl border-2 border-[#252020]/30 text-xs focus:outline-none focus:border-[#252020]"
                            />
                            <button
                              onClick={() => submitReply(post.id)}
                              className="px-3.5 py-2 rounded-xl bg-[#C83D42] border border-[#252020] text-white text-xs font-bold"
                            >
                              Reply
                            </button>
                            <button
                              onClick={() => setReplyTo(null)}
                              className="px-2.5 py-2 text-xs font-bold text-[#6B5E5E]"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setReplyTo(post.id)}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#5A4F4F] hover:text-[#C83D42]"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>Reply</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
