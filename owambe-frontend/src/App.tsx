import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { HostPage } from "./pages/HostPage";
import { PlayerPage } from "./pages/PlayerPage";

function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center">
      {/* Decorative top line */}
      <div className="w-32 h-px bg-linear-to-r from-transparent via-gold to-transparent mb-10" />

      <h1 className="font-arena text-6xl md:text-8xl tracking-wider mb-3 animate-fade-up">
        <span className="text-gold">OWA</span><span className="text-cream/40">MBE</span>
      </h1>
      <p className="text-cream-dim/60 text-base md:text-lg font-arena tracking-[0.2em] mb-1 animate-fade-up" style={{ animationDelay: "0.1s" }}>
        ON-CHAIN PARTY TRIVIA
      </p>
      <p className="text-gold/40 text-xs tracking-[0.4em] mb-12 animate-fade-up" style={{ animationDelay: "0.2s" }}>
        WHERE KNOWLEDGE PAYS
      </p>

      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md animate-fade-up" style={{ animationDelay: "0.3s" }}>
        <Link to="/host" className="flex-1 btn-gold text-center no-underline text-lg py-5">
          HOST ARENA
        </Link>
        <Link
          to="/join"
          className="flex-1 stone-card border border-arena-border hover:border-gold/30 text-cream font-arena text-lg py-5 px-8 tracking-wider text-center no-underline transition-all"
        >
          JOIN BATTLE
        </Link>
      </div>

      {/* How it works */}
      <div className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-2xl w-full text-left stagger-children">
        <div className="stone-card arena-border p-5">
          <p className="text-gold font-arena text-sm tracking-wider mb-2">I. CREATE</p>
          <p className="text-cream-dim/50 text-sm">Speak your topic. AI forges the questions. Fund the prize pool.</p>
        </div>
        <div className="stone-card arena-border p-5">
          <p className="text-gold font-arena text-sm tracking-wider mb-2">II. BATTLE</p>
          <p className="text-cream-dim/50 text-sm">Players scan QR and enter for free. Answer live under the clock.</p>
        </div>
        <div className="stone-card arena-border p-5">
          <p className="text-gold font-arena text-sm tracking-wider mb-2">III. VICTORY</p>
          <p className="text-cream-dim/50 text-sm">Champions are paid instantly on Monad. No middleman. No delay.</p>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-16 flex items-center gap-3 text-cream-dim/20 text-xs animate-fade-up" style={{ animationDelay: "0.6s" }}>
        <div className="w-8 h-px bg-cream-dim/10" />
        <span className="font-arena tracking-wider">BUILT ON MONAD</span>
        <span>|</span>
        <span className="font-arena tracking-wider">LATTICE TEAM</span>
        <div className="w-8 h-px bg-cream-dim/10" />
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
