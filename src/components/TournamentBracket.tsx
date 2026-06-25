import { useState, useMemo } from 'react';
import { Match, AppState, Participant } from '../domain/types';
import { calculateGroupStandings } from '../utils/standings';
import { getFlagImgUrl, normalizeTeamCode } from '../utils/flags';
import { TRANSLATIONS, Lang } from '../utils/translations';
import { MatchPredictionsModal } from './MatchPredictionsModal';
import { formatMatchDateToClient, formatMatchTimeToClient } from '../utils/date';

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

// Helper to parse scores and get knockout winner
function getKnockoutWinnerSlot(scoreStr: string | undefined): 'team1' | 'team2' | null {
  if (!scoreStr) return null;
  const cleaned = scoreStr.trim();
  if (cleaned === '' || cleaned === '-') return null;

  // Check for penalty shootouts: e.g. "1-1 (4-3 p.)" or "1-1 (4-3)"
  const penaltyMatch = cleaned.match(/\((\d+)\s*-\s*(\d+)[^)]*?\)/);
  if (penaltyMatch) {
    const p1 = parseInt(penaltyMatch[1], 10);
    const p2 = parseInt(penaltyMatch[2], 10);
    if (p1 > p2) return 'team1';
    if (p2 > p1) return 'team2';
  }

  const baseScore = cleaned.split(/\s+/)[0];
  const parts = baseScore.split('-');
  if (parts.length >= 2) {
    const s1 = parseInt(parts[0], 10);
    const s2 = parseInt(parts[1], 10);
    if (!isNaN(s1) && !isNaN(s2)) {
      if (s1 > s2) return 'team1';
      if (s2 > s1) return 'team2';
    }
  }
  return null;
}

