import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { HostPage } from "./pages/HostPage";
import { PlayerPage } from "./pages/PlayerPage";
import { useState, useEffect } from "react";

function AnimatedCounter({ target, suffix = "" }: { target: string; suffix?: string }) {
  const [display, setDisplay] = useState("0");
  useEffect(() => {
    const num = parseFloat(target);
    if (isNaN(num)) { setDisplay(target); return; }
    let start = 0;
    const duration = 1500;
    const startTime = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      start = num * eased;
      setDisplay(Number.isInteger(num) ? Math.floor(start).toString() : start.toFixed(2));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target]);
  return <>{display}{suffix}</>;
}

function FloatingParticles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={i}
          className="absolute w-1 h-1 rounded-full bg-gold/30"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animation: `float ${3 + Math.random() * 4}s ease-in-out infinite`,
            animationDelay: `${Math.random() * 5}s`,
            opacity: 0.2 + Math.random() * 0.4,
            width: `${2 + Math.random() * 3}px`,
            height: `${2 + Math.random() * 3}px`,
          }}
        />
      ))}
    </div>
  );
}

function LandingPage() {
  const [visible, setVisible] = useState(false);
  useEffect(() => { setVisible(true); }, []);

  return (
    <div className="min-h-screen relative">
      <FloatingParticles />

      {/* Hero Section */}
      <div className="relative flex flex-col items-center justify-center min-h-screen p-4 text-center">
        {/* Radial glow behind title */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-gold/5 rounded-full blur-[120px] pointer-events-none" />

        {/* Top decorative element */}
        <div className={`flex items-center gap-3 mb-8 transition-all duration-1000 ${visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"}`}>
          <div className="w-12 h-px bg-linear-to-r from-transparent to-gold/60" />
          <div className="w-2 h-2 rotate-45 border border-gold/40" />
          <span className="text-gold/40 text-xs font-arena tracking-[0.4em]">BUILT ON MONAD</span>
          <div className="w-2 h-2 rotate-45 border border-gold/40" />
          <div className="w-12 h-px bg-linear-to-l from-transparent to-gold/60" />
        </div>

        {/* Main title */}
        <h1
          className={`font-arena text-7xl md:text-9xl tracking-wider mb-4 transition-all duration-1000 delay-200 ${visible ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}
        >
          <span className="text-gold drop-shadow-[0_0_40px_rgba(212,168,67,0.3)]">OWA</span>
          <span className="text-cream/30">MBE</span>
        </h1>

        {/* Tagline */}
        <p
          className={`text-cream-dim/60 text-lg md:text-xl font-arena tracking-[0.25em] mb-2 transition-all duration-1000 delay-400 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
        >
          ON-CHAIN PARTY TRIVIA
        </p>
        <p
          className={`text-gold/50 text-sm tracking-[0.5em] mb-4 transition-all duration-1000 delay-500 ${visible ? "opacity-100" : "opacity-0"}`}
        >
          WHERE KNOWLEDGE PAYS
        </p>

        {/* Escrow badge */}
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border border-gold/20 bg-gold/5 mb-12 transition-all duration-1000 delay-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <div className="w-2 h-2 rounded-full bg-arena-green animate-pulse" />
          <span className="text-cream-dim/60 text-xs font-arena tracking-wider">PRIZE POOL LOCKED IN SMART CONTRACT</span>
        </div>

        {/* CTA Buttons */}
        <div className={`flex flex-col sm:flex-row gap-4 w-full max-w-lg transition-all duration-1000 delay-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <Link to="/host" className="flex-1 btn-gold text-center no-underline text-lg py-5 relative group">
            <span className="relative z-10">HOST ARENA</span>
            <div className="absolute inset-0 rounded-xl bg-gold/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
          <Link
            to="/join"
            className="flex-1 stone-card border border-arena-border hover:border-gold/40 text-cream font-arena text-lg py-5 px-8 tracking-wider text-center no-underline transition-all hover:shadow-[0_0_30px_rgba(212,168,67,0.1)] hover:bg-arena-stone-light/20"
          >
            JOIN BATTLE
          </Link>
        </div>

        {/* Scroll hint */}
        <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 transition-all duration-1000 delay-1000 ${visible ? "opacity-100" : "opacity-0"}`}>
          <span className="text-cream-dim/20 text-xs font-arena tracking-widest">SCROLL</span>
          <div className="w-px h-8 bg-linear-to-b from-gold/30 to-transparent animate-pulse" />
        </div>
      </div>

      {/* How it Works Section */}
      <div className="relative px-4 pb-24 max-w-5xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-16">
          <p className="text-gold/40 text-xs font-arena tracking-[0.5em] mb-3">THE RITUAL</p>
          <h2 className="font-arena text-3xl md:text-4xl text-cream/80 tracking-wider">HOW IT WORKS</h2>
          <div className="w-24 h-px bg-linear-to-r from-transparent via-gold/40 to-transparent mx-auto mt-4" />
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20 stagger-children">
          <div className="stone-card arena-border p-8 group hover:border-gold/40 transition-all duration-500 hover:shadow-[0_0_40px_rgba(212,168,67,0.08)]">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-gold/10 border border-gold/20 flex items-center justify-center group-hover:bg-gold/20 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gold" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <span className="text-gold font-arena text-sm tracking-wider">I. CREATE</span>
            </div>
            <p className="text-cream-dim/50 text-sm leading-relaxed">
              Speak your topic or type it. AI forges the questions. Fund the prize pool in MON — it's locked in escrow the moment you create.
            </p>
          </div>

          <div className="stone-card arena-border p-8 group hover:border-gold/40 transition-all duration-500 hover:shadow-[0_0_40px_rgba(212,168,67,0.08)]">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-gold/10 border border-gold/20 flex items-center justify-center group-hover:bg-gold/20 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gold" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <span className="text-gold font-arena text-sm tracking-wider">II. BATTLE</span>
            </div>
            <p className="text-cream-dim/50 text-sm leading-relaxed">
              Players scan a QR code and join with just an email. No wallet needed. 7-second rounds. Pure speed and knowledge.
            </p>
          </div>

          <div className="stone-card arena-border p-8 group hover:border-gold/40 transition-all duration-500 hover:shadow-[0_0_40px_rgba(212,168,67,0.08)]">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-gold/10 border border-gold/20 flex items-center justify-center group-hover:bg-gold/20 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gold" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
                </svg>
              </div>
              <span className="text-gold font-arena text-sm tracking-wider">III. VICTORY</span>
            </div>
            <p className="text-cream-dim/50 text-sm leading-relaxed">
              Winners connect a wallet and get paid instantly on Monad. The smart contract releases the funds. No middleman. No delay. No ghosting.
            </p>
          </div>
        </div>

        {/* Why Owambe — the story */}
        <div className="stone-card arena-border p-8 md:p-12 mb-20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gold/3 rounded-full blur-[100px] pointer-events-none" />
          <div className="relative">
            <p className="text-gold/40 text-xs font-arena tracking-[0.5em] mb-3">WHY WE BUILT THIS</p>
            <h3 className="font-arena text-2xl text-gold tracking-wider mb-6">WE'VE BEEN BURNED BEFORE</h3>
            <p className="text-cream-dim/50 text-base leading-relaxed mb-4">
              We've won competitions, topped leaderboards, put in the work — and never seen a dime. Organizers ghost. Payments "come next week." Promises evaporate.
            </p>
            <p className="text-cream-dim/50 text-base leading-relaxed mb-6">
              Owambe fixes this with code, not promises. The prize pool is locked in a smart contract the moment the game is created. The host can't take it back. When you win, the contract pays you directly. That's it.
            </p>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-arena-green/10 border border-arena-green/20">
                <div className="w-1.5 h-1.5 rounded-full bg-arena-green" />
                <span className="text-arena-green text-xs font-arena tracking-wider">TRUSTLESS ESCROW</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gold/10 border border-gold/20">
                <div className="w-1.5 h-1.5 rounded-full bg-gold" />
                <span className="text-gold text-xs font-arena tracking-wider">INSTANT PAYOUT</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-cream/5 border border-cream/10">
                <div className="w-1.5 h-1.5 rounded-full bg-cream/40" />
                <span className="text-cream/40 text-xs font-arena tracking-wider">FREE TO PLAY</span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-20">
          <div className="stone-card p-6 text-center">
            <p className="font-arena text-3xl text-gold mb-1"><AnimatedCounter target="7" suffix="s" /></p>
            <p className="text-cream-dim/30 text-xs font-arena tracking-wider">PER ROUND</p>
          </div>
          <div className="stone-card p-6 text-center">
            <p className="font-arena text-3xl text-gold mb-1"><AnimatedCounter target="0" suffix=" GAS" /></p>
            <p className="text-cream-dim/30 text-xs font-arena tracking-wider">FOR PLAYERS</p>
          </div>
          <div className="stone-card p-6 text-center">
            <p className="font-arena text-3xl text-gold mb-1"><AnimatedCounter target="2" /></p>
            <p className="text-cream-dim/30 text-xs font-arena tracking-wider">ON-CHAIN TXS</p>
          </div>
          <div className="stone-card p-6 text-center">
            <p className="font-arena text-3xl text-arena-green mb-1">100%</p>
            <p className="text-cream-dim/30 text-xs font-arena tracking-wider">PAID OUT</p>
          </div>
        </div>

        {/* Tech badges */}
        <div className="text-center mb-12">
          <p className="text-cream-dim/20 text-xs font-arena tracking-[0.4em] mb-6">POWERED BY</p>
          <div className="flex flex-wrap justify-center gap-3">
            {["MONAD", "SOLIDITY", "REACT", "GROQ AI", "ETHERS.JS"].map((tech) => (
              <span key={tech} className="px-4 py-2 rounded-lg border border-arena-border text-cream-dim/30 text-xs font-arena tracking-wider hover:border-gold/20 hover:text-cream-dim/50 transition-all">
                {tech}
              </span>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col items-center gap-4 pt-8 border-t border-arena-border/50">
          <div className="flex items-center gap-3 text-cream-dim/20 text-xs">
            <div className="w-8 h-px bg-cream-dim/10" />
            <span className="font-arena tracking-wider">LATTICE TEAM</span>
            <span className="text-gold/20">|</span>
            <span className="font-arena tracking-wider">MONAD BLITZ LAGOS 2026</span>
            <div className="w-8 h-px bg-cream-dim/10" />
          </div>
          <p className="text-cream-dim/15 text-xs italic">where the party meets the chain</p>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/host" element={<HostPage />} />
        <Route path="/join" element={<PlayerPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
