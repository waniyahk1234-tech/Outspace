import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, BookOpen, CheckCircle2, XCircle, Award, ArrowLeft, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '../components/AppShell';
import { EmptyStateArt, Starburst } from '../components/BrandMark';
import { apiFetch, useAuth } from '../lib/api';
import type { Niche } from '../shared/types';

interface QuizSummary {
  id: string;
  title: string;
  description: string;
  niche_name: string | null;
  author_name: string | null;
  is_career_fit: number;
  question_count: number;
  best_attempt_score: number | null;
}

export function QuizzesListPage() {
  const { user } = useAuth();
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);

  useEffect(() => {
    apiFetch<{ quizzes: QuizSummary[] }>('/api/quizzes')
      .then((d) => setQuizzes(d.quizzes))
      .catch(() => {});
  }, []);

  const isApprovedMentor = user?.role === 'mentor' && user.mentor_details?.status === 'approved';

  return (
    <AppShell title="Quizzes">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Starburst size={24} color="#F6D66D" />
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold">
                Career &amp; Skill <span className="italic text-[#C83D42]">Quizzes</span>
              </h1>
              <p className="text-sm text-[#5A4F4F]">
                Score 80% or higher on any mentor quiz to unlock the Quiz Ace sticker badge.
              </p>
            </div>
          </div>
          {isApprovedMentor && (
            <Link
              to="/quizzes/new"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#C83D42] border-2 border-[#252020] editorial-shadow-sm text-white text-sm font-bold hover:bg-[#B23237] self-start"
            >
              <Plus className="w-4 h-4" />
              <span>Create Quiz</span>
            </Link>
          )}
        </div>

        {quizzes.length === 0 ? (
          <EmptyStateArt
            title="No quizzes published yet"
            subtitle="Take the 12-question Career Fit Quiz to discover matched Pakistani degrees and mentors."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {quizzes.map((q) => (
              <Link
                key={q.id}
                to={q.is_career_fit ? '/quiz/career-fit' : `/quizzes/${q.id}`}
                className={`rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 flex flex-col justify-between gap-4 transition-transform hover:-translate-y-0.5 ${
                  q.is_career_fit ? 'bg-[#F6D66D]' : 'bg-white'
                }`}
              >
                <div>
                  <div className="inline-block px-2.5 py-1 rounded-lg bg-[#FFF5E8] border border-[#252020] text-xs font-bold text-[#C83D42]">
                    {q.is_career_fit ? 'Career Discovery (RIASEC)' : q.niche_name || 'Mentor Quiz'}
                  </div>
                  <h2 className="font-display text-xl font-bold mt-2.5">{q.title}</h2>
                  <p className="text-sm text-[#4D4242] mt-1.5">{q.description}</p>
                </div>

                <div className="pt-3 border-t border-[#252020]/15 flex items-center justify-between text-xs text-[#252020] tabular-nums">
                  <span className="font-medium">
                    {q.question_count} questions · {q.is_career_fit ? 'Outspace Official' : `By ${q.author_name}`}
                  </span>
                  <span className="font-bold text-[#C83D42]">
                    {q.best_attempt_score !== null ? `Latest: ${q.best_attempt_score}%` : 'Start →'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

export function NewQuizPage() {
  const navigate = useNavigate();
  const [niches, setNiches] = useState<Niche[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [nicheSlug, setNicheSlug] = useState('software-engineering');
  const [questions, setQuestions] = useState([{ question: '', options: ['', '', ''], correct_index: 0 }]);

  useEffect(() => {
    apiFetch<{ niches: Niche[] }>('/api/niches')
      .then((d) => setNiches(d.niches))
      .catch(() => {});
  }, []);

  const addQuestion = () => {
    setQuestions((prev) => [...prev, { question: '', options: ['', '', ''], correct_index: 0 }]);
  };

  const removeQuestion = (idx: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ id: string }>('/api/quizzes', {
        method: 'POST',
        body: JSON.stringify({ title, description, niche_slug: nicheSlug, questions }),
      });
      toast.success('Quiz published!');
      navigate(`/quizzes/${res.id}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <AppShell title="Create Mentor Quiz">
      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-6">
        <Link to="/quizzes" className="inline-flex items-center gap-1.5 text-xs font-bold text-[#5A4F4F] hover:text-[#C83D42]">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Quizzes</span>
        </Link>

        <div className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 space-y-4">
          <h1 className="font-display text-2xl font-bold">
            Build a <span className="italic text-[#C83D42]">Multiple-Choice</span> Quiz
          </h1>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold mb-1">Quiz Title</label>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Intro to Product Design"
                className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/30 text-sm focus:outline-none focus:border-[#252020]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">Career Niche</label>
              <select
                value={nicheSlug}
                onChange={(e) => setNicheSlug(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/30 text-sm bg-white focus:outline-none focus:border-[#252020]"
              >
                {niches.map((n) => (
                  <option key={n.slug} value={n.slug}>
                    {n.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold mb-1">Description</label>
            <input
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What will students learn or check in this quiz?"
              className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/30 text-sm focus:outline-none focus:border-[#252020]"
            />
          </div>
        </div>

        {questions.map((q, qIdx) => (
          <div key={qIdx} className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-display font-bold text-sm">Question {qIdx + 1}</span>
              {questions.length > 1 && (
                <button type="button" onClick={() => removeQuestion(qIdx)} className="text-[#C83D42]">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            <input
              required
              value={q.question}
              onChange={(e) => {
                const copy = [...questions];
                copy[qIdx].question = e.target.value;
                setQuestions(copy);
              }}
              placeholder="Enter question..."
              className="w-full px-3.5 py-2.5 rounded-xl border-2 border-[#252020]/30 text-sm focus:outline-none focus:border-[#252020]"
            />

            <div className="space-y-2">
              <div className="text-xs font-bold text-[#5A4F4F]">Options (mark the correct answer)</div>
              {q.options.map((opt, optIdx) => (
                <div key={optIdx} className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name={`correct-${qIdx}`}
                    checked={q.correct_index === optIdx}
                    onChange={() => {
                      const copy = [...questions];
                      copy[qIdx].correct_index = optIdx;
                      setQuestions(copy);
                    }}
                    className="accent-[#C83D42]"
                  />
                  <input
                    required
                    value={opt}
                    onChange={(e) => {
                      const copy = [...questions];
                      copy[qIdx].options[optIdx] = e.target.value;
                      setQuestions(copy);
                    }}
                    placeholder={`Option ${optIdx + 1}`}
                    className="flex-1 px-3 py-2 rounded-xl border-2 border-[#252020]/30 text-sm focus:outline-none focus:border-[#252020]"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={addQuestion}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border-2 border-[#252020] bg-white text-xs font-bold hover:bg-[#FFF5E8]"
          >
            <Plus className="w-4 h-4" />
            <span>Add Question</span>
          </button>
          <button
            type="submit"
            className="px-6 py-2.5 rounded-xl bg-[#C83D42] border-2 border-[#252020] editorial-shadow-sm text-white text-sm font-bold hover:bg-[#B23237]"
          >
            Publish Quiz
          </button>
        </div>
      </form>
    </AppShell>
  );
}

export function TakeQuizPage() {
  const { id } = useParams();
  const [quiz, setQuiz] = useState<{ title: string; description: string; niche_name: string; author_name: string } | null>(
    null
  );
  const [questions, setQuestions] = useState<Array<{ id: string; question: string; options: Array<{ label: string }> }>>(
    []
  );
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<{
    score: number;
    earned_quiz_ace: boolean;
    result: {
      correct_count: number;
      total: number;
      breakdown: Array<{
        question: string;
        selected_index: number;
        correct_index: number;
        is_correct: boolean;
        options: Array<{ label: string }>;
      }>;
    };
  } | null>(null);

  useEffect(() => {
    if (!id) return;
    apiFetch<{
      quiz: { title: string; description: string; niche_name: string; author_name: string };
      questions: Array<{ id: string; question: string; options: Array<{ label: string }> }>;
    }>(`/api/quizzes/${id}`)
      .then((d) => {
        setQuiz(d.quiz);
        setQuestions(d.questions);
        setAnswers(new Array(d.questions.length).fill(-1));
      })
      .catch(() => {});
  }, [id]);

  const submitQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (answers.some((a) => a < 0)) {
      toast.error('Please answer every question first.');
      return;
    }
    try {
      const res = await apiFetch<typeof result>(`/api/quizzes/${id}/attempt`, {
        method: 'POST',
        body: JSON.stringify({ answers }),
      });
      setResult(res);
      if (res?.earned_quiz_ace) {
        toast.success('80%+ score! Quiz Ace badge unlocked!');
      }
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <AppShell title={quiz?.title || 'Quiz'}>
      <div className="max-w-3xl mx-auto space-y-6">
        <Link to="/quizzes" className="inline-flex items-center gap-1.5 text-xs font-bold text-[#5A4F4F] hover:text-[#C83D42]">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Quizzes</span>
        </Link>

        {!quiz ? (
          <div className="py-10 text-sm text-[#6B5E5E]">Loading quiz...</div>
        ) : result ? (
          <div className="space-y-6">
            <div className="bg-[#F6D66D] rounded-3xl border-2 border-[#252020] editorial-shadow p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-[#C83D42]">Quiz Complete</div>
                <h1 className="font-display text-2xl sm:text-3xl font-bold mt-1">
                  Score: {result.score}% ({result.result.correct_count}/{result.result.total})
                </h1>
                {result.earned_quiz_ace && (
                  <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-[#252020] bg-white border-2 border-[#252020] px-3 py-1 rounded-xl">
                    <Award className="w-4 h-4 text-[#C83D42]" />
                    <span>Quiz Ace Badge Awarded!</span>
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  setResult(null);
                  setAnswers(new Array(questions.length).fill(-1));
                }}
                className="px-4 py-2 rounded-xl border-2 border-[#252020] bg-white text-xs font-bold hover:bg-[#FFF5E8]"
              >
                Retake Quiz
              </button>
            </div>

            <div className="space-y-3">
              {result.result.breakdown.map((b, idx) => (
                <div key={idx} className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-5 space-y-2">
                  <div className="flex items-start gap-2">
                    {b.is_correct ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-5 h-5 text-[#C83D42] shrink-0 mt-0.5" />
                    )}
                    <div className="font-display font-bold text-sm">{b.question}</div>
                  </div>
                  <div className="pl-7 text-xs space-y-1">
                    <div className="text-[#5A4F4F]">
                      Your answer: <span className="font-bold text-[#252020]">{b.options[b.selected_index]?.label}</span>
                    </div>
                    {!b.is_correct && (
                      <div className="text-emerald-800">
                        Correct answer: <span className="font-bold">{b.options[b.correct_index]?.label}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <form onSubmit={submitQuiz} className="space-y-5">
            <div className="bg-[#F6D66D]/45 rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6">
              <div className="inline-block px-2.5 py-1 rounded-lg bg-white border border-[#252020] text-xs font-bold text-[#C83D42]">
                {quiz.niche_name}
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold mt-2">{quiz.title}</h1>
              <p className="text-sm text-[#4D4242] mt-1">{quiz.description}</p>
            </div>

            {questions.map((q, qIdx) => (
              <div key={q.id} className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-6 space-y-3">
                <div className="font-display font-bold text-base">
                  {qIdx + 1}. {q.question}
                </div>
                <div className="space-y-2">
                  {q.options.map((opt, optIdx) => (
                    <label
                      key={optIdx}
                      className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer text-sm font-medium transition-colors ${
                        answers[qIdx] === optIdx
                          ? 'border-[#252020] bg-[#F6D66D]/45'
                          : 'border-[#252020]/20 hover:border-[#252020]'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`q-${qIdx}`}
                        checked={answers[qIdx] === optIdx}
                        onChange={() => {
                          const copy = [...answers];
                          copy[qIdx] = optIdx;
                          setAnswers(copy);
                        }}
                        className="accent-[#C83D42]"
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}

            <button
              type="submit"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#C83D42] border-2 border-[#252020] editorial-shadow-sm text-white text-sm font-bold hover:bg-[#B23237]"
            >
              <BookOpen className="w-4 h-4" />
              <span>Submit Answers</span>
            </button>
          </form>
        )}
      </div>
    </AppShell>
  );
}
