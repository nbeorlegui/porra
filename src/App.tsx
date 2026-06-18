import { useEffect, useState } from 'react';
import { loadInitialData } from './utils/parser';
import { AppState, Predictions } from './domain/types';
import { calculatePointsForParticipant } from './domain/scoring';
import { Leaderboard } from './components/Leaderboard';
import { AdminPanel } from './components/AdminPanel';
import { ParticipantDetails } from './components/ParticipantDetails';
import { TournamentBracket } from './components/TournamentBracket';
import { BotePanel } from './components/BotePanel';
import { PlayerStats } from './components/PlayerStats';
import { TRANSLATIONS, Lang } from './utils/translations';
import './index.css';

type ActiveTab = 'leaderboard' | 'bracket' | 'admin' | 'bote' | 'stats';

function App() {
  const [appState, setAppState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedParticipantName, setSelectedParticipantName] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState<ActiveTab>('leaderboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminPassword, setAdminPassword] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('theme') as 'light' | 'dark') || 'light');
  const lang: Lang = 'es';

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark-theme');
    } else {
      document.documentElement.classList.remove('dark-theme');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    async function init() {
      try {
        // Load fresh matches, participants, and real results directly from our SQLite backend DB
        const freshData = await loadInitialData();
        setAppState(freshData);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        setError(errMsg);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const t = TRANSLATIONS[lang];

  if (loading) return <div className="loading">Loading...</div>;
  
  if (isRestoring) {
    return (
      <div className="loading animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <span style={{ fontSize: '2rem' }}>🔄</span>
        <span style={{ fontSize: '1.2rem', fontWeight: 600 }}>{lang === 'es' ? 'Restaurando copia de seguridad...' : 'Restoring backup...'}</span>
        <span style={{ fontSize: '0.9rem', color: '#64748b' }}>{lang === 'es' ? 'No cierres esta pestaña...' : 'Do not close this tab...'}</span>
      </div>
    );
  }

  if (error) return <div className="error">Error: {error}</div>;
  if (!appState) return null;

  // Calculate scores on the fly
  const scoredParticipants = appState.participants.map(p => ({
    ...p,
    points: calculatePointsForParticipant(p, appState.realResults)
  })).sort((a, b) => b.points.total - a.points.total);

  const handleUpdateRealResults = async (newResults: AppState['realResults']) => {
    // Save physically to Supabase through Netlify Function
    try {
      const response = await fetch('/api/save-csv', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          realResults: newResults,
          adminPassword: adminPassword || undefined,
        }),
      });

      const resData = await response.json();

      if (resData.success) {
        setAppState({ ...appState, realResults: newResults });
        alert(t.alertSaveResultsSuccess);
      } else {
        alert(t.alertSaveResultsError + resData.error);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert(t.alertSaveResultsConnError + errorMsg);
    }
  };

  const handleSavePredictions = async (name: string, updatedPredictions: Predictions, password?: string) => {
    if (!appState) return;

    try {
      const response = await fetch('/api/save-predictions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          predictions: updatedPredictions,
          password,
          adminPassword: isAdminAuthenticated ? adminPassword || undefined : undefined,
        })
      });

      const resData = await response.json();

      if (resData.success) {
        const updatedParticipants = appState.participants.map(p => {
          if (p.name.trim().toLowerCase() === name.trim().toLowerCase()) {
            return {
              ...p,
              predictions: updatedPredictions,
              password: password || p.password
            };
          }
          return p;
        });

        setAppState({
          ...appState,
          participants: updatedParticipants
        });

        alert(t.alertSavePredsSuccess.replace('{name}', name));
      } else {
        alert(t.alertSavePredsError + resData.error);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert(t.alertSavePredsConnError + errorMsg);
    }
  };

  const handleExportBackup = () => {
    if (!appState) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appState, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href",     dataStr);
    
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
    const timestamp = `${dateStr}_${timeStr}`;
    
    downloadAnchor.setAttribute("download", `mundial_porra_backup_${timestamp}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleRestoreBackup = async (backupData: AppState) => {
    setIsRestoring(true);
    try {
      const response = await fetch('/api/restore-backup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          backupData,
          adminPassword: adminPassword || undefined,
        }),
      });
      const resData = await response.json();
      if (resData.success) {
        setAppState(backupData);
        setSelectedParticipantName(null);
        
        // Notify the user that it succeeded and will refresh now
        alert(
          lang === 'es'
            ? '🔄 ¡Copia de seguridad restaurada con éxito! La página se actualizará ahora.'
            : '🔄 Backup restored successfully! The page will now refresh.'
        );
        window.location.reload();
      } else {
        setIsRestoring(false);
        alert(
          (lang === 'es' ? '❌ Error al restaurar copia: ' : '❌ Error restoring backup: ') + 
          resData.error
        );
      }
    } catch (err: unknown) {
      setIsRestoring(false);
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert(
        (lang === 'es' ? '❌ Error de conexión al restaurar: ' : '❌ Connection error during restore: ') + 
        errorMsg
      );
    }
  };

  const handleTabClick = (tab: ActiveTab) => {
    setCurrentTab(tab);
    setIsMobileMenuOpen(false);
  };

  const handleAdminTabClick = () => {
    if (isAdminAuthenticated) {
      setCurrentTab('admin');
      setIsMobileMenuOpen(false);
    } else {
      const password = window.prompt(t.promptAdminPass);
      if (password === 'root') {
        setIsAdminAuthenticated(true);
        setAdminPassword(password);
        setCurrentTab('admin');
        setIsMobileMenuOpen(false);
      } else if (password !== null) {
        alert(t.alertIncorrectPass);
      }
    }
  };

  const selectedParticipant = scoredParticipants.find(p => p.name === selectedParticipantName);

  return (
    <div className="container">
      <header className="header">
        <div className="logo-section">
          <h1>{t.title}</h1>
          <p className="app-subtitle">{t.subtitle}</p>
        </div>
        
        <div className="header-right">
          <button 
            className="theme-toggle-btn"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            title={theme === 'light' ? 'Activar Modo Oscuro' : 'Activar Modo Claro'}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>

          <button
            className={`hamburger-btn ${isMobileMenuOpen ? 'open' : ''}`}
            type="button"
            aria-label={isMobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={isMobileMenuOpen}
            aria-controls="main-navigation"
            onClick={() => setIsMobileMenuOpen((open) => !open)}
          >
            <span></span>
            <span></span>
            <span></span>
          </button>

          <nav id="main-navigation" className={`nav-tabs ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
            <button 
              className={`nav-tab-btn ${currentTab === 'leaderboard' ? 'active' : ''}`}
              onClick={() => handleTabClick('leaderboard')}
            >
              {t.tabLeaderboard}
            </button>
            <button 
              className={`nav-tab-btn ${currentTab === 'bote' ? 'active' : ''}`}
              onClick={() => handleTabClick('bote')}
            >
              {t.tabBote}
            </button>
            <button 
              className={`nav-tab-btn ${currentTab === 'bracket' ? 'active' : ''}`}
              onClick={() => handleTabClick('bracket')}
            >
              {t.tabBracket}
            </button>
            <button 
              className={`nav-tab-btn ${currentTab === 'stats' ? 'active' : ''}`}
              onClick={() => handleTabClick('stats')}
            >
              {t.tabStats}
            </button>
            <button 
              className={`nav-tab-btn ${currentTab === 'admin' ? 'active' : ''}`}
              onClick={handleAdminTabClick}
            >
              {t.tabAdmin}
            </button>
          </nav>
        </div>
      </header>

      <main className="main-content">
        {currentTab === 'leaderboard' ? (
          <div className="full-panel">
            <Leaderboard 
              participants={scoredParticipants} 
              realResults={appState.realResults}
              matches={appState.matches}
              selectedParticipantName={selectedParticipantName}
              onSelectParticipant={(p) => setSelectedParticipantName(p.name)}
              lang={lang}
            />
            {selectedParticipant && (
              <div className="modal-overlay" onClick={() => setSelectedParticipantName(null)}>
                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                  <button className="modal-close-btn" onClick={() => setSelectedParticipantName(null)}>×</button>
                  <ParticipantDetails
                    participant={selectedParticipant}
                    matches={appState.matches}
                    realResults={appState.realResults}
                    onClose={() => setSelectedParticipantName(null)}
                    onSavePredictions={handleSavePredictions}
                    lang={lang}
                    theme={theme}
                    isAdmin={isAdminAuthenticated}
                  />
                </div>
              </div>
            )}
          </div>
        ) : currentTab === 'bote' ? (
          <div className="full-panel">
            <BotePanel boteData={appState.bote} lang={lang} />
          </div>
        ) : currentTab === 'bracket' ? (
          <div className="full-panel">
            <TournamentBracket 
              matches={appState.matches}
              realResults={appState.realResults}
              participants={scoredParticipants}
              lang={lang}
              theme={theme}
            />
          </div>
        ) : currentTab === 'stats' ? (
          <div className="full-panel">
            <PlayerStats lang={lang} />
          </div>
        ) : (
          <div className="full-panel">
            <AdminPanel 
              matches={appState.matches} 
              realResults={appState.realResults} 
              participants={scoredParticipants}
              onUpdate={handleUpdateRealResults} 
              onExportBackup={handleExportBackup}
              onRestoreBackup={handleRestoreBackup}
              lang={lang}
              theme={theme}
            />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
