/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider } from './lib/api';
import { RequireAuth } from './components/AppShell';
import LandingPage from './pages/LandingPage';
import { LoginPage, SignupPage } from './pages/AuthPages';
import OnboardingPage from './pages/OnboardingPage';
import CareerFitQuizPage from './pages/CareerFitQuizPage';
import DashboardPage from './pages/DashboardPage';
import ExplorePage from './pages/ExplorePage';
import CareerDetailPage from './pages/CareerDetailPage';
import ProfilePage from './pages/ProfilePage';
import ConnectionsPage from './pages/ConnectionsPage';
import MessagesPage from './pages/MessagesPage';
import { GroupDetailPage, GroupsListPage } from './pages/GroupsPage';
import SessionsPage from './pages/SessionsPage';
import { NewQuizPage, QuizzesListPage, TakeQuizPage } from './pages/QuizzesPages';
import { CertificateDetailPage, VerifyCertificatePage } from './pages/CertificatesPages';
import PricingPage from './pages/PricingPage';
import { AdminPage, NotFoundPage, SettingsPage } from './pages/AdminAndSettingsPages';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" richColors />
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/verify/:code" element={<VerifyCertificatePage />} />
          <Route path="/u/:id" element={<ProfilePage />} />

          {/* Onboarding */}
          <Route
            path="/onboarding"
            element={
              <RequireAuth>
                <OnboardingPage />
              </RequireAuth>
            }
          />

          {/* Protected Authenticated Routes */}
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <DashboardPage />
              </RequireAuth>
            }
          />
          <Route
            path="/quiz/career-fit"
            element={
              <RequireAuth>
                <CareerFitQuizPage />
              </RequireAuth>
            }
          />
          <Route
            path="/explore"
            element={
              <RequireAuth>
                <ExplorePage />
              </RequireAuth>
            }
          />
          <Route
            path="/careers/:slug"
            element={
              <RequireAuth>
                <CareerDetailPage />
              </RequireAuth>
            }
          />
          <Route
            path="/connections"
            element={
              <RequireAuth>
                <ConnectionsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/messages"
            element={
              <RequireAuth>
                <MessagesPage />
              </RequireAuth>
            }
          />
          <Route
            path="/messages/:connectionId"
            element={
              <RequireAuth>
                <MessagesPage />
              </RequireAuth>
            }
          />
          <Route
            path="/groups"
            element={
              <RequireAuth>
                <GroupsListPage />
              </RequireAuth>
            }
          />
          <Route
            path="/groups/:id"
            element={
              <RequireAuth>
                <GroupDetailPage />
              </RequireAuth>
            }
          />
          <Route
            path="/sessions"
            element={
              <RequireAuth>
                <SessionsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/quizzes"
            element={
              <RequireAuth>
                <QuizzesListPage />
              </RequireAuth>
            }
          />
          <Route
            path="/quizzes/new"
            element={
              <RequireAuth>
                <NewQuizPage />
              </RequireAuth>
            }
          />
          <Route
            path="/quizzes/:id"
            element={
              <RequireAuth>
                <TakeQuizPage />
              </RequireAuth>
            }
          />
          <Route
            path="/certificates/:id"
            element={
              <RequireAuth>
                <CertificateDetailPage />
              </RequireAuth>
            }
          />
          <Route
            path="/pricing"
            element={
              <RequireAuth>
                <PricingPage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAuth>
                <AdminPage />
              </RequireAuth>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireAuth>
                <SettingsPage />
              </RequireAuth>
            }
          />

          {/* 404 */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
