import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PlayerProvider } from './contexts/PlayerContext';
import { LibraryProvider } from './contexts/LibraryContext';
import { ThemeProvider } from './contexts/ThemeContext';
import Layout from './components/Layout';
import Home from './pages/Home';
import Search from './pages/Search';
import Library from './pages/Library';

const App: React.FC = () => {
  React.useEffect(() => {
    const handler = (event: ErrorEvent) => {
      const msg = event.message || '';
      // библиотека ytdl-core иногда выбрасывает ошибку с forEach внутри.
      // она не влияет на работу приложения, но засоряет консоль.
      if (msg.includes("Cannot read properties of undefined (reading 'forEach')") && msg.includes('ytdl-core')) {
        event.preventDefault();
        return true;
      }
      return false;
    };
    window.addEventListener('error', handler);
    // также фильтруем аналогичные непойманные отклонения промисов
    const rej = (ev: PromiseRejectionEvent) => {
      const msg = ev.reason && String(ev.reason.message || ev.reason);
      if (msg && msg.includes("Cannot read properties of undefined (reading 'forEach')")) {
        ev.preventDefault();
      }
    };
    window.addEventListener('unhandledrejection', rej);
    return () => {
      window.removeEventListener('error', handler);
      window.removeEventListener('unhandledrejection', rej);
    };
  }, []);

  return (
    <ThemeProvider>
      <LibraryProvider>
        <PlayerProvider>
          <HashRouter>
            <Layout>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/search" element={<Search />} />
                <Route path="/library" element={<Library />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </HashRouter>
        </PlayerProvider>
      </LibraryProvider>
    </ThemeProvider>
  );
};

export default App;
