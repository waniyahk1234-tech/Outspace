import React from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  Home,
  Compass,
  MessageSquare,
  CalendarCheck,
  Users,
  Award,
  BookOpen,
  CreditCard,
  ShieldCheck,
  Settings,
  UserCircle,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../lib/api';
import { Avatar, BrandLogo, Starburst } from './BrandMark';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFF5E8]">
        <div className="w-8 h-8 rounded-full border-2 border-[#C83D42] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (!user.onboarding_complete && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}

export function AppShell({ children, title }: { children: React.ReactNode; title?: string }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const prefersReduced = useReducedMotion();

  if (!user) {
    return <>{children}</>;
  }

  const navItems = [
    { to: '/dashboard', label: 'Dashboard', icon: Home },
    { to: '/explore', label: 'Explore', icon: Compass },
    { to: '/connections', label: 'Connections', icon: Users, badge: user.pending_requests_count },
    { to: '/messages', label: 'Messages', icon: MessageSquare },
    { to: '/sessions', label: 'My Sessions', icon: CalendarCheck },
    { to: '/groups', label: 'Groups', icon: Users },
    { to: '/quizzes', label: 'Quizzes', icon: BookOpen },
    { to: `/u/${user.id}`, label: 'Career Passport', icon: Award },
    ...(user.role === 'student' ? [{ to: '/pricing', label: 'Pricing & Plan', icon: CreditCard }] : []),
    ...(user.role === 'admin' ? [{ to: '/admin', label: 'Admin Review', icon: ShieldCheck }] : []),
    { to: '/settings', label: 'Settings', icon: Settings },
  ];

  const topQuickNav = [
    { to: '/dashboard', label: 'Home' },
    { to: '/explore', label: 'Explore' },
    { to: '/groups', label: 'Groups' },
    { to: '/sessions', label: 'Sessions' },
    { to: '/quizzes', label: 'Quizzes' },
  ];

  const mobileTabs = [
    { to: '/dashboard', label: 'Home', icon: Home },
    { to: '/explore', label: 'Explore', icon: Compass },
    { to: '/messages', label: 'Messages', icon: MessageSquare },
    { to: '/sessions', label: 'Sessions', icon: CalendarCheck },
    { to: `/u/${user.id}`, label: 'Profile', icon: UserCircle },
  ];

  const isRouteActive = (to: string) => {
    if (to === '/dashboard') return location.pathname === '/dashboard';
    return location.pathname === to || location.pathname.startsWith(`${to}/`);
  };

  return (
    <div className="min-h-screen bg-[#FFF5E8] text-[#252020] flex flex-col md:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-[#FFF5E8] border-r-2 border-[#252020]/15">
        <div className="h-16 px-5 flex items-center justify-between border-b border-[#252020]/10">
          <Link to="/dashboard">
            <BrandLogo />
          </Link>
          <Starburst size={18} color="#F6D66D" />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isRouteActive(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`relative flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap ${
                  active ? 'text-[#C83D42]' : 'text-[#4D4242] hover:text-[#252020]'
                }`}
              >
                {active && (
                  <motion.div
                    layoutId="sidebar-active-slide"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    className="absolute inset-0 bg-white rounded-xl border-2 border-[#252020] editorial-shadow-sm"
                  />
                )}
                <span className="relative z-10 flex items-center gap-3">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </span>
                {item.badge ? (
                  <span className="relative z-10 text-xs font-mono font-bold text-[#C83D42] tabular-nums">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#252020]/10">
          {user.role === 'student' && user.subscription && user.subscription.effective_plan !== 'institution' && (
            <div className="mb-3 p-3.5 rounded-2xl bg-[#F6D66D] border-2 border-[#252020] editorial-shadow-sm">
              <div className="font-display text-xs font-bold text-[#252020]">
                {user.subscription.effective_plan === 'trial'
                  ? `${user.subscription.days_left}d left in free trial`
                  : user.subscription.effective_plan === 'expired'
                    ? 'Trial ended — unlock mentors'
                    : `${user.subscription.effective_plan.toUpperCase()} active`}
              </div>
              <Link
                to="/pricing"
                className="mt-2 inline-flex items-center justify-center w-full py-1.5 px-3 rounded-xl bg-[#C83D42] border border-[#252020] text-white text-xs font-bold hover:bg-[#B23237] transition-colors"
              >
                {user.subscription.effective_plan === 'monthly' || user.subscription.effective_plan === 'yearly'
                  ? 'Manage Plan'
                  : 'Upgrade Plan'}
              </Link>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 bg-white rounded-xl border border-[#252020]/15 p-2.5">
            <Link to={`/u/${user.id}`} className="flex items-center gap-2.5 min-w-0">
              <Avatar src={user.avatar_url} name={user.full_name} size="sm" />
              <div className="min-w-0">
                <div className="text-sm font-bold truncate">{user.full_name}</div>
                <div className="text-[11px] text-[#6B5E5E] capitalize">{user.role}</div>
              </div>
            </Link>
            <button
              onClick={async () => {
                await logout();
                navigate('/');
              }}
              title="Log out"
              className="p-2 rounded-lg text-[#6B5E5E] hover:text-[#C83D42] hover:bg-[#FFF5E8] transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 md:pl-64 flex flex-col min-h-screen pb-20 md:pb-0">
        {/* Top Bar with sliding active word underline */}
        <header className="sticky top-0 z-30 h-14 md:h-16 bg-[#FFF5E8]/95 backdrop-blur border-b border-[#252020]/12 px-4 md:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6 min-w-0">
            <Link to="/dashboard" className="md:hidden">
              <BrandLogo />
            </Link>
            <span className="hidden lg:block font-display text-sm font-bold text-[#252020] truncate">
              {title || 'Outspace'}
            </span>
            <nav className="hidden md:flex items-center gap-5" aria-label="Quick navigation">
              {topQuickNav.map((item) => {
                const active = isRouteActive(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`relative py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                      active ? 'text-[#C83D42]' : 'text-[#6B5E5E] hover:text-[#252020]'
                    }`}
                  >
                    <span>{item.label}</span>
                    {active && (
                      <motion.div
                        layoutId="topbar-nav-slide"
                        transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                        className="absolute left-0 right-0 -bottom-0.5 h-[2.5px] rounded-full bg-[#C83D42]"
                      />
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {user.role === 'student' && (
              <Link
                to="/quiz/career-fit"
                className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border-2 border-[#252020] bg-[#F6D66D] text-xs font-bold text-[#252020] hover:-translate-y-0.5 transition-transform whitespace-nowrap"
              >
                <span>Career Fit Quiz</span>
              </Link>
            )}
            <Link to="/settings" className="md:hidden p-2 text-[#252020]" aria-label="Settings">
              <Settings className="w-5 h-5" />
            </Link>
            <Link to={`/u/${user.id}`} className="hidden md:flex items-center gap-2.5">
              <Avatar src={user.avatar_url} name={user.full_name} size="sm" />
            </Link>
          </div>
        </header>

        {/* Smooth slide transition on navbar page navigation */}
        <motion.main
          key={location.pathname}
          initial={prefersReduced ? false : { opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="flex-1 px-4 md:px-8 py-6 max-w-[1200px] w-full mx-auto"
        >
          {children}
        </motion.main>
      </div>

      {/* Mobile Bottom Tab Bar with sliding top indicator */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t-2 border-[#252020] h-16 px-2 flex items-center justify-around"
      >
        {mobileTabs.map((tab) => {
          const Icon = tab.icon;
          const active = isRouteActive(tab.to);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={`relative flex flex-col items-center justify-center min-w-[56px] min-h-[44px] rounded-xl text-[11px] font-bold transition-colors ${
                active ? 'text-[#C83D42]' : 'text-[#6B5E5E]'
              }`}
            >
              {active && (
                <motion.div
                  layoutId="mobile-tab-slide"
                  transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                  className="absolute -top-2 w-8 h-1 rounded-full bg-[#C83D42]"
                />
              )}
              <Icon className="w-5 h-5 mb-0.5" />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
