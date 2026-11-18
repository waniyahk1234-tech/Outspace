import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Send, ShieldAlert, Lock, Flag, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '../components/AppShell';
import { Avatar, OrbitDoodle } from '../components/BrandMark';
import { apiFetch, getSessionToken, useAuth } from '../lib/api';
import { formatPKT } from '../shared/types';

interface ThreadSummary {
  id: string;
  peer_id: string;
  peer_name: string;
  peer_avatar: string | null;
  peer_role: string;
  last_message: string | null;
  last_message_at: string | null;
}

interface MessageItem {
  id: string;
  connection_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

interface PeerDetail {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role: string;
  profession?: string;
  company?: string;
}

export default function MessagesPage() {
  const { connectionId } = useParams();
  const { user } = useAuth();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [peer, setPeer] = useState<PeerDetail | null>(null);
  const [locked, setLocked] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(() => {
    apiFetch<{ threads: ThreadSummary[] }>('/api/messages')
      .then((d) => setThreads(d.threads))
      .catch(() => {});
  }, []);

  const loadConversation = useCallback(() => {
    if (!connectionId) return;
    apiFetch<{ peer: PeerDetail; messages: MessageItem[]; mentor_messaging_locked: boolean }>(
      `/api/messages/${connectionId}`
    )
      .then((d) => {
        setPeer(d.peer);
        setMessages(d.messages);
        setLocked(d.mentor_messaging_locked);
      })
      .catch((err) => toast.error((err as Error).message));
  }, [connectionId]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    loadConversation();
  }, [loadConversation]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Realtime SSE listener
  useEffect(() => {
    const token = getSessionToken();
    const streamUrl = token
      ? `/api/realtime/stream?token=${encodeURIComponent(token)}`
      : '/api/realtime/stream';
    const es = new EventSource(streamUrl, { withCredentials: true });
    es.addEventListener('new_message', (ev) => {
      try {
        const msg = JSON.parse((ev as MessageEvent).data) as MessageItem;
        loadThreads();
        if (msg.connection_id === connectionId) {
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        }
      } catch {}
    });
    return () => {
      es.close();
    };
  }, [connectionId, loadThreads]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connectionId || !draft.trim()) return;
    setSending(true);
    try {
      const res = await apiFetch<{ message: MessageItem; was_masked: boolean }>(`/api/messages/${connectionId}`, {
        method: 'POST',
        body: JSON.stringify({ body: draft }),
      });
      setMessages((prev) => (prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]));
      setDraft('');
      loadThreads();
      if (res.was_masked) {
        toast.info('Contact details were hidden for your safety.');
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const handleBlock = async () => {
    if (!peer) return;
    try {
      await apiFetch('/api/blocks', { method: 'POST', body: JSON.stringify({ blocked_id: peer.id }) });
      toast.success(`${peer.full_name} has been blocked.`);
      setPeer(null);
      setMessages([]);
      loadThreads();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleReport = async () => {
    if (!peer) return;
    try {
      await apiFetch('/api/reports', {
        method: 'POST',
        body: JSON.stringify({ reported_id: peer.id, reason: 'Reported from direct message thread' }),
      });
      toast.success('Report sent to Outspace safety team.');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <AppShell title="Messages">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 min-h-[540px]">
        {/* Thread List */}
        <div
          className={`md:col-span-4 bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm overflow-hidden flex flex-col ${
            connectionId ? 'hidden md:flex' : 'flex'
          }`}
        >
          <div className="p-4 border-b-2 border-[#252020]/15 bg-[#F6D66D]/35 font-display font-bold">
            Conversations
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-[#252020]/10">
            {threads.length === 0 ? (
              <div className="p-6 text-sm text-[#5A4F4F] space-y-3">
                <p>No active conversations yet.</p>
                <Link
                  to="/explore"
                  className="inline-flex px-4 py-2 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-xs font-bold"
                >
                  Connect with a mentor →
                </Link>
              </div>
            ) : (
              threads.map((t) => (
                <Link
                  key={t.id}
                  to={`/messages/${t.id}`}
                  className={`p-4 flex items-center gap-3 hover:bg-[#FFF5E8] transition-colors ${
                    t.id === connectionId ? 'bg-[#F6D66D]/35' : ''
                  }`}
                >
                  <Avatar src={t.peer_avatar} name={t.peer_name} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="font-display font-bold text-sm truncate">{t.peer_name}</div>
                    <div className="text-xs text-[#6B5E5E] truncate">{t.last_message || 'Say salam to start!'}</div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Active Chat Thread */}
        <div
          className={`md:col-span-8 bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm overflow-hidden flex flex-col ${
            !connectionId ? 'hidden md:flex' : 'flex'
          }`}
        >
          {!connectionId || !peer ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-[#FFF5E8] border-2 border-[#252020] flex items-center justify-center">
                <OrbitDoodle />
              </div>
              <div className="font-display font-bold text-lg">Your Outspace Inbox</div>
              <p className="text-sm text-[#6B5E5E] max-w-sm">
                Select a conversation on the left to ask questions and plan your 1:1 mentorship session.
              </p>
            </div>
          ) : (
            <>
              <div className="p-4 border-b-2 border-[#252020]/15 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Link to="/messages" className="md:hidden text-xs font-bold text-[#C83D42]">
                    ← Back
                  </Link>
                  <Avatar src={peer.avatar_url} name={peer.full_name} size="sm" />
                  <div className="min-w-0">
                    <Link to={`/u/${peer.id}`} className="font-display font-bold text-sm hover:underline truncate block">
                      {peer.full_name}
                    </Link>
                    <div className="text-xs text-[#6B5E5E] truncate">
                      {peer.profession ? `${peer.profession}${peer.company ? ` @ ${peer.company}` : ''}` : peer.role}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleReport}
                    className="p-2 rounded-xl border-2 border-[#252020]/20 text-[#6B5E5E] hover:text-[#252020] hover:border-[#252020]"
                    title="Report user"
                  >
                    <Flag className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleBlock}
                    className="p-2 rounded-xl border-2 border-[#252020]/20 text-[#6B5E5E] hover:text-[#C83D42] hover:border-[#C83D42]"
                    title="Block user"
                  >
                    <Ban className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="px-4 py-2 bg-[#FFF5E8] border-b border-[#252020]/15 flex items-center gap-2 text-xs font-medium text-[#4D4242]">
                <ShieldAlert className="w-4 h-4 text-[#C83D42] shrink-0" />
                <span>For your safety, contact details are hidden. Keep chats on Outspace.</span>
              </div>

              <div className="flex-1 p-4 space-y-3 overflow-y-auto max-h-[420px]">
                {messages.map((m) => {
                  const mine = m.sender_id === user?.id;
                  return (
                    <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                      <div
                        className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm border-2 border-[#252020] ${
                          mine ? 'bg-[#C83D42] text-white' : 'bg-[#FFF5E8] text-[#252020]'
                        }`}
                      >
                        {m.body}
                      </div>
                      <span className="text-[10px] text-[#6B5E5E] mt-1 font-mono">
                        {formatPKT(m.created_at, 'h:mm a')}
                      </span>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {locked ? (
                <div className="p-4 border-t-2 border-[#252020]/15 bg-[#F6D66D]/45 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#252020]">
                    <Lock className="w-4 h-4 text-[#C83D42]" />
                    <span>Your 7-day trial has ended. Upgrade to continue messaging mentors.</span>
                  </div>
                  <Link
                    to="/pricing"
                    className="px-4 py-2 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-xs font-bold text-center"
                  >
                    Upgrade Plan
                  </Link>
                </div>
              ) : (
                <form onSubmit={sendMessage} className="p-3 border-t-2 border-[#252020]/15 flex items-center gap-2">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Write a message..."
                    className="flex-1 px-4 py-2.5 rounded-xl border-2 border-[#252020]/30 text-sm focus:outline-none focus:border-[#252020]"
                  />
                  <button
                    type="submit"
                    disabled={sending || !draft.trim()}
                    className="p-2.5 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white hover:bg-[#B23237] disabled:opacity-50"
                    aria-label="Send message"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
