import { Link } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';
import {
  Zap, Tv, Upload, Sparkles, Download,
  ArrowRight, Play, ChevronRight, Layers, Type,
} from 'lucide-react';

export default function Landing() {
  const { theme } = useTheme();
  const dark = theme === 'dark';

  const features = [
    { icon: Tv, title: 'Twitch Integration', desc: 'Paste any Twitch video URL and we\'ll extract the best moments automatically.' },
    { icon: Upload, title: 'Upload Any Format', desc: 'Support for MP4, MOV, AVI, MKV, WebM and more. No format restrictions.' },
    { icon: Sparkles, title: 'Smart AI Detection', desc: 'Advanced neural networks analyze your content to automatically identify and extract the most viral moments.' },
    { icon: Layers, title: 'Video Templates', desc: 'Choose from professionally designed templates for Shorts, Reels, and TikTok.' },
    { icon: Type, title: 'Auto Subtitles', desc: 'Generate accurate, styled subtitles automatically synced to your clips.' },
    { icon: Download, title: 'Direct Download', desc: 'Download your clips instantly. No watermarks, no waiting.' },
  ];

  const steps = [
    { n: '01', title: 'Upload or Paste', desc: 'Add your Twitch URL or upload a video file in any format.' },
    { n: '02', title: 'Configure', desc: 'Set clip duration, aspect ratio, template, and subtitle preferences.' },
    { n: '03', title: 'Generate & Download', desc: 'AI creates your clips. Preview and download them instantly.' },
  ];

  return (
    <div className={`min-h-screen transition-colors duration-300 ${dark ? 'bg-gray-950 text-white' : 'bg-white text-gray-900'}`}>
      {/* Hero */}
      <section className="relative overflow-hidden pt-12 pb-24 lg:pt-20 lg:pb-32">
        {/* Background effects */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 left-1/2 h-[800px] w-[800px] -translate-x-1/2 rounded-full bg-violet-600/10 blur-[130px]" />
          <div className="absolute top-20 right-0 h-[500px] w-[500px] rounded-full bg-fuchsia-600/10 blur-[110px]" />
          <div className="absolute bottom-0 left-0 h-[400px] w-[400px] rounded-full bg-blue-600/10 blur-[90px]" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-4xl text-center">
            {/* Logo in Hero */}
            <div className="relative mb-10 flex justify-center animate-in fade-in slide-in-from-bottom-4 duration-700">
              {/* Spray glow effect */}
              {dark && (
                <div className="absolute inset-0 mx-auto h-[120%] w-[120%] -translate-y-[10%] bg-white/10 blur-[60px] rounded-full" />
              )}
              <img src="/logo_full.png" alt="TubeBite Logo" className="relative z-10 h-48 w-auto object-contain lg:h-80" />
            </div>

            {/* Badge */}
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-1.5 text-sm font-medium text-violet-400 backdrop-blur-sm">
              <Sparkles className="h-4 w-4" />
              Revolutionize your content creation
              <ChevronRight className="h-3.5 w-3.5" />
            </div>

            <h1 className="text-5xl font-black leading-[1.1] tracking-tight sm:text-7xl lg:text-8xl">
              From Long Form to
              <span className="mt-2 block bg-gradient-to-r from-violet-400 via-fuchsia-400 to-pink-400 bg-clip-text text-transparent">
                Viral Gold
              </span>
            </h1>

            <p className={`mx-auto mt-8 max-w-2xl text-lg leading-relaxed sm:text-xl lg:text-2xl ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
              TubeBite uses advanced AI to detect the most engaging moments in your videos and Twitch streams,
              turning them into perfect Shorts, Reels, and TikToks in seconds.
            </p>

            {/* CTA */}
            <div className="mt-12 flex flex-col items-center justify-center gap-5 sm:flex-row">
              <Link
                to="/signup"
                className="group flex h-14 items-center gap-3 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-10 text-lg font-bold text-white shadow-[0_20px_50px_-15px_rgba(124,58,237,0.5)] transition-all hover:scale-[1.03] hover:shadow-[0_25px_60px_-15px_rgba(124,58,237,0.6)]"
              >
                Start Clipping Free
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                to="/login"
                className={`flex h-14 items-center gap-3 rounded-2xl border px-10 text-lg font-bold transition-all hover:scale-[1.03] ${dark
                  ? 'border-white/10 bg-white/5 text-white hover:bg-white/10'
                  : 'border-gray-200 bg-gray-50 text-gray-900 hover:bg-gray-100'
                  }`}
              >
                <Play className="h-5 w-5 fill-current" /> Sign In
              </Link>
            </div>
          </div>

        </div>
      </section>

      {/* How it works */}
      <section className={`border-t py-24 ${dark ? 'border-white/5 bg-gray-950' : 'border-gray-100 bg-gray-50'}`}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-violet-400">How it works</p>
            <h2 className="mt-3 text-3xl font-bold sm:text-4xl">Three steps to viral clips</h2>
          </div>
          <div className="mt-16 grid gap-8 md:grid-cols-3">
            {steps.map((s) => (
              <div key={s.n} className="relative text-center">
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-2xl font-extrabold text-white shadow-xl shadow-violet-500/20">
                  {s.n}
                </div>
                <h3 className="text-xl font-bold">{s.title}</h3>
                <p className={`mt-2 leading-relaxed ${dark ? 'text-gray-400' : 'text-gray-600'}`}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className={`border-t py-24 ${dark ? 'border-white/5' : 'border-gray-100'}`}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-violet-400">Features</p>
            <h2 className="mt-3 text-3xl font-bold sm:text-4xl">Everything you need to create</h2>
          </div>
          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className={`group rounded-2xl border p-6 transition-all hover:scale-[1.02] ${dark
                  ? 'border-white/5 bg-white/[0.02] hover:border-violet-500/30 hover:bg-violet-500/5'
                  : 'border-gray-200 bg-white hover:border-violet-300 hover:shadow-lg'
                  }`}
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 text-violet-400 transition-colors group-hover:from-violet-500/30 group-hover:to-fuchsia-500/30">
                  <f.icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold">{f.title}</h3>
                <p className={`mt-2 text-sm leading-relaxed ${dark ? 'text-gray-400' : 'text-gray-600'}`}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className={`border-t py-24 ${dark ? 'border-white/5' : 'border-gray-100'}`}>
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
          <h2 className="text-3xl font-bold sm:text-4xl">
            Ready to create viral clips?
          </h2>
          <p className={`mt-4 text-lg ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
            Join thousands of content creators who use Tube Bite to grow their audience.
          </p>
          <Link
            to="/signup"
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-8 py-4 text-base font-semibold text-white shadow-2xl shadow-violet-500/25 hover:shadow-violet-500/40 transition-all hover:scale-[1.02]"
          >
            <Zap className="h-5 w-5" /> Start Creating Now
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className={`border-t py-12 ${dark ? 'border-white/5' : 'border-gray-100'}`}>
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6">
          <div className="flex flex-col items-center justify-center gap-6">
            <div className="relative">
              {/* Subtle spray glow for footer - Increased for more visibility */}
              {dark && (
                <div className="absolute inset-0 bg-white/15 blur-[60px] rounded-full scale-[2]" />
              )}
              <img src="/logo_full.png" alt="TubeBite" className="relative z-10 h-40 w-auto opacity-80" />
            </div>
            <div className="flex gap-8 text-sm font-medium text-gray-500">
              <Link to="/login" className="hover:text-violet-400 transition-colors">Login</Link>
              <Link to="/signup" className="hover:text-violet-400 transition-colors">Sign Up</Link>
              <a href="#" className="hover:text-violet-400 transition-colors">Privacy</a>
              <a href="#" className="hover:text-violet-400 transition-colors">Terms</a>
            </div>
            <p className={`text-sm ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
              © {new Date().getFullYear()} TubeBite. All rights reserved. Built with AI.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
