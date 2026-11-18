import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Check, X, MessageSquare, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '../components/AppShell';
import { Avatar, EmptyStateArt, Starburst } from '../components/BrandMark';
import { apiFetch, useAuth } from '../lib/api';
import { formatReplyTime } from '../shared/types';

interface ConnectionItem {
  id: string;
  requester_id: string;
  receiver_id: string;
  status: string;
  message: string | null;
  created_at: string;
  requester_name: string;
  requester_avatar: string | null;
  requester_role: string;
  requester_city: string | null;
  requester_grade: string | null;
  receiver_name: string;
  receiver_avatar: string | null;
  receiver_role: string;
  receiver_city: string | null;
  receiver_profession: string | null;
  receiver_company: string | null;
  hours_waiting: number;
  alternatives: Array<{
    id: string;
    full_name: string;
    avatar_url: string | null;
    profession: string;
    avg_reply_hours: number | null;
  }>;
}

export default function ConnectionsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<ConnectionItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    apiFetch<{ connections: ConnectionItem[] }>('/api/connections')
      .then((d) => setItems(d.connections))
      .catch((err) => toast.error((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const respond = async (id: string, status: 'accepted' | 'declined') => {
    try {
      await apiFetch(`/api/connections/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      toast.success(status === 'accepted' ? 'Connection accepted!' : 'Request declined.');
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const incoming = items.filter((c) => c.receiver_id === user?.id && c.status === 'pending');
  const outgoing = items.filter((c) => c.requester_id === user?.id && c.status === 'pending');
  const accepted = items.filter((c) => c.status === 'accepted');

  return (
    <AppShell title="Connections">
      <div className="space-y-8">
        <div className="flex items-center gap-3">
          <Starburst size={24} color="#F6D66D" />
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold">
              Your <span className="italic text-[#C83D42]">Connections</span>
            </h1>
            <p className="text-sm text-[#5A4F4F]">Manage incoming requests, pending invites, and active mentors.</p>
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-sm text-[#6B5E5E]">Loading connections...</div>
        ) : (
          <>
            {/* Incoming */}
            <section className="space-y-3">
              <h2 className="font-display text-lg font-bold">Incoming Requests ({incoming.length})</h2>
              {incoming.length === 0 ? (
                <div className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-5 text-sm text-[#5A4F4F]">
                  No incoming connection requests right now.
                </div>
              ) : (
                <div className="space-y-3">
                  {incoming.map((c) => (
                    <div
                      key={c.id}
                      className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="flex items-start gap-3.5">
                        <Avatar src={c.requester_avatar} name={c.requester_name} size="md" />
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Link to={`/u/${c.requester_id}`} className="font-display font-bold hover:underline">
                              {c.requester_name}
                            </Link>
                            <span
                              className={`text-xs font-mono tabular-nums ${
                                c.hours_waiting >= 20 ? 'text-[#C83D42] font-bold' : 'text-[#6B5E5E]'
                              }`}
                            >
                              · Waiting {c.hours_waiting} hrs
                            </span>
                          </div>
                          <div className="text-xs text-[#6B5E5E]">
                            {[c.requester_grade, c.requester_city].filter(Boolean).join(' · ')}
                          </div>
                          {c.message && <p className="text-sm text-[#4D4242] mt-1.5">&ldquo;{c.message}&rdquo;</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => respond(c.id, 'accepted')}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-xs font-bold hover:bg-[#B23237]"
                        >
                          <Check className="w-4 h-4" />
                          <span>Accept</span>
                        </button>
                        <button
                          onClick={() => respond(c.id, 'declined')}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border-2 border-[#252020] bg-white text-xs font-bold hover:bg-[#FFF5E8]"
                        >
                          <X className="w-4 h-4" />
                          <span>Decline</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Outgoing */}
            <section className="space-y-3">
              <h2 className="font-display text-lg font-bold">Sent Requests ({outgoing.length})</h2>
              {outgoing.length === 0 ? (
                <div className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-5 text-sm text-[#5A4F4F]">
                  No pending sent requests.
                </div>
              ) : (
                <div className="space-y-3">
                  {outgoing.map((c) => (
                    <div
                      key={c.id}
                      className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-5 space-y-4"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3.5">
                          <Avatar src={c.receiver_avatar} name={c.receiver_name} size="md" />
                          <div>
                            <Link to={`/u/${c.receiver_id}`} className="font-display font-bold hover:underline">
                              {c.receiver_name}
                            </Link>
                            <div className="text-xs text-[#6B5E5E]">
                              {c.receiver_profession || c.receiver_role}
                              {c.receiver_company ? ` @ ${c.receiver_company}` : ''}
                            </div>
                          </div>
                        </div>
                        <span className="text-xs font-mono font-bold text-[#6B5E5E] tabular-nums">
                          Pending · {c.hours_waiting} hrs
                        </span>
                      </div>

                      {c.alternatives && c.alternatives.length > 0 && (
                        <div className="p-4 rounded-xl bg-[#F7A98A]/30 border-2 border-[#252020] space-y-2.5">
                          <div className="flex items-center gap-2 text-xs font-bold text-[#C83D42]">
                            <AlertTriangle className="w-4 h-4" />
                            <span>This mentor hasn&apos;t replied in 24+ hours. Here are similar mentors:</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            {c.alternatives.map((alt) => (
                              <Link
                                key={alt.id}
                                to={`/u/${alt.id}`}
                                className="p-3 rounded-xl bg-white border-2 border-[#252020] hover:-translate-y-0.5 transition-transform flex items-center gap-2.5"
                              >
                                <Avatar src={alt.avatar_url} name={alt.full_name} size="sm" />
                                <div className="min-w-0">
                                  <div className="text-xs font-bold truncate">{alt.full_name}</div>
                                  <div className="text-[11px] text-[#6B5E5E] truncate">
                                    {formatReplyTime(alt.avg_reply_hours)}
                                  </div>
                                </div>
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Accepted */}
            <section className="space-y-3">
              <h2 className="font-display text-lg font-bold">Accepted Connections ({accepted.length})</h2>
              {accepted.length === 0 ? (
                <EmptyStateArt
                  title="No connections yet"
                  subtitle="Find a verified Pakistani mentor to ask questions, chat, and book 1:1 sessions."
                  action={
                    <Link
                      to="/explore"
                      className="inline-flex px-4 py-2 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-xs font-bold"
                    >
                      Find a mentor →
                    </Link>
                  }
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {accepted.map((c) => {
                    const isReq = c.requester_id === user?.id;
                    const peerId = isReq ? c.receiver_id : c.requester_id;
                    const peerName = isReq ? c.receiver_name : c.requester_name;
                    const peerAvatar = isReq ? c.receiver_avatar : c.requester_avatar;
                    const peerSub = isReq
                      ? c.receiver_profession || c.receiver_city
                      : [c.requester_grade, c.requester_city].filter(Boolean).join(' · ');

                    return (
                      <div
                        key={c.id}
                        className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-4 flex items-center justify-between gap-3"
                      >
                        <Link to={`/u/${peerId}`} className="flex items-center gap-3 min-w-0">
                          <Avatar src={peerAvatar} name={peerName} size="md" />
                          <div className="min-w-0">
                            <div className="font-display font-bold text-sm truncate">{peerName}</div>
                            <div className="text-xs text-[#6B5E5E] truncate">{peerSub}</div>
                          </div>
                        </Link>
                        <Link
                          to={`/messages/${c.id}`}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#F6D66D] border-2 border-[#252020] text-xs font-bold hover:-translate-y-0.5 transition-transform shrink-0"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>Message</span>
                        </Link>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
