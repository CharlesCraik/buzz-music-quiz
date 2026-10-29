import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Home } from './Home';
import { SpotifyCallback } from './SpotifyCallback';

const HostSetup = lazy(() => import('../host/HostSetup'));
const HostGame = lazy(() => import('../host/HostGame'));
const PlayerApp = lazy(() => import('../play/PlayerApp'));

function Loading() {
  return (
    <div className="stage-bg grid h-dvh place-items-center font-display text-2xl text-cream">Loading…</div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/host" element={<HostSetup />} />
          <Route path="/host/room" element={<HostGame />} />
          <Route path="/join" element={<PlayerApp />} />
          <Route path="/join/:code" element={<PlayerApp />} />
          <Route path="/callback" element={<SpotifyCallback />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
