import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { HostPage } from "./pages/HostPage";
import { PlayerPage } from "./pages/PlayerPage";

function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center">
      <h1 className="text-5xl md:text-7xl font-bold mb-2">
        <span className="text-purple-400">OWA</span>
        <span className="text-gold">MBE</span>
      </h1>
      <p className="text-purple-300 text-lg md:text-xl mb-2">On-Chain Party Trivia</p>
      <p className="text-purple-500 text-sm mb-12">Where Knowledge Pays</p>

      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
        <Link
          to="/host"
          className="flex-1 bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white font-bold py-4 px-8 rounded-xl text-lg transition-all text-center no-underline"
        >
          Host a Game
        </Link>
        <Link
          to="/join"
          className="flex-1 bg-purple-900/50 border border-purple-500/30 hover:border-purple-400 text-white font-bold py-4 px-8 rounded-xl text-lg transition-all text-center no-underline"
        >
          Join a Game
        </Link>
      </div>

      <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-2xl w-full text-left">
        <div className="bg-purple-900/20 border border-purple-500/10 rounded-xl p-5">
          <p className="text-gold font-bold mb-1">1. Create</p>
          <p className="text-purple-400 text-sm">Host speaks a topic. AI generates questions instantly.</p>
        </div>
        <div className="bg-purple-900/20 border border-purple-500/10 rounded-xl p-5">
          <p className="text-gold font-bold mb-1">2. Play</p>
          <p className="text-purple-400 text-sm">Players scan QR, stake MON, answer live.</p>
        </div>
        <div className="bg-purple-900/20 border border-purple-500/10 rounded-xl p-5">
          <p className="text-gold font-bold mb-1">3. Win</p>
          <p className="text-purple-400 text-sm">Top 3 get paid instantly on Monad. No middleman.</p>
        </div>
      </div>

      <p className="text-purple-700 text-xs mt-12">Built on Monad Testnet | Lattice Team</p>
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
