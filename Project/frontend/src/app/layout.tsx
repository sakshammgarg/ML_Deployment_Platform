import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/lib/providers';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';

export const metadata: Metadata = {
  title: 'ML Platform — Self-Optimizing Deployment',
  description: 'Monitor, deploy and A/B test machine learning models in real-time',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>
          <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
            <Sidebar />
            <div className="flex flex-col flex-1 overflow-hidden">
              <Header />
              <main className="flex-1 overflow-y-auto p-6 animate-fade-in"
                style={{ background: 'var(--bg-primary)' }}>
                {/* Subtle grid background */}
                <div
                  className="fixed inset-0 pointer-events-none"
                  style={{
                    backgroundImage:
                      'linear-gradient(rgba(0,212,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.025) 1px, transparent 1px)',
                    backgroundSize: '40px 40px',
                    zIndex: 0,
                  }}
                />
                <div className="relative z-10">{children}</div>
              </main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
