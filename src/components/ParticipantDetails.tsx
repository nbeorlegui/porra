import { useState, useEffect, useRef, useMemo } from 'react';
import { Participant, Match, AppState, Predictions } from '../domain/types';
import { normalizeTeamCode, getFlagImgUrl } from '../utils/flags';
import { TRANSLATIONS, Lang } from '../utils/translations';
import { formatMatchLocalDateTime, getKickoffTimeMs } from '../utils/timezone';
import { calculateGroupStandings } from '../utils/standings';
import { MatchPredictionsModal } from './MatchPredictionsModal';
import confetti from 'canvas-confetti';

interface Props {
  participant: Participant;
  matches: Match[];
  realResults: AppState['realResults'];
  onClose: () => void;
  onSavePredictions: (name: string, updatedPredictions: Predictions, password?: string) => Promise<void>;
  lang: Lang;
  theme?: 'light' | 'dark';
  isAdmin?: boolean;
  initialMatchId?: string | null;
  participants: Participant[];
}

const SCORE_OPTIONS = ['', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

const parseScore = (scoreStr: string | undefined): [string, string] => {
  if (!scoreStr) return ['', ''];
  const baseScore = scoreStr.split('(')[0].trim();
  if (!baseScore.includes('-')) return ['', ''];
  const parts = baseScore.split('-');
  return [parts[0].trim(), parts[1].trim()];
};

const LOCK_BEFORE_KICKOFF_MS = 6 * 60 * 60 * 1000;

function isMatchLocked(m: Match, isAdmin = false): boolean {
  if (isAdmin) return false;

  const kickoffTime = getKickoffTimeMs(m);
  if (!kickoffTime) return false;

  return Date.now() >= kickoffTime - LOCK_BEFORE_KICKOFF_MS;
}

export function ParticipantDetails({ 
  participant, 
  matches, 
  realResults, 
  onSavePredictions, 
  lang, 
  theme, 
  isAdmin = false,
  initialMatchId = null,
  participants
}: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedPreds, setEditedPredictions] = useState<Predictions>({ ...participant.predictions });
  const [saving, setSaving] = useState(false);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [matchSearchTerm, setMatchSearchTerm] = useState('');
  
  // New States for Improved UX
  const [activePhase, setActivePhase] = useState<'groups' | 'knockout'>('groups');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedMatchForOthers, setSelectedMatchForOthers] = useState<Match | null>(null);
  
  // New State for Filtering Knockout Rounds
  const [selectedRoundFilter, setSelectedRoundFilter] = useState<'all' | 'r32' | 'r16' | 'qf' | 'sf' | 'finals'>('all');

  const t = TRANSLATIONS[lang];
  const matchRefs = useRef<Record<string, HTMLDivElement | null>>({});

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
    return groupMatches.length === 6 && groupMatches.every(m => {
      const real = realResults.matches[m.id];
      return real && real.trim() !== '' && real.trim() !== '-';
    });
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

  const getKnockoutWinnerSlot = (scoreStr: string | undefined): 'team1' | 'team2' | null => {
    if (!scoreStr) return null;
    const cleaned = scoreStr.trim();
    if (cleaned === '' || cleaned === '-') return null;

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
  };

  const resolveWinnerOf = (matchId: string, matchesList: Match[]): string => {
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
  };

  const resolveLoserOf = (matchId: string, matchesList: Match[]): string => {
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
  };

  const resolveTeamName = (matchId: string, slot: 'team1' | 'team2', matchesList: Match[]): string => {
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
  };

  // Sync state if participant changes
  useEffect(() => {
    setEditedPredictions({ ...participant.predictions });
    setIsEditing(false);
    setCreatedPassword(null);
  }, [participant]);

  // Handle auto-focus and navigation based on initialMatchId
  useEffect(() => {
    if (initialMatchId) {
      const matchingMatch = matches.find(m => m.id === initialMatchId);
      if (matchingMatch) {
        const groupName = matchingMatch.group;
        if (groupName === 'Fase Eliminatoria' || groupName === 'Knockout Stage') {
          setActivePhase('knockout');
          const num = parseInt(matchingMatch.id.substring(1), 10);
          if (num >= 73 && num <= 88) setSelectedRoundFilter('r32');
          else if (num >= 89 && num <= 96) setSelectedRoundFilter('r16');
          else if (num >= 97 && num <= 100) setSelectedRoundFilter('qf');
          else if (num >= 101 && num <= 102) setSelectedRoundFilter('sf');
          else if (num >= 103 && num <= 104) setSelectedRoundFilter('finals');
        } else if (groupName) {
          setActivePhase('groups');
          setSelectedGroup(groupName);
        }
      }
      const timer = setTimeout(() => {
        if (matchRefs.current[initialMatchId]) {
          matchRefs.current[initialMatchId]?.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });
        }
      }, 400);
      return () => clearTimeout(timer);
    } else {
      if (!selectedGroup) {
        setSelectedGroup('Group A');
      }
    }
  }, [initialMatchId, matches, selectedGroup]);

  // Celebratory confetti trigger when a participant's card has scored a "pleno" (+3 pts / exact match)
  useEffect(() => {
    if (initialMatchId) {
      const pts = participant.points.matches[initialMatchId] || 0;
      if (pts >= 3) {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          zIndex: 10000
        });
        return;
      }
    }

    const plenosCount = Object.values(participant.points.matches).filter(pts => pts >= 3).length;
    if (plenosCount > 0) {
      confetti({
        particleCount: 35,
        spread: 45,
        origin: { y: 0.75 },
        scalar: 0.8,
        zIndex: 10000
      });
    }
  }, [participant, initialMatchId]);

  const handleChangeGeneral = (field: keyof Omit<Predictions, 'matches'>, value: string) => {
    setEditedPredictions(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleScoreChange = (matchId: string, teamIndex: 1 | 2, val: string) => {
    const currentScore = editedPreds.matches[matchId] || '';
    const [s1, s2] = parseScore(currentScore);
    
    const newScore1 = teamIndex === 1 ? val : s1;
    const newScore2 = teamIndex === 2 ? val : s2;
    
    let finalScore = '';
    if (newScore1 !== '' || newScore2 !== '') {
      finalScore = `${newScore1}-${newScore2}`;
      
      const isKnockout = matchId.startsWith('M') && parseInt(matchId.substring(1), 10) >= 73;
      if (isKnockout && newScore1 === newScore2 && newScore1 !== '') {
        if (currentScore.toUpperCase().includes('(Q2)')) {
          finalScore += ' (Q2)';
        } else {
          finalScore += ' (Q1)';
        }
      }
    }
    
    setEditedPredictions(prev => ({
      ...prev,
      matches: {
        ...prev.matches,
        [matchId]: finalScore
      }
    }));
  };

  const handleQualifierChange = (matchId: string, qualifier: 'Q1' | 'Q2') => {
    const currentScore = editedPreds.matches[matchId] || '';
    const [s1, s2] = parseScore(currentScore);
    if (s1 === '' || s2 === '') return;
    
    const finalScore = `${s1}-${s2} (${qualifier})`;
    setEditedPredictions(prev => ({
      ...prev,
      matches: {
        ...prev.matches,
        [matchId]: finalScore
      }
    }));
  };

  const handleEditClick = () => {
    if (participant.password) {
      const promptText = lang === 'es' 
        ? `🔑 Introduce tu contraseña para editar las predicciones de ${participant.name}:`
        : `🔑 Enter your password to edit the predictions for ${participant.name}:`;
      const pwd = window.prompt(promptText);
      
      if (pwd === participant.password) {
        setIsEditing(true);
      } else if (pwd !== null) {
        alert(lang === 'es' ? '❌ Contraseña incorrecta.' : '❌ Incorrect password.');
      }
    } else {
      const setupText = lang === 'es'
        ? `🔒 Esta es la primera vez que editas tus predicciones.\nElige una contraseña para protegerlas en el futuro:`
        : `🔒 This is the first time you edit your predictions.\nPlease choose a password to protect them in the future:`;
      const newPwd = window.prompt(setupText);
      
      if (newPwd && newPwd.trim().length > 0) {
        setCreatedPassword(newPwd.trim());
        setIsEditing(true);
      } else if (newPwd !== null) {
        alert(lang === 'es' ? '❌ Debes elegir una contraseña válida para poder editar.' : '❌ You must choose a valid password to start editing.');
      }
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const cleanedMatches: Record<string, string> = {};
      Object.entries(editedPreds.matches).forEach(([matchId, score]) => {
        if (score) {
          const [s1, s2] = parseScore(score);
          if (s1 !== '' && s2 !== '') {
            let finalScore = `${s1}-${s2}`;
            const isKnockout = matchId.startsWith('M') && parseInt(matchId.substring(1), 10) >= 73;
            if (isKnockout && s1 === s2) {
              if (score.toUpperCase().includes('(Q2)')) {
                finalScore += ' (Q2)';
              } else {
                finalScore += ' (Q1)';
              }
            }
            cleanedMatches[matchId] = finalScore;
          } else {
            cleanedMatches[matchId] = '';
          }
        }
      });

      const cleanedPreds = {
        ...editedPreds,
        matches: cleanedMatches
      };

      await onSavePredictions(participant.name, cleanedPreds, createdPassword || undefined);
      setIsEditing(false);
      setCreatedPassword(null);
    } finally {
      setSaving(false);
    }
  };

  const isFieldDisabled = (fieldName: keyof Omit<Predictions, 'matches'>) => {
    if (isAdmin) return false;
    const isRealSet = !!realResults[fieldName];
    const isOriginalSet = !!participant.predictions[fieldName] && participant.predictions[fieldName].trim() !== '';
    return isRealSet || isOriginalSet;
  };

  // Helper to determine the state of a group for colorization
  const getGroupState = (groupName: string): 'finished' | 'today' | 'future' => {
    const groupMatches = matches.filter(m => m.group === groupName);
    
    const isFinished = groupMatches.length === 6 && groupMatches.every(m => {
      const real = realResults.matches[m.id];
      return real && real.trim() !== '' && real.trim() !== '-';
    });

    if (isFinished) return 'finished';

    const today = new Date();
    const hasToday = groupMatches.some(m => {
      const real = realResults.matches[m.id];
      if (real && real.trim() !== '' && real.trim() !== '-') return false;

      const ms = getKickoffTimeMs(m);
      if (!ms) return false;
      const d = new Date(ms);
      return d.getFullYear() === today.getFullYear() &&
             d.getMonth() === today.getMonth() &&
             d.getDate() === today.getDate();
    });

    if (hasToday) return 'today';

    return 'future';
  };

  // Helper to get color of match-row depending on user's points
  const getMatchBackgroundStyle = (matchId: string) => {
    const real = realResults.matches[matchId];
    const hasReal = real && real.trim() !== '' && real.trim() !== '-';
    if (!hasReal) return {}; // Default card background if not played

    const pts = participant.points.matches[matchId] || 0;

    if (pts >= 3) {
      // GREEN - Perfect Pleno
      return {
        backgroundColor: theme === 'dark' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(240, 253, 250, 0.95)',
        borderColor: '#10b981',
        borderLeft: '5px solid #10b981'
      };
    } else if (pts === 1) {
      // YELLOW - Partial Win / Sign Win
      return {
        backgroundColor: theme === 'dark' ? 'rgba(234, 179, 8, 0.15)' : 'rgba(254, 249, 195, 0.95)',
        borderColor: '#d97706',
        borderLeft: '5px solid #d97706'
      };
    } else {
      // RED - Zero points / Fail
      return {
        backgroundColor: theme === 'dark' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(254, 242, 242, 0.95)',
        borderColor: '#ef4444',
        borderLeft: '5px solid #ef4444'
      };
    }
  };

  // Filter matches based on search term
  const filteredMatches = matches.filter(m => {
    const term = matchSearchTerm.trim().toLowerCase();
    if (!term) return true;
    const t1 = normalizeTeamCode(m.team1).toLowerCase();
    const t2 = normalizeTeamCode(m.team2).toLowerCase();
    const grp = (m.group || '').toLowerCase();
    const mid = m.id.toLowerCase();
    return t1.includes(term) || t2.includes(term) || grp.includes(term) || mid.includes(term);
  });

  // Group matches by phase
  const groupMatchesList: Match[] = [];
  const knockoutMatchesList: Match[] = [];

  filteredMatches.forEach(m => {
    const groupName = m.group || 'Other Matches';
    if (groupName === 'Fase Eliminatoria' || groupName === 'Knockout Stage') {
      knockoutMatchesList.push(m);
    } else {
      groupMatchesList.push(m);
    }
  });

  // Sort groups alphabetically
  const sortedGroupNames = [
    'Group A', 'Group B', 'Group C', 'Group D', 
    'Group E', 'Group F', 'Group G', 'Group H', 
    'Group I', 'Group J', 'Group K', 'Group L'
  ];

  // Sort knockout matches numerically by ID representing exact bracket order
  knockoutMatchesList.sort((a, b) => {
    const numA = parseInt(a.id.substring(1), 10);
    const numB = parseInt(b.id.substring(1), 10);
    return numA - numB;
  });

  // Active items based on view selection
  const visibleGroupMatches = useMemo(() => {
    if (matchSearchTerm.trim() !== '') {
      // If searching, bypass group tabs and show all matching group stage matches
      return groupMatchesList;
    }
    return groupMatchesList.filter(m => m.group === selectedGroup);
  }, [groupMatchesList, selectedGroup, matchSearchTerm]);

  // Filter Knockout Matches dynamically by round
  const visibleKnockoutMatches = useMemo(() => {
    return knockoutMatchesList.filter(m => {
      if (selectedRoundFilter === 'all') return true;
      const num = parseInt(m.id.substring(1), 10);
      if (selectedRoundFilter === 'r32') return num >= 73 && num <= 88;
      if (selectedRoundFilter === 'r16') return num >= 89 && num <= 96;
      if (selectedRoundFilter === 'qf') return num >= 97 && num <= 100;
      if (selectedRoundFilter === 'sf') return num >= 101 && num <= 102;
      if (selectedRoundFilter === 'finals') return num >= 103 && num <= 104;
      return true;
    });
  }, [knockoutMatchesList, selectedRoundFilter]);

  return (
    <div className="participant-details-view flex flex-col gap-1.5 animate-fade-in" style={{ padding: '0.25rem', maxHeight: '85vh', overflowY: 'auto' }}>
      
      {/* Title Header */}
      <div className="details-header flex justify-between items-center" style={{ borderBottom: '2px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '0.75rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text)' }}>
            {t.pdTitle.replace('{name}', participant.name)}
          </h2>
          <p className="text-muted" style={{ fontSize: '0.85rem' }}>
            {t.pdPointsLabel}: <strong style={{ color: 'var(--accent-blue)', fontSize: '1.15rem' }}>{participant.points.total} pts</strong>
          </p>
        </div>
        <div>
          {isEditing ? (
            <button 
              onClick={handleSave} 
              disabled={saving}
              className="save-btn"
              style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem', backgroundColor: 'var(--accent-blue)', borderColor: 'var(--accent-blue)' }}
            >
              {saving ? `💾 ${t.pdSaving}` : t.pdSaveBtn}
            </button>
          ) : (
            <button 
              onClick={handleEditClick}
              className="toggle-admin-btn"
              style={{ 
                fontSize: '0.85rem', 
                padding: '0.4rem 0.8rem', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.25rem', 
                color: 'var(--accent-blue)', 
                borderColor: 'var(--accent-blue)',
                backgroundColor: 'transparent'
              }}
            >
              {t.pdEditBtn}
            </button>
          )}
        </div>
      </div>

      {/* SPECIAL PREDICTIONS ROW - MODERN HORIZONTAL SCROLL INTERFACE */}
      <div style={{ margin: '0.4rem 0 0.1rem 0' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 800, borderLeft: '4px solid var(--accent-blue)', paddingLeft: '0.5rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {t.pdSpecialPreds}
        </h3>
        
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'nowrap',
          overflowX: 'auto',
          gap: '0.6rem',
          marginBottom: '1rem',
          padding: '0.4rem 0.1rem',
          scrollbarWidth: 'thin',
          WebkitOverflowScrolling: 'touch'
        }}>
          
          {/* Card: Ganador Final */}
          <div style={{
            backgroundColor: 'var(--card-bg)',
            border: '1.5px solid var(--border)',
            borderRadius: '8px',
            padding: '0.5rem 0.75rem',
            minWidth: '175px',
            flex: '1 0 auto',
            boxShadow: 'var(--shadow)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '0.2rem'
          }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-light)', opacity: 0.8, letterSpacing: '0.04em' }}>
              {t.pdFinalWinner}
            </span>
            {isEditing ? (
              <input 
                type="text" 
                value={editedPreds.ganadorFinal} 
                onChange={e => handleChangeGeneral('ganadorFinal', e.target.value)}
                disabled={isFieldDisabled('ganadorFinal')}
                style={{ 
                  padding: '0.25rem', 
                  border: '1px solid var(--border)', 
                  borderRadius: '4px', 
                  fontSize: '0.8rem',
                  backgroundColor: 'var(--bg)',
                  color: 'var(--text)',
                  width: '100%',
                  ...(isFieldDisabled('ganadorFinal') ? { opacity: 0.6, cursor: 'not-allowed' } : {})
                }}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', fontSize: '0.85rem' }}>
                <span style={{ fontWeight: '700', color: 'var(--text)' }}>{participant.predictions.ganadorFinal || '-'}</span>
                <span className="text-muted" style={{ fontSize: '0.72rem', marginTop: '0.1rem' }}>
                  {realResults.ganadorFinal && realResults.ganadorFinal.trim() !== '' && realResults.ganadorFinal.trim() !== '-' ? (
                    <>Real: <strong style={{ color: 'var(--accent-green)' }}>{realResults.ganadorFinal}</strong></>
                  ) : (
                    <>Real: <strong style={{ opacity: 0.6 }}>NA</strong></>
                  )}
                </span>
              </div>
            )}
          </div>

          {/* Card: Máximo Goleador */}
          <div style={{
            backgroundColor: 'var(--card-bg)',
            border: '1.5px solid var(--border)',
            borderRadius: '8px',
            padding: '0.5rem 0.75rem',
            minWidth: '175px',
            flex: '1 0 auto',
            boxShadow: 'var(--shadow)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '0.2rem'
          }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-light)', opacity: 0.8, letterSpacing: '0.04em' }}>
              {t.pdMaxScorer}
            </span>
            {isEditing ? (
              <input 
                type="text" 
                value={editedPreds.maxGoleador} 
                onChange={e => handleChangeGeneral('maxGoleador', e.target.value)}
                disabled={isFieldDisabled('maxGoleador')}
                style={{ 
                  padding: '0.25rem', 
                  border: '1px solid var(--border)', 
                  borderRadius: '4px', 
                  fontSize: '0.8rem',
                  backgroundColor: 'var(--bg)',
                  color: 'var(--text)',
                  width: '100%',
                  ...(isFieldDisabled('maxGoleador') ? { opacity: 0.6, cursor: 'not-allowed' } : {})
                }}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', fontSize: '0.85rem' }}>
                <span style={{ fontWeight: '700', color: 'var(--text)' }}>{participant.predictions.maxGoleador || '-'}</span>
                <span className="text-muted" style={{ fontSize: '0.72rem', marginTop: '0.1rem' }}>
                  {realResults.maxGoleador && realResults.maxGoleador.trim() !== '' && realResults.maxGoleador.trim() !== '-' ? (
                    <>Real: <strong style={{ color: 'var(--accent-green)' }}>{realResults.maxGoleador}</strong></>
                  ) : (
                    <>Real: <strong style={{ opacity: 0.6 }}>NA</strong></>
                  )}
                </span>
              </div>
            )}
          </div>

          {/* Card: Máximo Asistente */}
          <div style={{
            backgroundColor: 'var(--card-bg)',
            border: '1.5px solid var(--border)',
            borderRadius: '8px',
            padding: '0.5rem 0.75rem',
            minWidth: '175px',
            flex: '1 0 auto',
            boxShadow: 'var(--shadow)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '0.2rem'
          }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-light)', opacity: 0.8, letterSpacing: '0.04em' }}>
              {t.pdMaxAssist}
            </span>
            {isEditing ? (
              <input 
                type="text" 
                value={editedPreds.maxAsistente} 
                onChange={e => handleChangeGeneral('maxAsistente', e.target.value)}
                disabled={isFieldDisabled('maxAsistente')}
                style={{ 
                  padding: '0.25rem', 
                  border: '1px solid var(--border)', 
                  borderRadius: '4px', 
                  fontSize: '0.8rem',
                  backgroundColor: 'var(--bg)',
                  color: 'var(--text)',
                  width: '100%',
                  ...(isFieldDisabled('maxAsistente') ? { opacity: 0.6, cursor: 'not-allowed' } : {})
                }}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', fontSize: '0.85rem' }}>
                <span style={{ fontWeight: '700', color: 'var(--text)' }}>{participant.predictions.maxAsistente || '-'}</span>
                <span className="text-muted" style={{ fontSize: '0.72rem', marginTop: '0.1rem' }}>
                  {realResults.maxAsistente && realResults.maxAsistente.trim() !== '' && realResults.maxAsistente.trim() !== '-' ? (
                    <>Real: <strong style={{ color: 'var(--accent-green)' }}>{realResults.maxAsistente}</strong></>
                  ) : (
                    <>Real: <strong style={{ opacity: 0.6 }}>NA</strong></>
                  )}
                </span>
              </div>
            )}
          </div>

          {/* Card: World Cup MVP */}
          <div style={{
            backgroundColor: 'var(--card-bg)',
            border: '1.5px solid var(--border)',
            borderRadius: '8px',
            padding: '0.5rem 0.75rem',
            minWidth: '175px',
            flex: '1 0 auto',
            boxShadow: 'var(--shadow)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '0.2rem'
          }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-light)', opacity: 0.8, letterSpacing: '0.04em' }}>
              {t.pdWorldCupMvp}
            </span>
            {isEditing ? (
              <input 
                type="text" 
                value={editedPreds.mvp} 
                onChange={e => handleChangeGeneral('mvp', e.target.value)}
                disabled={isFieldDisabled('mvp')}
                style={{ 
                  padding: '0.25rem', 
                  border: '1px solid var(--border)', 
                  borderRadius: '4px', 
                  fontSize: '0.8rem',
                  backgroundColor: 'var(--bg)',
                  color: 'var(--text)',
                  width: '100%',
                  ...(isFieldDisabled('mvp') ? { opacity: 0.6, cursor: 'not-allowed' } : {})
                }}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', fontSize: '0.85rem' }}>
                <span style={{ fontWeight: '700', color: 'var(--text)' }}>{participant.predictions.mvp || '-'}</span>
                <span className="text-muted" style={{ fontSize: '0.72rem', marginTop: '0.1rem' }}>
                  {realResults.mvp && realResults.mvp.trim() !== '' && realResults.mvp.trim() !== '-' ? (
                    <>Real: <strong style={{ color: 'var(--accent-green)' }}>{realResults.mvp}</strong></>
                  ) : (
                    <>Real: <strong style={{ opacity: 0.6 }}>NA</strong></>
                  )}
                </span>
              </div>
            )}
          </div>

          {/* Card: Spain Stage */}
          <div style={{
            backgroundColor: 'var(--card-bg)',
            border: '1.5px solid var(--border)',
            borderRadius: '8px',
            padding: '0.5rem 0.75rem',
            minWidth: '175px',
            flex: '1 0 auto',
            boxShadow: 'var(--shadow)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '0.2rem'
          }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-light)', opacity: 0.8, letterSpacing: '0.04em' }}>
              {t.pdSpainStage}
            </span>
            {isEditing ? (
              <input 
                type="text" 
                value={editedPreds.faseEspana} 
                onChange={e => handleChangeGeneral('faseEspana', e.target.value)}
                disabled={isFieldDisabled('faseEspana')}
                style={{ 
                  padding: '0.25rem', 
                  border: '1px solid var(--border)', 
                  borderRadius: '4px', 
                  fontSize: '0.8rem',
                  backgroundColor: 'var(--bg)',
                  color: 'var(--text)',
                  width: '100%',
                  ...(isFieldDisabled('faseEspana') ? { opacity: 0.6, cursor: 'not-allowed' } : {})
                }}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', fontSize: '0.85rem' }}>
                <span style={{ fontWeight: '700', color: 'var(--text)' }}>{participant.predictions.faseEspana || '-'}</span>
                <span className="text-muted" style={{ fontSize: '0.72rem', marginTop: '0.1rem' }}>
                  {realResults.faseEspana && realResults.faseEspana.trim() !== '' && realResults.faseEspana.trim() !== '-' ? (
                    <>Real: <strong style={{ color: 'var(--accent-green)' }}>{realResults.faseEspana}</strong></>
                  ) : (
                    <>Real: <strong style={{ opacity: 0.6 }}>NA</strong></>
                  )}
                </span>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* TWO SELECTION BOXES FOR MAIN PHASE SELECTOR (BLUE STYLE) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <button
          onClick={() => setActivePhase('groups')}
          style={{
            padding: '0.6rem',
            borderRadius: '8px',
            border: activePhase === 'groups' ? '2.5px solid var(--accent-blue)' : '1.5px solid var(--border)',
            backgroundColor: activePhase === 'groups' ? 'rgba(42, 57, 141, 0.08)' : 'var(--card-bg)',
            color: activePhase === 'groups' ? 'var(--accent-blue)' : 'var(--text-light)',
            fontWeight: 'bold',
            fontSize: '0.9rem',
            cursor: 'pointer',
            boxShadow: activePhase === 'groups' ? 'var(--shadow)' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem',
            transition: 'all 0.15s ease'
          }}
        >
          <span style={{ fontSize: '1.1rem' }}>⚽</span>
          <span>{lang === 'es' ? 'Fase de Grupos' : 'Group Stage'}</span>
        </button>
        <button
          onClick={() => setActivePhase('knockout')}
          style={{
            padding: '0.6rem',
            borderRadius: '8px',
            border: activePhase === 'knockout' ? '2.5px solid var(--accent-blue)' : '1.5px solid var(--border)',
            backgroundColor: activePhase === 'knockout' ? 'rgba(42, 57, 141, 0.08)' : 'var(--card-bg)',
            color: activePhase === 'knockout' ? 'var(--accent-blue)' : 'var(--text-light)',
            fontWeight: 'bold',
            fontSize: '0.9rem',
            cursor: 'pointer',
            boxShadow: activePhase === 'knockout' ? 'var(--shadow)' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem',
            transition: 'all 0.15s ease'
          }}
        >
          <span style={{ fontSize: '1.1rem' }}>🏆</span>
          <span>{lang === 'es' ? 'Fase Eliminatoria' : 'Knockout Stage'}</span>
        </button>
      </div>

      {/* FILTER SEARCH BAR */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem', backgroundColor: 'var(--bg)', padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
        
        {/* Search */}
        <input
          type="text"
          placeholder={lang === 'es' ? '🔍 Buscar por selección...' : '🔍 Search by team...'}
          value={matchSearchTerm}
          onChange={e => setMatchSearchTerm(e.target.value)}
          className="predictions-search-input"
          style={{ padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
        />
      </div>

      {/* FASE DE GRUPOS - GRID DE CAJITAS */}
      {activePhase === 'groups' && matchSearchTerm.trim() === '' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gap: '0.4rem',
          marginBottom: '1rem'
        }}>
          {sortedGroupNames.map(groupName => {
            const state = getGroupState(groupName);
            const isSelected = selectedGroup === groupName;

            let bgColor = 'var(--card-bg)';
            let borderColor = 'var(--border)';
            let textColor = 'var(--text)';

            if (state === 'finished') {
              bgColor = theme === 'dark' ? 'rgba(148, 163, 184, 0.08)' : 'rgba(241, 245, 249, 0.8)';
              borderColor = theme === 'dark' ? 'rgba(148, 163, 184, 0.25)' : 'rgba(203, 213, 225, 0.6)';
              textColor = 'var(--text-light)';
            } else if (state === 'today') {
              bgColor = theme === 'dark' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(220, 252, 231, 0.85)';
              borderColor = '#22c55e';
              textColor = theme === 'dark' ? '#4ade80' : '#15803d';
            } else {
              bgColor = theme === 'dark' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(219, 234, 254, 0.85)';
              borderColor = '#3b82f6';
              textColor = theme === 'dark' ? '#60a5fa' : '#1d4ed8';
            }

            return (
              <button
                key={groupName}
                onClick={() => setSelectedGroup(groupName)}
                style={{
                  backgroundColor: bgColor,
                  borderColor: isSelected ? 'var(--primary)' : borderColor,
                  borderStyle: 'solid',
                  borderWidth: isSelected ? '2.5px' : '1.5px',
                  color: textColor,
                  padding: '0.4rem 0.2rem',
                  borderRadius: '6px',
                  fontWeight: isSelected ? '800' : '600',
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.12s ease',
                  transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                  boxShadow: isSelected ? 'var(--shadow)' : 'none'
                }}
              >
                <div>{groupName.replace('Group ', 'Grupo ')}</div>
                {state === 'finished' && <span style={{ fontSize: '0.62rem', opacity: 0.7, display: 'block' }}>🏁 Fin</span>}
                {state === 'today' && <span style={{ fontSize: '0.62rem', fontWeight: 'bold', display: 'block' }}>⚡ ¡Hoy!</span>}
                {state === 'future' && <span style={{ fontSize: '0.62rem', opacity: 0.8, display: 'block' }}>📅 Pend</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* FASE ELIMINATORIA - FILTRO DE RONDAS */}
      {activePhase === 'knockout' && (
        <div style={{ 
          display: 'flex', 
          flexWrap: 'wrap', 
          gap: '0.35rem', 
          marginBottom: '1rem', 
          alignItems: 'center', 
          backgroundColor: 'var(--bg)', 
          padding: '0.5rem', 
          borderRadius: '8px', 
          border: '1px solid var(--border)' 
        }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-light)', textTransform: 'uppercase', opacity: 0.8, marginRight: '0.2rem' }}>
            {lang === 'es' ? 'Ronda:' : 'Round:'}
          </span>
          {[
            { id: 'all', label: lang === 'es' ? 'Todas' : 'All' },
            { id: 'r32', label: lang === 'es' ? 'Dieciseisavos' : 'R32' },
            { id: 'r16', label: lang === 'es' ? 'Octavos' : 'R16' },
            { id: 'qf', label: lang === 'es' ? 'Cuartos' : 'Quarter' },
            { id: 'sf', label: lang === 'es' ? 'Semifinales' : 'Semi' },
            { id: 'finals', label: lang === 'es' ? 'Finales' : 'Finals' }
          ].map(r => {
            const isSelected = selectedRoundFilter === r.id;
            return (
              <button
                key={r.id}
                onClick={() => setSelectedRoundFilter(r.id as any)}
                style={{
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.7rem',
                  borderRadius: '12px',
                  border: isSelected ? '1.5px solid var(--accent-blue)' : '1px solid var(--border)',
                  backgroundColor: isSelected ? 'var(--accent-blue)' : 'var(--card-bg)',
                  color: isSelected ? 'white' : 'var(--text-light)',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.1s'
                }}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      )}

      {/* RENDER LIST OF PARTIDOS IN 2 COLUMNS AND 3 ROWS FOR GROUPS (COMPACT MODE - MAX SPACE EFFICIENCY) */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: activePhase === 'groups' && matchSearchTerm.trim() === '' ? 'repeat(2, 1fr)' : '1fr', 
        gap: '0.4rem', 
        marginTop: '0.15rem' 
      }}>
        {activePhase === 'groups' ? (
          visibleGroupMatches.length > 0 ? (
            visibleGroupMatches.map(m => {
              const pred = isEditing ? editedPreds.matches[m.id] : participant.predictions.matches[m.id];
              const real = realResults.matches[m.id];
              const pts = participant.points.matches[m.id] || 0;
              const timeLocked = isMatchLocked(m, isAdmin);
              const isLocked = !isAdmin && (!!real || timeLocked);
              const locked6h = !isAdmin && !real && timeLocked;

              const isHighlighted = m.id === initialMatchId;
              const matchStyle = getMatchBackgroundStyle(m.id);

              const [r1, r2] = parseScore(real);
              const [s1, s2] = parseScore(pred);
              const isPlayed = real && real.trim() !== '' && real.trim() !== '-';

              return (
                <div 
                  key={m.id} 
                  ref={el => { matchRefs.current[m.id] = el; }}
                  className={`${isHighlighted ? 'match-row-highlight' : ''}`}
                  style={{ 
                    padding: '0.35rem 0.6rem', 
                    borderRadius: '8px', 
                    border: '1.5px solid var(--border)', 
                    display: 'flex', 
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.4rem',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                    transition: 'all 0.2s',
                    ...matchStyle,
                    ...(isLocked && !isPlayed ? { backgroundColor: 'var(--bg)', opacity: 0.85 } : {})
                  }}
                >
                  {/* LEFT COMPACT SECTION: Teams and Live/Official Score */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flex: '1 1 auto', minWidth: 0 }}>
                    {isPlayed && r1 !== '' && r2 !== '' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 'bold', minWidth: 0 }}>
                        <img src={getFlagImgUrl(m.team1)} alt={m.team1} className="flag-icon-img" style={{ width: '16px', height: '11px', borderRadius: '1.5px', flexShrink: 0 }} />
                        <span style={{ fontSize: '0.78rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{normalizeTeamCode(m.team1)}</span>
                        <span style={{
                          backgroundColor: 'var(--accent-blue)',
                          color: 'white',
                          padding: '0.05rem 0.25rem',
                          borderRadius: '3px',
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          margin: '0 0.05rem',
                          flexShrink: 0
                        }}>
                          {r1}-{r2}
                        </span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{normalizeTeamCode(m.team2)}</span>
                        <img src={getFlagImgUrl(m.team2)} alt={m.team2} className="flag-icon-img" style={{ width: '17px', height: '11px', borderRadius: '1.5px', flexShrink: 0 }} />
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 'bold', minWidth: 0 }}>
                        <img src={getFlagImgUrl(m.team1)} alt={m.team1} className="flag-icon-img" style={{ width: '16px', height: '11px', borderRadius: '1.5px', flexShrink: 0 }} />
                        <span style={{ color: 'var(--text)', fontSize: '0.78rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{normalizeTeamCode(m.team1)}</span>
                        <span className="text-muted font-normal" style={{ fontSize: '0.72rem', margin: '0 0.05rem', flexShrink: 0 }}>vs</span>
                        <span style={{ color: 'var(--text)', fontSize: '0.78rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{normalizeTeamCode(m.team2)}</span>
                        <img src={getFlagImgUrl(m.team2)} alt={m.team2} className="flag-icon-img" style={{ width: '16px', height: '11px', borderRadius: '1.5px', flexShrink: 0 }} />
                      </div>
                    )}
                  </div>

                  {/* RIGHT COMPACT SECTION: Date, Prediction, Points, Eye and Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', justifyContent: 'flex-end', flexShrink: 0 }}>
                    
                    {/* Compact Date */}
                    {!isEditing && (m.date || m.time || m.kickoffAtUtc) && (
                      <span style={{ fontSize: '0.62rem', color: 'var(--text-light)', opacity: 0.75, whiteSpace: 'nowrap', marginRight: '0.1rem' }}>
                        📅 {formatMatchLocalDateTime(m, lang).split(' ')[0]}
                      </span>
                    )}

                    {/* Prediction and Punts together */}
                    {!isEditing && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text)' }}>
                          Predicción: <strong style={{ color: 'var(--accent-blue)' }}>{pred ? pred.split('(')[0].trim() : '-'}</strong>
                        </span>
                        
                        {isPlayed && (
                          <div style={{ display: 'inline-flex' }}>
                            {pts >= 3 ? (
                              <span className="badge-pts-exact" style={{ fontSize: '0.62rem', padding: '0.05rem 0.2rem' }}>+3</span>
                            ) : pts === 1 ? (
                              <span className="badge-pts-outcome" style={{ fontSize: '0.62rem', padding: '0.05rem 0.2rem' }}>+1</span>
                            ) : (
                              <span className="badge-pts-zero" style={{ fontSize: '0.62rem', padding: '0.05rem 0.2rem' }}>0</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {locked6h && !isEditing && (
                      <span className="badge-pts-zero" style={{ fontSize: '0.58rem', padding: '0.05rem 0.15rem', whiteSpace: 'nowrap' }}>
                        🔒 Bloqueados
                      </span>
                    )}

                    {/* Mode Editing input placement */}
                    {isEditing && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <div className="match-score-selectors" style={{ width: '80px', margin: 0, flexShrink: 0 }}>
                          <select 
                            value={s1} 
                            onChange={e => handleScoreChange(m.id, 1, e.target.value)}
                            className="score-select"
                            disabled={isLocked}
                            style={{ padding: '0.05rem', fontSize: '0.75rem', height: '22px' }}
                          >
                            {SCORE_OPTIONS.map(opt => (
                              <option key={opt} value={opt}>{opt === '' ? '-' : opt}</option>
                            ))}
                          </select>
                          <span className="score-divider" style={{ fontSize: '0.75rem' }}>-</span>
                          <select 
                            value={s2} 
                            onChange={e => handleScoreChange(m.id, 2, e.target.value)}
                            className="score-select"
                            disabled={isLocked}
                            style={{ padding: '0.05rem', fontSize: '0.75rem', height: '22px' }}
                          >
                            {SCORE_OPTIONS.map(opt => (
                              <option key={opt} value={opt}>{opt === '' ? '-' : opt}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    {/* SILUETA EYE BUTTON */}
                    <button
                      type="button"
                      onClick={() => setSelectedMatchForOthers(m)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '0.15rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--accent-blue)',
                        transition: 'transform 0.1s, color 0.1s',
                        marginLeft: '0.15rem',
                        flexShrink: 0
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.15)';
                        e.currentTarget.style.color = 'var(--text)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.color = 'var(--accent-blue)';
                      }}
                      title={lang === 'es' ? 'Ver lo que ha puesto el resto' : 'View predictions from others'}
                    >
                      <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        width="18" 
                        height="18" 
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="2.2" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                      >
                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>

                  </div>
                </div>
              );
            })
          ) : (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem', backgroundColor: 'var(--card-bg)', border: '1.5px dashed var(--border)', borderRadius: '8px', color: 'var(--text-light)' }}>
              📭 {lang === 'es' ? 'No hay partidos de grupo que coincidan con los filtros.' : 'No group matches match the filters.'}
            </div>
          )
        ) : (
          /* FASE ELIMINATORIA (COMPACT MODE ALSO - MAX SPACE EFFICIENCY) */
          visibleKnockoutMatches.length > 0 ? (
            visibleKnockoutMatches.map(m => {
              const pred = isEditing ? editedPreds.matches[m.id] : participant.predictions.matches[m.id];
              const real = realResults.matches[m.id];
              const pts = participant.points.matches[m.id] || 0;
              const timeLocked = isMatchLocked(m, isAdmin);
              const isLocked = !isAdmin && (!!real || timeLocked);
              const locked6h = !isAdmin && !real && timeLocked;

              const isHighlighted = m.id === initialMatchId;
              const matchStyle = getMatchBackgroundStyle(m.id);

              const team1Resolved = resolveTeamName(m.id, 'team1', matches);
              const team2Resolved = resolveTeamName(m.id, 'team2', matches);
              const isT1Real = team1Resolved.length === 3;
              const isT2Real = team2Resolved.length === 3;

              const [r1, r2] = parseScore(real);
              const [s1, s2] = parseScore(pred);
              const isPlayed = real && real.trim() !== '' && real.trim() !== '-';

              let predictedQualifierCode = '';
              if (pred && pred.trim() !== '' && pred.trim() !== '-') {
                const [ps1, ps2] = parseScore(pred);
                if (ps1 !== '' && ps2 !== '') {
                  const pn1 = parseInt(ps1, 10);
                  const pn2 = parseInt(ps2, 10);
                  if (pn1 > pn2) predictedQualifierCode = team1Resolved;
                  else if (pn2 > pn1) predictedQualifierCode = team2Resolved;
                  else {
                    predictedQualifierCode = pred.toUpperCase().includes('(Q2)') ? team2Resolved : team1Resolved;
                  }
                }
              }

              return (
                <div 
                  key={m.id} 
                  ref={el => { matchRefs.current[m.id] = el; }}
                  className={`${isHighlighted ? 'match-row-highlight' : ''}`}
                  style={{ 
                    padding: '0.35rem 0.6rem', 
                    borderRadius: '8px', 
                    border: '1.5px solid var(--border)', 
                    display: 'flex', 
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.4rem',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                    transition: 'all 0.2s',
                    ...matchStyle,
                    ...(isLocked && !isPlayed ? { backgroundColor: 'var(--bg)', opacity: 0.85 } : {})
                  }}
                >
                  {/* LEFT COMPACT SECTION: Teams and Live/Official Score */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flex: '1 1 auto', minWidth: 0 }}>
                    {isPlayed && r1 !== '' && r2 !== '' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 'bold', minWidth: 0 }}>
                        {isT1Real ? (
                          <img src={getFlagImgUrl(team1Resolved)} alt={team1Resolved} className="flag-icon-img" style={{ width: '17px', height: '11px', borderRadius: '1.5px', flexShrink: 0 }} />
                        ) : (
                          <span style={{ fontSize: '0.7rem', flexShrink: 0 }}>🏳️</span>
                        )}
                        <span style={{ fontSize: '0.8rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{normalizeTeamCode(team1Resolved)}</span>
                        
                        <span style={{
                          backgroundColor: 'var(--accent-blue)',
                          color: 'white',
                          padding: '0.02rem 0.25rem',
                          borderRadius: '3px',
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          margin: '0 0.05rem',
                          flexShrink: 0
                        }}>
                          {r1}-{r2}
                        </span>
                        
                        <span style={{ fontSize: '0.8rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{normalizeTeamCode(team2Resolved)}</span>
                        {isT2Real ? (
                          <img src={getFlagImgUrl(team2Resolved)} alt={team2Resolved} className="flag-icon-img" style={{ width: '17px', height: '11px', borderRadius: '1.5px', flexShrink: 0 }} />
                        ) : (
                          <span style={{ fontSize: '0.7rem', flexShrink: 0 }}>🏳️</span>
                        )}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 'bold', minWidth: 0 }}>
                        {isT1Real ? (
                          <img src={getFlagImgUrl(team1Resolved)} alt={team1Resolved} className="flag-icon-img" style={{ width: '17px', height: '11px', borderRadius: '1.5px', flexShrink: 0 }} />
                        ) : (
                          <span style={{ fontSize: '0.7rem', flexShrink: 0 }}>🏳️</span>
                        )}
                        <span style={{ color: 'var(--text)', fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{normalizeTeamCode(team1Resolved)}</span>
                        
                        <span className="text-muted font-normal" style={{ fontSize: '0.72rem', margin: '0 0.05rem', flexShrink: 0 }}>vs</span>
                        
                        <span style={{ color: 'var(--text)', fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{normalizeTeamCode(team2Resolved)}</span>
                        {isT2Real ? (
                          <img src={getFlagImgUrl(team2Resolved)} alt={team2Resolved} className="flag-icon-img" style={{ width: '17px', height: '11px', borderRadius: '1.5px', flexShrink: 0 }} />
                        ) : (
                          <span style={{ fontSize: '0.7rem', flexShrink: 0 }}>🏳️</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* RIGHT COMPACT SECTION: Date, Prediction, Points, Eye and Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', justifyContent: 'flex-end', flexShrink: 0 }}>
                    
                    {/* Compact Date */}
                    {!isEditing && (m.date || m.time || m.kickoffAtUtc) && (
                      <span style={{ fontSize: '0.62rem', color: 'var(--text-light)', opacity: 0.75, whiteSpace: 'nowrap', marginRight: '0.1rem' }}>
                        📅 {formatMatchLocalDateTime(m, lang).split(' ')[0]}
                      </span>
                    )}

                    {/* Prediction and Punts together */}
                    {!isEditing && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text)' }}>
                          Predicción: <strong style={{ color: 'var(--accent-blue)' }}>{pred ? pred.split('(')[0].trim() : '-'}</strong>
                          {predictedQualifierCode && (
                            <span style={{ 
                              color: 'var(--accent-blue)', 
                              fontWeight: '800', 
                              fontSize: '0.62rem', 
                              backgroundColor: 'rgba(59, 130, 246, 0.08)', 
                              padding: '0.02rem 0.15rem', 
                              borderRadius: '3px',
                              marginLeft: '0.15rem'
                            }}>
                              ➔{normalizeTeamCode(predictedQualifierCode)}
                            </span>
                          )}
                        </span>
                        
                        {isPlayed && (
                          <div style={{ display: 'inline-flex' }}>
                            {pts >= 3 ? (
                              <span className="badge-pts-exact" style={{ fontSize: '0.62rem', padding: '0.05rem 0.2rem' }}>+{pts}</span>
                            ) : pts > 0 ? (
                              <span className="badge-pts-outcome" style={{ fontSize: '0.62rem', padding: '0.05rem 0.2rem' }}>+{pts}</span>
                            ) : (
                              <span className="badge-pts-zero" style={{ fontSize: '0.62rem', padding: '0.05rem 0.2rem' }}>0</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {locked6h && !isEditing && (
                      <span className="badge-pts-zero" style={{ fontSize: '0.58rem', padding: '0.05rem 0.15rem', whiteSpace: 'nowrap' }}>
                        🔒 Bloqueados
                      </span>
                    )}

                    {/* Mode Editing input placement */}
                    {isEditing && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', alignItems: 'flex-start', flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <div className="match-score-selectors" style={{ width: '80px', margin: 0, flexShrink: 0 }}>
                            <select 
                              value={s1} 
                              onChange={e => handleScoreChange(m.id, 1, e.target.value)}
                              className="score-select"
                              disabled={isLocked}
                              style={{ padding: '0.05rem', fontSize: '0.75rem', height: '22px' }}
                            >
                              {SCORE_OPTIONS.map(opt => (
                                <option key={opt} value={opt}>{opt === '' ? '-' : opt}</option>
                              ))}
                            </select>
                            <span className="score-divider" style={{ fontSize: '0.75rem' }}>-</span>
                            <select 
                              value={s2} 
                              onChange={e => handleScoreChange(m.id, 2, e.target.value)}
                              className="score-select"
                              disabled={isLocked}
                              style={{ padding: '0.05rem', fontSize: '0.75rem', height: '22px' }}
                            >
                              {SCORE_OPTIONS.map(opt => (
                                <option key={opt} value={opt}>{opt === '' ? '-' : opt}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        
                        {isEditing && s1 !== '' && s2 !== '' && s1 === s2 && (
                          <div style={{ display: 'flex', gap: '0.15rem', marginTop: '0.05rem' }}>
                            <button
                              type="button"
                              disabled={isLocked}
                              onClick={() => handleQualifierChange(m.id, 'Q1')}
                              style={{
                                padding: '0.02rem 0.15rem',
                                fontSize: '0.58rem',
                                borderRadius: '3px',
                                border: pred && pred.toUpperCase().includes('(Q2)') ? '1px solid var(--border)' : '1px solid var(--accent-blue)',
                                backgroundColor: pred && pred.toUpperCase().includes('(Q2)') ? 'var(--card-bg)' : 'rgba(59, 130, 246, 0.1)',
                                color: pred && pred.toUpperCase().includes('(Q2)') ? 'var(--text-light)' : 'var(--accent-blue)',
                                cursor: isLocked ? 'not-allowed' : 'pointer'
                              }}
                            >
                              {normalizeTeamCode(team1Resolved)}
                            </button>
                            <button
                              type="button"
                              disabled={isLocked}
                              onClick={() => handleQualifierChange(m.id, 'Q2')}
                              style={{
                                padding: '0.02rem 0.15rem',
                                fontSize: '0.58rem',
                                borderRadius: '3px',
                                border: pred && pred.toUpperCase().includes('(Q2)') ? '1px solid var(--accent-blue)' : '1px solid var(--border)',
                                backgroundColor: pred && pred.toUpperCase().includes('(Q2)') ? 'rgba(59, 130, 246, 0.1)' : 'var(--card-bg)',
                                color: pred && pred.toUpperCase().includes('(Q2)') ? 'var(--accent-blue)' : 'var(--text-light)',
                                cursor: isLocked ? 'not-allowed' : 'pointer'
                              }}
                            >
                              {normalizeTeamCode(team2Resolved)}
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* SILUETA EYE BUTTON */}
                    <button
                      type="button"
                      onClick={() => setSelectedMatchForOthers(m)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '0.15rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--accent-blue)',
                        transition: 'transform 0.1s, color 0.1s',
                        marginLeft: '0.15rem',
                        flexShrink: 0
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.15)';
                        e.currentTarget.style.color = 'var(--text)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.color = 'var(--accent-blue)';
                      }}
                      title={lang === 'es' ? 'Ver lo que ha puesto el resto' : 'View predictions from others'}
                    >
                      <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        width="18" 
                        height="18" 
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="2.2" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                      >
                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>

                  </div>
                </div>
              );
            })
          ) : (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem', backgroundColor: 'var(--card-bg)', border: '1.5px dashed var(--border)', borderRadius: '8px', color: 'var(--text-light)' }}>
              📭 {lang === 'es' ? 'No hay partidos de eliminatoria que coincidan con los filtros.' : 'No knockout matches match the filters.'}
            </div>
          )
        )}
      </div>

      {/* FLOAT POPUP MODAL FOR CONSULTING TRENDS / OTHERS' PREDICTIONS */}
      {selectedMatchForOthers && (
        <MatchPredictionsModal
          match={selectedMatchForOthers}
          participants={participants}
          realScore={realResults.matches[selectedMatchForOthers.id]}
          lang={lang}
          onClose={() => setSelectedMatchForOthers(null)}
        />
      )}

    </div>
  );
}
