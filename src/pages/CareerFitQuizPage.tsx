import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Award, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '../components/AppShell';
import { Avatar, Starburst, VerifiedIcon } from '../components/BrandMark';
import { apiFetch } from '../lib/api';
import { formatReplyTime, RIASEC_LABELS, type Niche } from '../shared/types';

interface Question {
  id: string;
  position: number;
  question: string;
  options: Array<{ label: string; riasec?: string }>;
}

interface CareerFitResult {
  top_codes: string[];
  suggested_niches: Niche[];
  matched_mentors: Array<{
    id: string;
    full_name: string;
    avatar_url: string | null;
    profession: string;
    company: string | null;
    avg_reply_hours: number | null;
    rating: number | null;
  }>;
}

export default function CareerFitQuizPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<CareerFitResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const CAREER_QUIZ_ID = '40000000-0000-4000-8000-000000000001';

  useEffect(() => {
    apiFetch<{
      questions: Question[];
      latest_attempt: { result: CareerFitResult | null } | null;
    }>(`/api/quizzes/${CAREER_QUIZ_ID}`)
      .then((d) => {
        setQuestions(d.questions);
        if (d.latest_attempt?.result) {
          setResult(d.latest_attempt.result);
        }
      })
      .catch((err) => toast.error((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const chooseOption = async (optIdx: number) => {
    const updated = [...answers];
    updated[step] = optIdx;
    setAnswers(updated);

    if (step < questions.length - 1) {
      setStep(step + 1);
    } else {
      setSubmitting(true);
      try {
        const res = await apiFetch<{ result: CareerFitResult }>(`/api/quizzes/${CAREER_QUIZ_ID}/attempt`, {
          method: 'POST',
          body: JSON.stringify({ answers: updated }),
        });
        setResult(res.result);
        toast.success('Explorer badge unlocked on your Career Passport!');
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setSubmitting(false);
      }
    }
  };

  const retakeQuiz = () => {
    setResult(null);
    setAnswers([]);
    setStep(0);
  };

  if (loading) {
    return (
      <AppShell title="Career Fit Quiz">
        <div className="max-w-2xl mx-auto py-12 text-center text-sm text-[#6B5E5E]">Loading quiz...</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Career Fit Quiz">
      <div className="max-w-3xl mx-auto">
        {result ? (
          <div className="space-y-8">
            <div className="bg-[#F6D66D] border-2 border-[#252020] editorial-shadow rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl bg-white border-2 border-[#252020] flex items-center justify-center shrink-0">
                  <Award className="w-6 h-6 text-[#C83D42]" />
                </div>
                <div>
                  <div className="font-display text-2xl font-bold">Your Career Fit Profile</div>
                  <p className="text-sm text-[#252020]/85 mt-0.5">
                    Explorer sticker badge earned! Your top strengths:{' '}
                    <span className="font-bold">
                      {result.top_codes.map((c) => RIASEC_LABELS[c]?.name || c).join(' + ')}
                    </span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={retakeQuiz}
                className="px-4 py-2 rounded-xl border-2 border-[#252020] bg-white text-xs font-bold hover:bg-[#FFF5E8] whitespace-nowrap"
              >
                Retake Quiz
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {result.top_codes.map((code, idx) => (
                <div
                  key={code}
                  className={`rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-5 ${
                    idx === 0 ? 'bg-white' : 'bg-[#F7A98A]/35'
                  }`}
                >
                  <div className="text-xs font-mono font-bold text-[#C83D42]">RIASEC TYPE {code}</div>
                  <h3 className="font-display text-lg font-bold mt-1">{RIASEC_LABELS[code]?.name}</h3>
                  <p className="text-sm text-[#4D4242] mt-1">{RIASEC_LABELS[code]?.summary}</p>
                </div>
              ))}
            </div>

            <div>
              <h2 className="font-display text-xl font-bold mb-4">3 Suggested Careers For You</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {result.suggested_niches.map((n, idx) => (
                  <Link
                    key={n.slug}
                    to={`/careers/${n.slug}`}
                    className={`rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-5 hover:-translate-y-0.5 transition-transform flex flex-col justify-between ${
                      idx === 0 ? 'bg-[#C83D42] text-white' : 'bg-white text-[#252020]'
                    }`}
                  >
                    <div>
                      <h3 className="font-display text-lg font-bold">{n.name}</h3>
                      <p className={`text-xs mt-1 ${idx === 0 ? 'text-white/85' : 'text-[#6B5E5E]'}`}>
                        {n.salary_range_pkr}
                      </p>
                      <p className={`text-sm mt-2 line-clamp-3 ${idx === 0 ? 'text-white/95' : 'text-[#5A4F4F]'}`}>
                        {n.description}
                      </p>
                    </div>
                    <div className={`mt-4 text-xs font-bold ${idx === 0 ? 'text-[#F6D66D]' : 'text-[#C83D42]'}`}>
                      Explore degree &amp; universities →
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            <div>
              <h2 className="font-display text-xl font-bold mb-4">3 Matched Mentors Ready to Talk</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {result.matched_mentors.map((m) => (
                  <Link
                    key={m.id}
                    to={`/u/${m.id}`}
                    className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-5 hover:-translate-y-0.5 transition-transform space-y-3"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar src={m.avatar_url} name={m.full_name} size="md" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="font-display font-bold text-sm truncate">{m.full_name}</span>
                          <VerifiedIcon />
                        </div>
                        <div className="text-xs text-[#5A4F4F] truncate">
                          {m.profession}
                          {m.company ? ` · ${m.company}` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-[#6B5E5E] tabular-nums">{formatReplyTime(m.avg_reply_hours)}</div>
                    <div className="inline-flex items-center text-xs font-bold text-[#C83D42]">
                      View profile &amp; connect →
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#C83D42] border-2 border-[#252020] editorial-shadow-sm text-white text-sm font-bold hover:bg-[#B23237]"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Go to Dashboard</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between text-xs font-bold text-[#252020]">
              <span className="inline-flex items-center gap-1.5">
                <Starburst size={16} color="#F6D66D" />
                <span>Career Fit Quiz (RIASEC)</span>
              </span>
              <span className="font-mono tabular-nums">
                Question {step + 1} of {questions.length}
              </span>
            </div>

            <div className="w-full h-3 rounded-full bg-[#FFF5E8] border border-[#252020] overflow-hidden">
              <div
                className="h-full bg-[#C83D42] transition-all duration-200"
                style={{ width: `${Math.round(((step + 1) / questions.length) * 100)}%` }}
              />
            </div>

            {questions[step] && (
              <motion.div
                key={questions[step].id}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-5"
              >
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#252020]">
                  {questions[step].question}
                </h1>

                <div className="space-y-3">
                  {questions[step].options.map((opt, idx) => {
                    const selected = answers[step] === idx;
                    return (
                      <button
                        key={idx}
                        type="button"
                        disabled={submitting}
                        onClick={() => chooseOption(idx)}
                        className={`w-full text-left p-4 rounded-xl border-2 text-sm font-semibold transition-all flex items-center justify-between gap-3 ${
                          selected
                            ? 'border-[#252020] bg-[#F6D66D] text-[#252020] editorial-shadow-sm'
                            : 'border-[#252020]/25 bg-[#FFF5E8]/60 hover:border-[#252020] hover:bg-[#FFF5E8]'
                        }`}
                      >
                        <span>{opt.label}</span>
                        <ArrowRight className="w-4 h-4 text-[#C83D42] shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                disabled={step === 0}
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                className="inline-flex items-center gap-1.5 text-sm font-bold text-[#6B5E5E] hover:text-[#252020] disabled:opacity-40"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Previous</span>
              </button>
              <span className="text-xs text-[#6B5E5E]">Pick the option that sounds most like you</span>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
