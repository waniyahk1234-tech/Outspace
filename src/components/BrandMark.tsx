import React, { useState } from 'react';
import {
  Code2,
  Palette,
  Stethoscope,
  Scale,
  Brain,
  Compass,
  Mic,
  BarChart3,
  Rocket,
  Calculator,
  Award,
  Sparkles,
  Trophy,
  Star,
  BookOpen,
  MessageSquareHeart,
  BadgeCheck,
  HeartHandshake,
  Video,
} from 'lucide-react';
import { BADGE_META } from '../shared/types';

export function BrandLogo({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 whitespace-nowrap shrink-0 select-none ${className}`}
      aria-label="Outpase"
    >
      <svg width="34" height="32" viewBox="0 0 38 36" fill="none" aria-hidden="true" className="shrink-0">
        {/* Upper-left ring arc */}
        <path
          d="M 24.6 10.2 A 11.5 11.5 0 1 0 7.2 25.0"
          stroke="#C83D42"
          strokeWidth="4.4"
          strokeLinecap="butt"
        />
        {/* Lower-right ring arc */}
        <path
          d="M 10.6 28.6 A 11.5 11.5 0 0 0 28.4 15.6"
          stroke="#C83D42"
          strokeWidth="4.4"
          strokeLinecap="butt"
        />
        {/* Diagonal upward swoosh arrow */}
        <path
          d="M 2.2 27.6 Q 15.8 19.6 28.4 10.4 L 25.5 8.1 L 35.4 5.8 L 31.6 15.2 L 29.7 12.6 Q 16.5 21.8 2.2 27.6 Z"
          fill="#C83D42"
        />
      </svg>
      <span className="font-display text-[22px] font-bold tracking-[-0.03em] text-[#252020] leading-none">
        utpase
      </span>
    </span>
  );
}

export function Starburst({
  color = '#F6D66D',
  size = 24,
  className = '',
}: {
  color?: string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <path
        d="M14 1.5L16.8 10.2L25.8 10.2L18.6 15.5L21.3 24.4L14 19L6.7 24.4L9.4 15.5L2.2 10.2L11.2 10.2L14 1.5Z"
        fill={color}
        stroke="#252020"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SparkDoodle({ className = '' }: { className?: string }) {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true" className={className}>
      <path
        d="M13 2C13.6 8.6 17.4 12.4 24 13C17.4 13.6 13.6 17.4 13 24C12.4 17.4 8.6 13.6 2 13C8.6 12.4 12.4 8.6 13 2Z"
        fill="#F6D66D"
        stroke="#252020"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function OrbitDoodle({ className = '' }: { className?: string }) {
  return (
    <svg width="46" height="30" viewBox="0 0 46 30" fill="none" aria-hidden="true" className={className}>
      <ellipse cx="23" cy="15" rx="20" ry="8" transform="rotate(-14 23 15)" stroke="#C83D42" strokeWidth="2" />
      <circle cx="23" cy="15" r="6" fill="#F7A98A" stroke="#252020" strokeWidth="1.8" />
      <circle cx="38" cy="10" r="2.5" fill="#F6D66D" stroke="#252020" strokeWidth="1.3" />
    </svg>
  );
}

export function EmptyStateArt({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border-2 border-[#252020] editorial-shadow-sm p-8 text-center flex flex-col items-center space-y-3">
      <div className="w-16 h-16 rounded-2xl bg-[#FFF5E8] border-2 border-[#252020] flex items-center justify-center">
        <OrbitDoodle />
      </div>
      <div className="font-display text-lg font-bold text-[#252020]">{title}</div>
      <p className="text-sm text-[#5A4F4F] max-w-md">{subtitle}</p>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

export function Avatar({
  src,
  name,
  size = 'md',
  className = '',
}: {
  src?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  const dims =
    size === 'sm'
      ? 'w-9 h-9 text-xs'
      : size === 'lg'
        ? 'w-14 h-14 text-base'
        : size === 'xl'
          ? 'w-24 h-24 text-2xl'
          : 'w-11 h-11 text-sm';

  const initials = (name || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

  const palette = ['bg-[#F6D66D]', 'bg-[#F7A98A]', 'bg-[#FFF5E8]', 'bg-[#FADFA1]'];
  const colorIndex = name ? name.charCodeAt(0) % palette.length : 0;

  if (!src || failed) {
    return (
      <div
        className={`${dims} ${palette[colorIndex]} rounded-2xl border-2 border-[#252020] flex items-center justify-center font-display font-bold text-[#252020] shrink-0 select-none ${className}`}
        aria-label={name}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${dims} rounded-2xl object-cover border-2 border-[#252020]/85 shrink-0 ${className}`}
    />
  );
}

export function NicheIcon({ name, className = 'w-5 h-5' }: { name: string; className?: string }) {
  const map: Record<string, React.ComponentType<{ className?: string }>> = {
    Code2,
    Palette,
    Stethoscope,
    Scale,
    Brain,
    Compass,
    Mic,
    BarChart3,
    Rocket,
    Calculator,
    HeartHandshake,
  };
  const Icon = map[name] || Compass;
  return <Icon className={className} />;
}

export function BadgeChip({ type, label }: { type: string; label: string }) {
  const meta = BADGE_META[type] || {
    description: label,
    accent: 'bg-[#F6D66D]',
  };
  const icons: Record<string, React.ComponentType<{ className?: string }>> = {
    explorer: Compass,
    first_session: Sparkles,
    three_sessions: Trophy,
    seminar_5: Star,
    quiz_ace: BookOpen,
    contributor: MessageSquareHeart,
    course_fellow: Video,
    competition_honours: Trophy,
  };
  const stickerColors: Record<string, string> = {
    explorer: 'bg-[#F6D66D]',
    first_session: 'bg-[#F7A98A]',
    three_sessions: 'bg-[#C83D42] text-white',
    seminar_5: 'bg-[#F6D66D]',
    quiz_ace: 'bg-[#F7A98A]',
    contributor: 'bg-[#FFF5E8]',
    course_fellow: 'bg-[#F6D66D]',
    competition_honours: 'bg-[#C83D42] text-white',
  };
  const Icon = icons[type] || Award;
  const bg = stickerColors[type] || 'bg-[#F6D66D]';
  const isRed = type === 'three_sessions' || type === 'competition_honours';

  return (
    <div
      title={meta.description}
      className={`inline-flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl border-2 border-[#252020] sticker-shadow ${bg} transition-transform duration-150 hover:-rotate-1 hover:-translate-y-0.5`}
    >
      <div
        className={`w-8 h-8 rounded-xl border border-[#252020] flex items-center justify-center shrink-0 ${
          isRed ? 'bg-white text-[#C83D42]' : 'bg-white text-[#252020]'
        }`}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-left">
        <div className="font-display text-xs font-bold leading-tight whitespace-nowrap">{label}</div>
        <div className={`text-[11px] leading-tight mt-0.5 ${isRed ? 'text-white/90' : 'text-[#4D4242]'}`}>
          {meta.description}
        </div>
      </div>
    </div>
  );
}

export function VerifiedIcon({ className = 'w-4 h-4 text-[#C83D42]' }: { className?: string }) {
  return <BadgeCheck className={className} aria-label="Verified Mentor" />;
}