export function TournamentBracket({ matches, realResults, participants, lang, theme }: Props) {
  const [subTab, setSubTab] = useState<BracketSubTab>('groups');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('All');
  const [selectedMatchForPredictions, setSelectedMatchForPredictions] = useState<Match | null>(null);
  const t = TRANSLATIONS[lang];

  // Calculate standings for all groups on-the-fly
  const groupStandings = useMemo(() => {
    const standings: Record<string, any[]> = {};
    const groupNames = [
      'Group A', 'Group B', 'Group C', 'Group D', 
      'Group E', 'Group F', 'Group G', 'Group H', 
      'Group I', 'Group J', 'Group K', 'Group L'
    ];
    
    groupNames.forEach(gName => {
      standings[gName] = calculateGroupStandings(gName, matches, realResults);
    });
    
    return standings;
  }, [matches, realResults]);

  // Helper to check if all 6 matches of a group have real results (definitive group)
  const isGroupFinished = (gName: string): boolean => {
    const groupMatches = matches.filter(m => m.group === gName);
    return groupMatches.length === 6 && groupMatches.every(m => m.realResult && m.realResult.trim() !== '' && m.realResult.trim() !== '-');
  };

  // Helper to resolve a Round of 32 team from current calculated standings on-the-fly
  const resolveR32Team = (id: string, slot: 'team1' | 'team2'): string => {
    const mappings: Record<string, { t1: string, t2: string }> = {
      'M73': { t1: '2A', t2: '2B' },
      'M74': { t1: '1E', t2: '3rd' },
      'M75': { t1: '1F', t2: '2C' },
      'M76': { t1: '1C', t2: '2F' },
      'M77': { t1: '1I', t2: '3rd' },
      'M78': { t1: '2E', t2: '2I' },
      'M79': { t1: '1A', t2: '3rd' },
      'M80': { t1: '1L', t2: '3rd' },
      'M81': { t1: '1D', t2: '3rd' },
      'M82': { t1: '1G', t2: '3rd' },
      'M83': { t1: '2K', t2: '2L' },
      'M84': { t1: '1H', t2: '2J' },
      'M85': { t1: '1B', t2: '3rd' },
      'M86': { t1: '1J', t2: '2H' },
      'M87': { t1: '1K', t2: '3rd' },
      'M88': { t1: '2D', t2: '2G' }
    };

    const map = mappings[id];
    if (!map) return slot === 'team1' ? 'Eq. 1' : 'Eq. 2';

    const code = slot === 'team1' ? map.t1 : map.t2;

    if (code === '3rd') {
      const fallbackLabels: Record<string, string> = {
        'M74': '3º Grupo A/B/C/D/F',
        'M77': '3º Grupo C/D/F/G/H',
        'M79': '3º Grupo C/E/F/H/I',
        'M80': '3º Grupo E/H/I/J/K',
        'M81': '3º Grupo B/E/F/I/J',
        'M82': '3º Grupo A/E/H/I/J',
        'M85': '3º Grupo E/F/G/I/J',
        'M87': '3º Grupo D/E/I/J/L'
      };
      return fallbackLabels[id] || '3º Clasificado';
    }

    const position = parseInt(code.charAt(0), 10);
    const groupLetter = code.charAt(1);
    const groupName = `Group ${groupLetter}`;
    
    if (isGroupFinished(groupName)) {
      const standings = groupStandings[groupName] || [];
      const teamObj = standings[position - 1];
      
      if (teamObj && teamObj.team) {
        return teamObj.team;
      }
    }

    const ordinal = position === 1 ? '1º' : '2º';
    return `${ordinal} Grupo ${groupLetter}`;
  };

  // Recursively resolve team name for a knockout slot
  function resolveTeamName(matchId: string, slot: 'team1' | 'team2', matchesList: Match[]): string {
    const match = matchesList.find(m => m.id === matchId);
    
    const mNum = parseInt(matchId.substring(1), 10);
    if (mNum >= 73 && mNum <= 88) {
      if (match && match.team1 && match.team1.length === 3 && match.team2 && match.team2.length === 3) {
        return slot === 'team1' ? match.team1 : match.team2;
      }
      return resolveR32Team(matchId, slot);
    }

    const parents: Record<string, { t1: string, t2: string }> = {
      'M89': { t1: 'M73', t2: 'M74' },
      'M90': { t1: 'M75', t2: 'M76' },
      'M91': { t1: 'M77', t2: 'M78' },
      'M92': { t1: 'M79', t2: 'M80' },
      'M93': { t1: 'M81', t2: 'M82' },
      'M94': { t1: 'M83', t2: 'M84' },
      'M95': { t1: 'M85', t2: 'M86' },
      'M96': { t1: 'M87', t2: 'M88' },
      'M97': { t1: 'M89', t2: 'M90' },
      'M98': { t1: 'M91', t2: 'M92' },
      'M99': { t1: 'M93', t2: 'M94' },
      'M100': { t1: 'M95', t2: 'M96' },
      'M101': { t1: 'M97', t2: 'M98' },
      'M102': { t1: 'M99', t2: 'M100' },
      'M103': { t1: 'M101', t2: 'M102' },
      'M104': { t1: 'M101', t2: 'M102' }
    };

    const p = parents[matchId];
    if (!p) return slot === 'team1' ? (match?.team1 || 'Eq. 1') : (match?.team2 || 'Eq. 2');

    const parentMatchId = slot === 'team1' ? p.t1 : p.t2;

    if (matchId === 'M103') {
      return resolveLoserOf(parentMatchId, matchesList);
    } else {
      return resolveWinnerOf(parentMatchId, matchesList);
    }
  }

  function resolveWinnerOf(matchId: string, matchesList: Match[]): string {
    const match = matchesList.find(m => m.id === matchId);
    if (!match) return `Ganador ${matchId}`;

    const winnerSlot = getKnockoutWinnerSlot(match.realResult);
    if (winnerSlot === 'team1') {
      return resolveTeamName(matchId, 'team1', matchesList);
    }
    if (winnerSlot === 'team2') {
      return resolveTeamName(matchId, 'team2', matchesList);
    }
    return `Ganador ${matchId}`;
  }

  function resolveLoserOf(matchId: string, matchesList: Match[]): string {
    const match = matchesList.find(m => m.id === matchId);
    if (!match) return `Perdedor ${matchId}`;

    const winnerSlot = getKnockoutWinnerSlot(match.realResult);
    if (winnerSlot === 'team1') {
      return resolveTeamName(matchId, 'team2', matchesList);
    }
    if (winnerSlot === 'team2') {
      return resolveTeamName(matchId, 'team1', matchesList);
    }
    return `Perdedor ${matchId}`;
  }

  // Extract unique group names (excluding the Knockout Stage group!)
  const groupNames = Array.from(new Set(matches.map(m => m.group).filter(g => g && g !== 'Fase Eliminatoria' && g !== 'Knockout Stage'))) as string[];
  const sortedGroupNames = groupNames.sort((a, b) => a.localeCompare(b));

  // Compute played matches and total matches
  const playedMatchesCount = matches.filter(m => m.realResult && m.realResult.trim() !== '' && m.realResult.trim() !== '-').length;
  const totalMatchesCount = matches.length;

  // Knockout match objects resolving dynamic country progression
  const getKnockoutMatch = (id: string, defaultT1: string, defaultT2: string, defaultDate: string, defaultTime: string, defaultVenue: string): Match => {
    const found = matches.find(m => m.id === id);
    const resolvedT1 = resolveTeamName(id, 'team1', matches);
    const resolvedT2 = resolveTeamName(id, 'team2', matches);

    if (found) {
      return {
        ...found,
        team1: resolvedT1,
        team2: resolvedT2
      };
    }
    return {
      id,
      team1: resolvedT1 || defaultT1,
      team2: resolvedT2 || defaultT2,
      group: lang === 'es' ? 'Fase Eliminatoria' : 'Knockout Stage',
      date: defaultDate,
      time: defaultTime,
      ground: defaultVenue,
      realResult: realResults.matches[id] || ''
    };
  };

  const r32Ids = ['M73', 'M74', 'M75', 'M76', 'M77', 'M78', 'M79', 'M80', 'M81', 'M82', 'M83', 'M84', 'M85', 'M86', 'M87', 'M88'];
  const r16Ids = ['M89', 'M90', 'M91', 'M92', 'M93', 'M94', 'M95', 'M96'];
  const qfIds = ['M97', 'M98', 'M99', 'M100'];
  const sfIds = ['M101', 'M102'];

  const r32Matches = r32Ids.map(id => getKnockoutMatch(id, 'Eq. 1', 'Eq. 2', '28 Jun 2026', '15:00 UTC-7', 'Los Angeles Stadium'));
  const r16Matches = r16Ids.map(id => getKnockoutMatch(id, 'Ganador M73', 'Ganador M74', '4 Jul 2026', '16:00 UTC-7', 'Seattle Stadium'));
  const qfMatches = qfIds.map(id => getKnockoutMatch(id, 'Ganador M89', 'Ganador M90', '9 Jul 2026', '17:00 UTC-4', 'Boston Stadium'));
  const sfMatches = sfIds.map(id => getKnockoutMatch(id, 'Ganador M97', 'Ganador M98', '14 Jul 2026', '19:00 UTC-5', 'Dallas Stadium'));
  
  const thirdPlaceMatch = getKnockoutMatch('M103', 'Perdedor M101', 'Perdedor M102', '18 Jul 2026', '15:00 UTC-5', 'Miami Stadium');
  const finalMatch = getKnockoutMatch('M104', 'Ganador M101', 'Ganador M102', '19 Jul 2026', '16:00 UTC-4', 'New York NJ Stadium');

  const renderBracketMatchCard = (m: Match) => {
    const isT1Real = m.team1.length === 3;
    const isT2Real = m.team2.length === 3;
    const realScore = realResults.matches[m.id];

    return (
      <div 
        key={m.id} 
        className="knockout-match-card animate-fade-in"
        onClick={() => setSelectedMatchForPredictions(m)}
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
          <span className="k-match-date">📅 {formatMatchDateToClient(m.date, m.time, lang)} - {formatMatchTimeToClient(m.date, m.time, lang)}</span>
        </div>
        
        <div className="k-match-teams" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <div className="k-team" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
            {isT1Real ? (
              <img src={getFlagImgUrl(m.team1)} alt={m.team1} className="flag-icon-img" style={{ width: '18px', height: '12px', borderRadius: '2px', flexShrink: 0 }} />
            ) : (
              <span className="k-flag">🏳️</span>
            )}
            <span className="k-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={normalizeTeamCode(m.team1)}>
              {normalizeTeamCode(m.team1)}
            </span>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '40px', flexShrink: 0 }}>
            {realScore ? (
              <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#059669', background: '#ecfdf5', padding: '0.1rem 0.4rem', borderRadius: '4px', border: '1px solid #a7f3d0' }}>
                {realScore}
              </span>
            ) : (
              <div className="k-vs">vs</div>
            )}
          </div>

          <div className="k-team" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'flex-end', minWidth: 0 }}>
            <span className="k-name" style={{ textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={normalizeTeamCode(m.team2)}>
              {normalizeTeamCode(m.team2)}
            </span>
            {isT2Real ? (
              <img src={getFlagImgUrl(m.team2)} alt={m.team2} className="flag-icon-img" style={{ width: '18px', height: '12px', borderRadius: '2px', flexShrink: 0 }} />
            ) : (
              <span className="k-flag">🏳️</span>
            )}
          </div>
        </div>

        <div className="k-match-footer">
          <span className="k-venue" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={m.ground}>🏟️ {m.ground}</span>
        </div>
      </div>
    );
  };

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
                          {m.date && <span>📅 {formatMatchDateToClient(m.date, m.time, lang)} @ {formatMatchTimeToClient(m.date, m.time, lang)}</span>}
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

          <div className="bracket-canvas-wrapper">
            <div className="bracket-canvas">
              {/* Dieciseisavos (Round of 32) */}
              <div className="bracket-round-column r32">
                <h3 className="round-column-title">1/16 {lang === 'es' ? 'Final' : 'Finals'}</h3>
                <div className="round-matches-container">
                  {r32Matches.map(m => renderBracketMatchCard(m))}
                </div>
              </div>

              {/* Octavos (Round of 16) */}
              <div className="bracket-round-column r16">
                <h3 className="round-column-title">1/8 {lang === 'es' ? 'Final' : 'Finals'}</h3>
                <div className="round-matches-container">
                  {r16Matches.map(m => renderBracketMatchCard(m))}
                </div>
              </div>

              {/* Cuartos (Quarterfinals) */}
              <div className="bracket-round-column qf">
                <h3 className="round-column-title">1/4 {lang === 'es' ? 'Final' : 'Finals'}</h3>
                <div className="round-matches-container">
                  {qfMatches.map(m => renderBracketMatchCard(m))}
                </div>
              </div>

              {/* Semifinales (Semifinals) */}
              <div className="bracket-round-column sf">
                <h3 className="round-column-title">{lang === 'es' ? 'Semifinales' : 'Semifinals'}</h3>
                <div className="round-matches-container">
                  {sfMatches.map(m => renderBracketMatchCard(m))}
                </div>
              </div>

              {/* Finales (Final & 3rd Place) */}
              <div className="bracket-round-column finals">
                <h3 className="round-column-title">{lang === 'es' ? 'Gran Final' : 'Final'}</h3>
                <div className="round-matches-container">
                  <div className="finals-card-wrapper main-final">
                    <span className="finals-card-label gold">🏆 {lang === 'es' ? 'CAMPEÓN' : 'CHAMPION'}</span>
                    {renderBracketMatchCard(finalMatch)}
                  </div>
                  
                  <div className="finals-card-wrapper third-place">
                    <span className="finals-card-label bronze">🥉 {lang === 'es' ? '3er Puesto' : '3rd Place'}</span>
                    {renderBracketMatchCard(thirdPlaceMatch)}
                  </div>
                </div>
              </div>
            </div>
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

