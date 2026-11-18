import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Download, CheckCircle2, XCircle, ArrowLeft, ExternalLink } from 'lucide-react';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { AppShell } from '../components/AppShell';
import { BrandLogo, EmptyStateArt, Starburst } from '../components/BrandMark';
import { apiFetch } from '../lib/api';
import { formatPKTDateOnly } from '../shared/types';

interface CertDetail {
  id: string;
  student_id: string;
  mentor_id: string;
  title: string;
  verify_code: string;
  issued_at: string;
  student_name: string;
  student_grade: string | null;
  student_school: string | null;
  mentor_name: string;
  mentor_profession: string | null;
  mentor_company: string | null;
}

export function CertificateDetailPage() {
  const { id } = useParams();
  const [cert, setCert] = useState<CertDetail | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    apiFetch<{ certificate: CertDetail }>(`/api/certificates/${id}`)
      .then(async (d) => {
        setCert(d.certificate);
        const verifyUrl = `${window.location.origin}/verify/${d.certificate.verify_code}`;
        const qr = await QRCode.toDataURL(verifyUrl, { width: 220, margin: 1 });
        setQrDataUrl(qr);
      })
      .catch((err) => toast.error((err as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  const downloadPdf = async () => {
    if (!cert) return;
    const verifyUrl = `${window.location.origin}/verify/${cert.verify_code}`;
    const qr = qrDataUrl || (await QRCode.toDataURL(verifyUrl, { width: 220, margin: 1 }));

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();

    // Warm cream background + editorial border
    doc.setFillColor(255, 245, 232);
    doc.rect(0, 0, w, h, 'F');
    doc.setDrawColor(37, 32, 32);
    doc.setLineWidth(1.5);
    doc.rect(12, 12, w - 24, h - 24);
    doc.setDrawColor(200, 61, 66);
    doc.setLineWidth(0.9);
    doc.rect(16, 16, w - 32, h - 32);

    // Brand
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(200, 61, 66);
    doc.text('OUTSPACE', 26, 32);

    doc.setFontSize(10);
    doc.setTextColor(90, 79, 79);
    doc.text('CAREER PASSPORT · VERIFIED MENTORSHIP CERTIFICATE', 26, 39);

    // Main title
    doc.setFontSize(30);
    doc.setTextColor(37, 32, 32);
    doc.text('Certificate of Career Exploration', 26, 62);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(13);
    doc.setTextColor(90, 79, 79);
    doc.text('This certifies that', 26, 78);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(26);
    doc.setTextColor(37, 32, 32);
    doc.text(cert.student_name, 26, 92);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(13);
    doc.setTextColor(90, 79, 79);
    doc.text('completed a verified 1:1 career mentorship session on', 26, 108);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.setTextColor(200, 61, 66);
    doc.text(cert.title, 26, 120, { maxWidth: 190 });

    // Mentor & Date footer
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(37, 32, 32);
    doc.text(`Mentor: ${cert.mentor_name}`, 26, 152);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(90, 79, 79);
    const mentorMeta = [cert.mentor_profession, cert.mentor_company].filter(Boolean).join(' @ ');
    if (mentorMeta) doc.text(mentorMeta, 26, 159);
    doc.text(`Issued on ${formatPKTDateOnly(cert.issued_at)} (PKT)`, 26, 170);
    doc.text(`Verification Code: ${cert.verify_code}`, 26, 177);

    // QR Code
    doc.addImage(qr, 'PNG', w - 72, h - 76, 44, 44);
    doc.setFontSize(9);
    doc.text('Scan to verify', w - 61, h - 26);

    doc.save(`outspace-certificate-${cert.verify_code}.pdf`);
    toast.success('Certificate PDF downloaded!');
  };

  return (
    <AppShell title="Verified Certificate">
      {loading ? (
        <div className="py-12 text-center text-sm text-[#6B5E5E]">Loading certificate...</div>
      ) : !cert ? (
        <EmptyStateArt
          title="Certificate not found"
          subtitle="We could not locate this certificate record."
          action={
            <Link to="/dashboard" className="px-4 py-2 rounded-xl bg-[#C83D42] border-2 border-[#252020] text-white text-xs font-bold">
              Back to Dashboard
            </Link>
          }
        />
      ) : (
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link
              to={`/u/${cert.student_id}`}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#5A4F4F] hover:text-[#C83D42]"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Career Passport</span>
            </Link>

            <div className="flex items-center gap-2.5">
              <Link
                to={`/verify/${cert.verify_code}`}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border-2 border-[#252020] bg-white text-xs font-bold hover:bg-[#F6D66D]/35"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Public Verify Link</span>
              </Link>
              <button
                onClick={downloadPdf}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#C83D42] border-2 border-[#252020] editorial-shadow-sm text-white text-xs font-bold hover:bg-[#B23237]"
              >
                <Download className="w-4 h-4" />
                <span>Download PDF</span>
              </button>
            </div>
          </div>

          {/* Visual Certificate Preview */}
          <div className="bg-[#F6D66D]/50 rounded-3xl border-2 border-[#252020] editorial-shadow p-4 sm:p-8">
            <div className="border-2 border-[#252020] rounded-2xl p-6 sm:p-10 bg-white space-y-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <BrandLogo />
                    <Starburst size={18} color="#F6D66D" />
                  </div>
                  <div className="text-xs font-mono font-bold text-[#6B5E5E] mt-2">
                    CAREER PASSPORT · VERIFIED MENTORSHIP CERTIFICATE
                  </div>
                </div>
                <div className="text-right font-mono text-xs text-[#6B5E5E] bg-[#FFF5E8] px-3 py-2 rounded-xl border border-[#252020]">
                  <div>CODE</div>
                  <div className="font-bold text-sm text-[#252020]">{cert.verify_code}</div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-sm text-[#5A4F4F]">This certifies that</div>
                <h1 className="font-display text-3xl sm:text-4xl font-bold text-[#252020]">{cert.student_name}</h1>
                <div className="text-sm text-[#5A4F4F]">
                  completed a verified 1:1 career mentorship session focused on
                </div>
                <div className="font-display text-xl sm:text-2xl font-bold italic text-[#C83D42]">{cert.title}</div>
              </div>

              <div className="pt-6 border-t-2 border-[#252020]/15 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
                <div className="space-y-1">
                  <div className="font-display font-bold text-base">{cert.mentor_name}</div>
                  <div className="text-xs text-[#5A4F4F]">
                    {[cert.mentor_profession, cert.mentor_company].filter(Boolean).join(' @ ')}
                  </div>
                  <div className="text-xs text-[#6B5E5E] pt-1 font-mono">
                    Issued {formatPKTDateOnly(cert.issued_at)} (PKT)
                  </div>
                </div>

                {qrDataUrl && (
                  <div className="flex flex-col items-center">
                    <img
                      src={qrDataUrl}
                      alt="Verification QR Code"
                      className="w-24 h-24 rounded-xl border-2 border-[#252020] p-1 bg-white"
                    />
                    <span className="text-[10px] font-mono font-bold text-[#5A4F4F] mt-1">Scan to verify</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

export function VerifyCertificatePage() {
  const { code } = useParams();
  const [status, setStatus] = useState<'loading' | 'verified' | 'not_found'>('loading');
  const [cert, setCert] = useState<CertDetail | null>(null);

  useEffect(() => {
    if (!code) return;
    apiFetch<{ verified: boolean; certificate: CertDetail }>(`/api/verify/${code}`)
      .then((d) => {
        setCert(d.certificate);
        setStatus('verified');
      })
      .catch(() => setStatus('not_found'));
  }, [code]);

  return (
    <div className="min-h-screen bg-[#FFF5E8] flex flex-col text-[#252020]">
      <header className="h-16 border-b border-[#252020]/15 px-4 md:px-8 flex items-center justify-between max-w-[1100px] w-full mx-auto">
        <Link to="/">
          <BrandLogo />
        </Link>
        <Link to="/signup" className="text-xs font-bold text-[#C83D42] hover:underline">
          Explore Outspace →
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white rounded-3xl border-2 border-[#252020] editorial-shadow p-8 space-y-5">
          {status === 'loading' ? (
            <div className="text-center text-sm text-[#6B5E5E]">Checking certificate code...</div>
          ) : status === 'not_found' || !cert ? (
            <div className="text-center space-y-3">
              <XCircle className="w-12 h-12 text-[#C83D42] mx-auto" />
              <h1 className="font-display text-2xl font-bold">Certificate Not Found</h1>
              <p className="text-sm text-[#5A4F4F]">
                We could not find a certificate matching code <span className="font-mono font-bold">{code}</span>.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center gap-3 text-emerald-700">
                <CheckCircle2 className="w-8 h-8 shrink-0" />
                <div>
                  <h1 className="font-display text-2xl font-bold text-[#252020]">Verified Certificate</h1>
                  <div className="text-xs font-mono text-[#6B5E5E]">Code: {cert.verify_code}</div>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-[#FFF5E8] border-2 border-[#252020] space-y-2.5 text-sm">
                <div>
                  <span className="text-[#6B5E5E]">Student:</span>{' '}
                  <span className="font-bold text-[#252020]">{cert.student_name}</span>
                </div>
                <div>
                  <span className="text-[#6B5E5E]">Session Title:</span>{' '}
                  <span className="font-bold text-[#C83D42]">{cert.title}</span>
                </div>
                <div>
                  <span className="text-[#6B5E5E]">Verified Mentor:</span>{' '}
                  <span className="font-bold text-[#252020]">{cert.mentor_name}</span>
                  {cert.mentor_profession ? ` (${cert.mentor_profession})` : ''}
                </div>
                <div>
                  <span className="text-[#6B5E5E]">Issued Date:</span>{' '}
                  <span className="font-mono">{formatPKTDateOnly(cert.issued_at)} (PKT)</span>
                </div>
              </div>

              <Link
                to={`/u/${cert.student_id}`}
                className="inline-flex justify-center w-full py-2.5 px-4 rounded-xl bg-[#F6D66D] border-2 border-[#252020] text-xs font-bold hover:-translate-y-0.5 transition-transform"
              >
                View {cert.student_name}&apos;s Career Passport →
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
