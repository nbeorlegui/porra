import { useState } from 'react';
import { Match, AppState, Participant } from '../domain/types';
import { calculateGroupStandings } from '../utils/standings';
import { getFlagImgUrl, normalizeTeamCode } from '../utils/flags';
import { TRANSLATIONS, Lang } from '../utils/translations';
import { MatchPredictionsModal } from './MatchPredictionsModal';

interface Props {
  matches: Match[];
  realResults: AppState['realResults'];
  participants: Participant[];
  lang: Lang;
  theme?: 'light' | 'dark';
}

type BracketSubTab = 'groups' | 'knockout';

// Group colors mapping for visual consistency in Light Mode
const GROUP_COLORS: Record<string, { bg: string, text: string, border: string }> = {
  'Group A': { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  'Group B': { bg: '#ffedd5', text: '#9a3412', border: '#fed7aa' },
  'Group C': { bg: '#fef9c3', text: '#854d0e', border: '#fef08a' },
  'Group D': { bg: '#dcfce7', text: '#166534', border: '#bbf7d0' },
  'Group E': { bg: '#ccfbf1', text: '#115e59', border: '#99f6e4' },
  'Group F': { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe' },
  'Group G': { bg: '#e0e7ff', text: '#3730a3', border: '#c7d2fe' },
  'Group H': { bg: '#f3e8ff', text: '#6b21a8', border: '#e9d5ff' },
  'Group I': { bg: '#fce7f3', text: '#9d174d', border: '#fbcfe8' },
  'Group J': { bg: '#e0f2fe', text: '#0369a1', border: '#bae6fd' },
  'Group K': { bg: '#f5f3ff', text: '#5b21b6', border: '#ddd6fe' },
  'Group L': { bg: '#ecfdf5', text: '#065f46', border: '#a7f3d0' },
};

// Group colors mapping for visual consistency in Dark Mode
const GROUP_COLORS_DARK: Record<string, { bg: string, text: string, border: string }> = {
  'Group A': { bg: '#3a1a1a', text: '#fca5a5', border: '#991b1b' },
  'Group B': { bg: '#3a2012', text: '#fed7aa', border: '#9a3412' },
  'Group C': { bg: '#353215', text: '#fef08a', border: '#854d0e' },
  'Group D': { bg: '#14301c', text: '#bbf7d0', border: '#166534' },
  'Group E': { bg: '#112e2a', text: '#99f6e4', border: '#115e59' },
  'Group F': { bg: '#1a243a', text: '#bfdbfe', border: '#1e40af' },
  'Group G': { bg: '#1d1e3d', text: '#c7d2fe', border: '#3730a3' },
  'Group H': { bg: '#281c3a', text: '#e9d5ff', border: '#6b21a8' },
  'Group I': { bg: '#321524', text: '#fbcfe8', border: '#9d174d' },
  'Group J': { bg: '#122635', text: '#bae6fd', border: '#0369a1' },
  'Group K': { bg: '#1e1a3a', text: '#ddd6fe', border: '#5b21b6' },
  'Group L': { bg: '#0f2f22', text: '#a7f3d0', border: '#065f46' },
};

// Bracket matchups for Round of 32
const KNOCKOUT_MATCHUPS = [
  { id: 'M73', date: '28 Jun 2026', time: '15:00', venue: 'Los Angeles Stadium', team1: '2º Grupo A', team2: '2º Grupo B' },
  { id: 'M74', date: '29 Jun 2026', time: '16:30', venue: 'Boston Stadium', team1: '1º Grupo E', team2: '3º Grupo A/B/C/D/F' },
  { id: 'M75', date: '29 Jun 2026', time: '21:00', venue: 'Estadio Monterrey', team1: '1º Grupo F', team2: '2º Grupo C' },
  { id: 'M76', date: '29 Jun 2026', time: '13:00', venue: 'Houston Stadium', team1: '1º Grupo C', team2: '2º Grupo F' },
  { id: 'M77', date: '30 Jun 2026', time: '17:00', venue: 'New York NJ Stadium', team1: '1º Grupo I', team2: '3º Grupo C/D/F/G/H' },
  { id: 'M78', date: '30 Jun 2026', time: '13:00', venue: 'Dallas Stadium', team1: '2º Grupo E', team2: '2º Grupo I' },
  { id: 'M79', date: '30 Jun 2026', time: '21:00', venue: 'Estadio Azteca', team1: '1º Grupo A', team2: '3º Grupo C/E/F/H/I' },
  { id: 'M80', date: '1 Jul 2026', time: '12:00', venue: 'Atlanta Stadium', team1: '1º Grupo L', team2: '3º Grupo E/H/I/J/K' },
  { id: 'M81', date: '1 Jul 2026', time: '20:00', venue: 'San Francisco Bay Area', team1: '1º Grupo D', team2: '3º Grupo B/E/F/I/J' },
  { id: 'M82', date: '1 Jul 2026', time: '16:00', venue: 'Seattle Stadium', team1: '1º Grupo G', team2: '3º Grupo A/E/H/I/J' },
  { id: 'M83', date: '2 Jul 2026', time: '19:00', venue: 'Toronto Stadium', team1: '2º Grupo K', team2: '2º Grupo L' },
  { id: 'M84', date: '2 Jul 2026', time: '15:00', venue: 'Los Angeles Stadium', team1: '1º Grupo H', team2: '2º Grupo J' },
  { id: 'M85', date: '2 Jul 2026', time: '23:00', venue: 'BC Place, Vancouver', team1: '1º Grupo B', team2: '3º Grupo E/F/G/I/J' },
  { id: 'M86', date: '3 Jul 2026', time: '18:00', venue: 'Miami Stadium', team1: '1º Grupo J', team2: '2º Grupo H' },
  { id: 'M87', date: '3 Jul 2026', time: '21:30', venue: 'Kansas City Stadium', team1: '1º Grupo K', team2: '3º Grupo D/E/I/J/L' },
  { id: 'M88', date: '3 Jul 2026', time: '14:00', venue: 'Dallas Stadium', team1: '2º Grupo D', team2: '2º Grupo G' },
];

export function TournamentBracket({ matches, realResults, participants, lang, theme }: Props) {
  const [subTab, setSubTab] = useState<BracketSubTab>('groups');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('All');
  const [selectedMatchForPredictions, setSelectedMatchForPredictions] = useState<Match | null>(null);
  const t = TRANSLATIONS[lang];

  // Extract unique group names
  const groupNames = Array.from(new Set(matches.map(m => m.group).filter(Boolean))) as string[];
  const sortedGroupNames = groupNames.sort((a, b) => a.localeCompare(b));

  // Compute played matches and total matches
  const playedMatchesCount = matches.filter(m => m.realResult && m.realResult.trim() !== '' && m.realResult.trim() !== '-').length;
  const totalMatchesCount = matches.length;

  return (
    <div className="card tournament-bracket">
      <div className="bracket-header">
        <div>
          <h2>{t.tbTitle}</h2>
          <p className="bracket-subtitle" style={{ margin: 0 }}>{t.tbSubtitle}</p>
        </div>

        {/* Center: Countdown card with progress bar */}
        <div className="bracket-header-center" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="progress-card" style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', 
            border: '1px solid #bfdbfe',
            padding: '0.6rem 1.2rem',
            borderRadius: '12px',
            boxShadow: '0 4px 12px rgba(29, 78, 216, 0.08)',
            userSelect: 'none',
            minWidth: '180px',
            textAlign: 'center',
          }}
          title={lang === 'es' ? `${playedMatchesCount} partidos jugados de ${totalMatchesCount} totales` : `${playedMatchesCount} matches played of ${totalMatchesCount} total`}
          >
            <span style={{ fontSize: '0.65rem', fontWeight: '800', color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: 1 }}>
              {lang === 'es' ? 'Partidos Jugados' : 'Played Matches'}
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginTop: '4px', marginBottom: '6px' }}>
              <span style={{ fontSize: '1.8rem', fontWeight: '900', color: 'var(--accent-blue)', lineHeight: 1 }}>
                {playedMatchesCount}
              </span>
              <span style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--accent-blue)', opacity: 0.85 }}>
                / {totalMatchesCount}
              </span>
            </div>
            {/* Animated progress bar track */}
            <div style={{ 
              width: '100%', 
              backgroundColor: '#dbeafe', 
              height: '6px', 
              borderRadius: '9999px',
              overflow: 'hidden'
            }}>
              {/* Animated progress bar fill */}
              <div style={{ 
                width: `${(playedMatchesCount / totalMatchesCount) * 100}%`, 
                background: 'linear-gradient(90deg, #2A398D 0%, #E61D25 100%)', 
                height: '100%',
                borderRadius: '9999px',
                transition: 'width 0.5s ease-out'
              }} />
            </div>
          </div>
        </div>

        {/* Right: Sub-tabs */}
        <div className="sub-tabs">
          <button 
            className={`sub-tab-btn ${subTab === 'groups' ? 'active' : ''}`}
            onClick={() => {
              setSubTab('groups');
              setSelectedGroupFilter('All');
            }}
          >
            {t.tbTabGroups}
          </button>
          <button 
            className={`sub-tab-btn ${subTab === 'knockout' ? 'active' : ''}`}
            onClick={() => setSubTab('knockout')}
          >
            {t.tbTabKnockout}
          </button>
        </div>
      </div>

      {subTab === 'groups' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Back Button to All Groups */}
          {selectedGroupFilter !== 'All' && (
            <button
              onClick={() => setSelectedGroupFilter('All')}
              className="animate-fade-in"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                border: 'none',
                background: 'none',
                color: 'var(--primary)',
                fontWeight: 'bold',
                fontSize: '0.95rem',
                cursor: 'pointer',
                padding: '0.25rem 0',
                alignSelf: 'flex-start',
                transition: 'opacity 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              ← {lang === 'es' ? 'Volver a todos los grupos' : 'Back to all groups'}
            </button>
          )}

          {/* GROUPS STANDINGS VIEW */}
          <div className={selectedGroupFilter === 'All' ? "bracket-groups-grid" : ""} style={selectedGroupFilter !== 'All' ? { display: 'flex', justifyContent: 'center' } : {}}>
            {(selectedGroupFilter === 'All' ? sortedGroupNames : [selectedGroupFilter]).map(gName => {
              const standings = calculateGroupStandings(gName, matches, realResults);
              const colors = (theme === 'dark' ? GROUP_COLORS_DARK : GROUP_COLORS)[gName] || { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' };

              return (
                <div 
                  key={gName} 
                  className={`group-standings-card ${selectedGroupFilter === 'All' ? 'clickable-card' : ''}`}
                  onClick={selectedGroupFilter === 'All' ? () => setSelectedGroupFilter(gName) : undefined}
                  style={{ 
                    borderTop: `4px solid ${colors.border}`, 
                    width: selectedGroupFilter !== 'All' ? '100%' : undefined, 
                    maxWidth: selectedGroupFilter !== 'All' ? '500px' : undefined,
                    cursor: selectedGroupFilter === 'All' ? 'pointer' : 'default'
                  }}
                  title={selectedGroupFilter === 'All' ? (lang === 'es' ? `Ver partidos y detalles de ${gName}` : `View matches and details of ${gName}`) : undefined}
                >
                  <h3 
                    className="group-standings-title"
                    style={{ backgroundColor: colors.bg, color: colors.text }}
                  >
                    {gName}
                  </h3>
                  <table className="standings-table">
                    <thead>
                      <tr>
                        <th>{t.tbColPos}</th>
                        <th>{t.tbColTeam}</th>
                        <th>{t.tbColGP}</th>
                        <th>{t.tbColGD}</th>
                        <th>{t.tbColPts}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((stat, idx) => {
                        const isQualified = idx < 2; // top 2 qualify directly
                        const normalizedTeamCode = normalizeTeamCode(stat.team);
                        return (
                          <tr 
                            key={stat.team} 
                            className={isQualified ? 'qualified-row' : ''}
                          >
                            <td className="pos">{idx + 1}</td>
                            <td className="team-cell">
                              <img src={getFlagImgUrl(normalizedTeamCode)} alt={normalizedTeamCode} className="flag-icon-img table-flag" />
                              <span className="name">{normalizedTeamCode}</span>
                            </td>
                            <td>{stat.gp}</td>
                            <td className={stat.gd > 0 ? 'gd-positive' : stat.gd < 0 ? 'gd-negative' : ''}>
                              {stat.gd > 0 ? `+${stat.gd}` : stat.gd}
                            </td>
                            <td className="pts"><strong>{stat.pts}</strong></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>

          {/* Group Matches (Only when a single group is filtered) */}
          {selectedGroupFilter !== 'All' && (
            <div className="animate-fade-in" style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
              <h3 className="section-title" style={{ marginBottom: '1.2rem', fontSize: '1.2rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                ⚽ {t.mpGroupMatches} - {selectedGroupFilter}
              </h3>
              <div className="matches-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.2rem' }}>
                {matches
                  .filter(m => m.group === selectedGroupFilter)
                  .map(m => {
                    const realScore = realResults.matches[m.id];
                    const colors = (theme === 'dark' ? GROUP_COLORS_DARK : GROUP_COLORS)[selectedGroupFilter] || { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' };
                    return (
                      <div 
                        key={m.id} 
                        className="match-card animate-fade-in"
                        style={{ 
                          borderTop: `4px solid ${colors.border}`, 
                          display: 'flex', 
                          flexDirection: 'column', 
                          justifyContent: 'space-between', 
                          gap: '0.75rem', 
                          padding: '1rem', 
                          background: 'var(--card-bg)', 
                          borderRadius: '8px', 
                          boxShadow: 'var(--shadow)', 
                          border: '1.5px solid var(--border)' 
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-light)', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.35rem' }}>
                          <span style={{ fontWeight: 'bold' }}>{m.id}</span>
                          {m.date && <span>📅 {m.date} {m.time ? `@ ${m.time}` : ''}</span>}
                        </div>

                        <div 
                          className="match-teams-display"
                          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', padding: '0.5rem 0' }}
                          onClick={() => setSelectedMatchForPredictions(m)}
                          title={lang === 'es' ? 'Clic para ver pronósticos de participantes' : 'Click to view participant predictions'}
                        >
                          <span className="team" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                            <img src={getFlagImgUrl(m.team1)} alt={m.team1} className="flag-icon-img" style={{ width: '30px', height: '20px', borderRadius: '2px' }} />
                            <span className="team-name" style={{ fontSize: '0.8rem', fontWeight: 'bold', marginTop: '0.25rem' }}>{normalizeTeamCode(m.team1)}</span>
                          </span>
                          
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem', minWidth: '50px' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--text-light)', background: '#f3f4f6', padding: '0.05rem 0.35rem', borderRadius: '8px' }}>vs</span>
                            {realScore ? (
                              <span style={{ fontSize: '1rem', fontWeight: 800, color: '#059669', background: '#ecfdf5', padding: '0.1rem 0.4rem', borderRadius: '4px', border: '1px solid #a7f3d0' }}>
                                {realScore}
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-light)', fontStyle: 'italic' }}>-</span>
                            )}
                          </div>

                          <span className="team" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                            <img src={getFlagImgUrl(m.team2)} alt={m.team2} className="flag-icon-img" style={{ width: '30px', height: '20px', borderRadius: '2px' }} />
                            <span className="team-name" style={{ fontSize: '0.8rem', fontWeight: 'bold', marginTop: '0.25rem' }}>{normalizeTeamCode(m.team2)}</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      ) : (
        // KNOCKOUT BRACKET VIEW
        <div className="knockout-schedule-container">
          <div className="knockout-alert-info">
            💡 <strong>{t.tbFormatLabel}</strong> {t.tbFormatDesc}
          </div>

          <div className="bracket-stages-roadmap">
            <div className="roadmap-stage">
              <span className="roadmap-badge r32">1/16</span>
              <strong>{t.tbStageR32}</strong> 28 Jun - 3 Jul
            </div>
            <div className="roadmap-arrow">➔</div>
            <div className="roadmap-stage">
              <span className="roadmap-badge r16">1/8</span>
              <strong>{t.tbStageR16}</strong> 4 Jul - 7 Jul
            </div>
            <div className="roadmap-arrow">➔</div>
            <div className="roadmap-stage">
              <span className="roadmap-badge r8">1/4</span>
              <strong>{t.tbStageQuarter}</strong> 9 Jul - 11 Jul
            </div>
            <div className="roadmap-arrow">➔</div>
            <div className="roadmap-stage">
              <span className="roadmap-badge r4">Semis</span>
              <strong>{t.tbStageSemi}</strong> 14 Jul - 15 Jul
            </div>
            <div className="roadmap-arrow">➔</div>
            <div className="roadmap-stage">
              <span className="roadmap-badge r1">Final</span>
              <strong>{t.tbStageFinal}</strong> 19 Jul (NJ)
            </div>
          </div>

          <div className="bracket-matchups-grid">
            {KNOCKOUT_MATCHUPS.map(m => (
              <div 
                key={m.id} 
                className="knockout-match-card"
                style={{ cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s' }}
                onClick={() => {
                  const matchObj: Match = {
                    id: m.id,
                    team1: m.team1,
                    team2: m.team2,
                    group: lang === 'es' ? 'Fase Eliminatoria' : 'Knockout Stage',
                    realResult: realResults.matches[m.id],
                    date: m.date,
                    time: m.time,
                    ground: m.venue
                  };
                  setSelectedMatchForPredictions(matchObj);
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(42, 44, 46, 0.1)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
                title={lang === 'es' ? 'Clic para ver pronósticos de participantes' : 'Click to view participant predictions'}
              >
                <div className="k-match-header">
                  <span className="k-match-id">{m.id}</span>
                  <span className="k-match-date">📅 {m.date} - {m.time}</span>
                </div>
                
                <div className="k-match-teams" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <div className="k-team" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span className="k-flag">🏳️</span>
                    <span className="k-name">{m.team1}</span>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '40px' }}>
                    {realResults.matches[m.id] ? (
                      <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#059669', background: '#ecfdf5', padding: '0.1rem 0.4rem', borderRadius: '4px', border: '1px solid #a7f3d0' }}>
                        {realResults.matches[m.id]}
                      </span>
                    ) : (
                      <div className="k-vs">vs</div>
                    )}
                  </div>

                  <div className="k-team" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'flex-end' }}>
                    <span className="k-name" style={{ textAlign: 'right' }}>{m.team2}</span>
                    <span className="k-flag">🏳️</span>
                  </div>
                </div>

                <div className="k-match-footer">
                  <span className="k-venue">🏟️ {m.venue}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {selectedMatchForPredictions && (
        <MatchPredictionsModal
          match={selectedMatchForPredictions}
          participants={participants}
          realScore={realResults.matches[selectedMatchForPredictions.id]}
          lang={lang}
          onClose={() => setSelectedMatchForPredictions(null)}
        />
      )}
    </div>
  );
}
