import { useState, useEffect } from 'react';
import { Participant, Match, AppState, Predictions } from '../domain/types';
import { normalizeTeamCode, getFlagImgUrl } from '../utils/flags';
import { TRANSLATIONS, Lang } from '../utils/translations';
import { formatMatchLocalDateTime, getKickoffTimeMs, getOriginalMatchDateTime } from '../utils/timezone';

interface Props {
  participant: Participant;
  matches: Match[];
  realResults: AppState['realResults'];
  onClose: () => void;
  onSavePredictions: (name: string, updatedPredictions: Predictions, password?: string) => Promise<void>;
  lang: Lang;
  theme?: 'light' | 'dark';
  isAdmin?: boolean;
}

const SCORE_OPTIONS = ['', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

const parseScore = (scoreStr: string | undefined): [string, string] => {
  if (!scoreStr || !scoreStr.includes('-')) return ['', ''];
  const parts = scoreStr.split('-');
  return [parts[0].trim(), parts[1].trim()];
};

// Group colors for the cards & headers in Light Mode
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

// Group colors for the cards & headers in Dark Mode
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

const LOCK_BEFORE_KICKOFF_MS = 6 * 60 * 60 * 1000;

function isMatchLocked(m: Match, isAdmin = false): boolean {
  if (isAdmin) return false;

  const kickoffTime = getKickoffTimeMs(m);
  if (!kickoffTime) return false;

  return Date.now() >= kickoffTime - LOCK_BEFORE_KICKOFF_MS;
}

export function ParticipantDetails({ participant, matches, realResults, onSavePredictions, lang, theme, isAdmin = false }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedPreds, setEditedPredictions] = useState<Predictions>({ ...participant.predictions });
  const [saving, setSaving] = useState(false);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [matchSearchTerm, setMatchSearchTerm] = useState('');
  const t = TRANSLATIONS[lang];

  // Sync state if participant changes
  useEffect(() => {
    setEditedPredictions({ ...participant.predictions });
    setIsEditing(false);
    setCreatedPassword(null);
  }, [participant]);

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
    }
    
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
      // Participant already has a password set. Ask for it!
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
      // First-time edit, let them set their password!
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
      // Clean up partial scores so that only fully completed predictions are saved
      const cleanedMatches: Record<string, string> = {};
      Object.entries(editedPreds.matches).forEach(([matchId, score]) => {
        if (score) {
          const [s1, s2] = parseScore(score);
          if (s1 !== '' && s2 !== '') {
            cleanedMatches[matchId] = `${s1}-${s2}`;
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

  // Group matches by group
  const groups: Record<string, Match[]> = {};
  filteredMatches.forEach(m => {
    const groupName = m.group || 'Other Matches';
    if (!groups[groupName]) {
      groups[groupName] = [];
    }
    groups[groupName].push(m);
  });

  // Sort groups alphabetically
  const sortedGroupNames = Object.keys(groups).sort((a, b) => {
    if (a === 'Other Matches') return 1;
    if (b === 'Other Matches') return -1;
    return a.localeCompare(b);
  });

  return (
    <div className="participant-details-view flex flex-col gap-1.5 animate-fade-in" style={{ padding: '0.5rem', maxHeight: '85vh', overflowY: 'auto' }}>
      <div className="details-header flex justify-between items-center" style={{ borderBottom: '2px solid var(--border)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text)' }}>
            {t.pdTitle.replace('{name}', participant.name)}
          </h2>
          <p className="text-muted" style={{ fontSize: '0.85rem' }}>
            {t.pdPointsLabel}: <strong style={{ color: 'var(--accent-blue)', fontSize: '1.05rem' }}>{participant.points.total} pts</strong>
          </p>
        </div>
        <div>
          {isEditing ? (
            <button className="save-btn" onClick={handleSave} disabled={saving}>
              {saving ? t.pdSaving : t.pdSaveBtn}
            </button>
          ) : (
            <button className="edit-btn" onClick={handleEditClick}>
              {t.pdEditBtn}
            </button>
          )}
        </div>
      </div>

      {/* SPECIAL PREDICTIONS ROW */}
      <h3 style={{ fontSize: '1.05rem', fontWeight: 700, borderLeft: '4px solid var(--accent-blue)', paddingLeft: '0.5rem', margin: '0.5rem 0' }}>
        {t.pdSpecialPreds}
      </h3>
      <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
        
        {/* Ganador Final */}
        <div className="form-group" style={{ margin: 0 }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-light)' }}>{t.pdFinalWinner}</label>
          {isEditing ? (
            <input 
              type="text" 
              value={editedPreds.ganadorFinal} 
              onChange={e => handleChangeGeneral('ganadorFinal', e.target.value)}
              disabled={isFieldDisabled('ganadorFinal')}
              style={{ 
                padding: '0.4rem', 
                border: '1.5px solid var(--border)', 
                borderRadius: '4px', 
                fontSize: '0.9rem',
                backgroundColor: 'var(--card-bg)',
                color: 'var(--text)',
                ...(isFieldDisabled('ganadorFinal') ? { backgroundColor: 'var(--bg)', cursor: 'not-allowed', color: 'var(--text-light)' } : {})
              }}
            />
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', padding: '0.2rem 0' }}>
              <span>{participant.predictions.ganadorFinal || '-'}</span>
              <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                ({t.pdRealResult} <strong>{realResults.ganadorFinal || '-'}</strong>)
              </span>
            </div>
          )}
        </div>

        {/* Max Goleador */}
        <div className="form-group" style={{ margin: 0 }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-light)' }}>{t.pdMaxScorer}</label>
          {isEditing ? (
            <input 
              type="text" 
              value={editedPreds.maxGoleador} 
              onChange={e => handleChangeGeneral('maxGoleador', e.target.value)}
              disabled={isFieldDisabled('maxGoleador')}
              style={{ 
                padding: '0.4rem', 
                border: '1.5px solid var(--border)', 
                borderRadius: '4px', 
                fontSize: '0.9rem',
                backgroundColor: 'var(--card-bg)',
                color: 'var(--text)',
                ...(isFieldDisabled('maxGoleador') ? { backgroundColor: 'var(--bg)', cursor: 'not-allowed', color: 'var(--text-light)' } : {})
              }}
            />
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', padding: '0.2rem 0' }}>
              <span>{participant.predictions.maxGoleador || '-'}</span>
              <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                ({t.pdRealResult} <strong>{realResults.maxGoleador || '-'}</strong>)
              </span>
            </div>
          )}
        </div>

        {/* Max Asistente */}
        <div className="form-group" style={{ margin: 0 }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-light)' }}>{t.pdMaxAssist}</label>
          {isEditing ? (
            <input 
              type="text" 
              value={editedPreds.maxAsistente} 
              onChange={e => handleChangeGeneral('maxAsistente', e.target.value)}
              disabled={isFieldDisabled('maxAsistente')}
              style={{ 
                padding: '0.4rem', 
                border: '1.5px solid var(--border)', 
                borderRadius: '4px', 
                fontSize: '0.9rem',
                backgroundColor: 'var(--card-bg)',
                color: 'var(--text)',
                ...(isFieldDisabled('maxAsistente') ? { backgroundColor: 'var(--bg)', cursor: 'not-allowed', color: 'var(--text-light)' } : {})
              }}
            />
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', padding: '0.2rem 0' }}>
              <span>{participant.predictions.maxAsistente || '-'}</span>
              <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                ({t.pdRealResult} <strong>{realResults.maxAsistente || '-'}</strong>)
              </span>
            </div>
          )}
        </div>

        {/* World Cup MVP */}
        <div className="form-group" style={{ margin: 0 }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-light)' }}>{t.pdWorldCupMvp}</label>
          {isEditing ? (
            <input 
              type="text" 
              value={editedPreds.mvp} 
              onChange={e => handleChangeGeneral('mvp', e.target.value)}
              disabled={isFieldDisabled('mvp')}
              style={{ 
                padding: '0.4rem', 
                border: '1.5px solid var(--border)', 
                borderRadius: '4px', 
                fontSize: '0.9rem',
                backgroundColor: 'var(--card-bg)',
                color: 'var(--text)',
                ...(isFieldDisabled('mvp') ? { backgroundColor: 'var(--bg)', cursor: 'not-allowed', color: 'var(--text-light)' } : {})
              }}
            />
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', padding: '0.2rem 0' }}>
              <span>{participant.predictions.mvp || '-'}</span>
              <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                ({t.pdRealResult} <strong>{realResults.mvp || '-'}</strong>)
              </span>
            </div>
          )}
        </div>

        {/* Spain Stage */}
        <div className="form-group" style={{ margin: 0 }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-light)' }}>{t.pdSpainStage}</label>
          {isEditing ? (
            <input 
              type="text" 
              value={editedPreds.faseEspana} 
              onChange={e => handleChangeGeneral('faseEspana', e.target.value)}
              disabled={isFieldDisabled('faseEspana')}
              style={{ 
                padding: '0.4rem', 
                border: '1.5px solid var(--border)', 
                borderRadius: '4px', 
                fontSize: '0.9rem',
                backgroundColor: 'var(--card-bg)',
                color: 'var(--text)',
                ...(isFieldDisabled('faseEspana') ? { backgroundColor: 'var(--bg)', cursor: 'not-allowed', color: 'var(--text-light)' } : {})
              }}
            />
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', padding: '0.2rem 0' }}>
              <span>{participant.predictions.faseEspana || '-'}</span>
              <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                ({t.pdRealResult} <strong>{realResults.faseEspana || '-'}</strong>)
              </span>
            </div>
          )}
        </div>

      </div>

      {/* MATCH SEARCH BAR */}
      <div style={{ marginBottom: '0.75rem', marginTop: '1.25rem' }}>
        <input
          type="text"
          placeholder={lang === 'es' ? '🔍 Buscar partido por equipo o grupo...' : '🔍 Search match by team or group...'}
          value={matchSearchTerm}
          onChange={e => setMatchSearchTerm(e.target.value)}
          className="predictions-search-input"
        />
      </div>

      {/* MATCH PREDICTIONS GRID */}
      <h3 style={{ fontSize: '1.05rem', fontWeight: 700, borderLeft: '4px solid var(--accent-green)', paddingLeft: '0.5rem', margin: '0.5rem 0' }}>
        {t.pdGroupStage}
      </h3>
      <div className="details-groups-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
        {sortedGroupNames.map(groupName => {
          const colors = (theme === 'dark' ? GROUP_COLORS_DARK : GROUP_COLORS)[groupName] || { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' };
          return (
            <div 
              key={groupName} 
              className="details-group-card" 
              style={{ border: `1.5px solid var(--border)`, borderRadius: '8px', overflow: 'hidden', boxShadow: 'var(--shadow)' }}
            >
              <h4 
                style={{ 
                  backgroundColor: colors.bg, 
                  color: colors.text, 
                  padding: '0.5rem 1rem', 
                  margin: 0, 
                  fontSize: '0.95rem', 
                  fontWeight: 700 
                }}
              >
                {groupName}
              </h4>
              <div className="group-matches-editor-list" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {groups[groupName].map(m => {
                  const pred = isEditing ? editedPreds.matches[m.id] : participant.predictions.matches[m.id];
                  const real = realResults.matches[m.id];
                  const pts = participant.points.matches[m.id] || 0;
                  const timeLocked = isMatchLocked(m, isAdmin);
                  const isLocked = !isAdmin && (!!real || timeLocked);
                  const locked6h = !isAdmin && !real && timeLocked;
                  
                  let ptsClass = 'pts-zero';
                  if (pts === 3) ptsClass = 'pts-exact';
                  if (pts === 1) ptsClass = 'pts-outcome';

                  return (
                    <div 
                      key={m.id} 
                      className={`detail-match-row ${ptsClass}`}
                      style={{ 
                        padding: '0.75rem', 
                        borderRadius: '6px', 
                        border: '1.5px solid var(--border)', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '0.4rem',
                        ...(isLocked ? { backgroundColor: 'var(--bg)', opacity: 0.85 } : {})
                      }}
                    >
                      <div className="detail-match-header flex justify-between items-center" style={{ borderBottom: '1px dashed var(--border)', paddingBottom: '0.25rem', fontSize: '0.8rem' }}>
                        <span className="team-flag-pair flex gap-1 items-center">
                          <img src={getFlagImgUrl(m.team1)} alt={m.team1} className="flag-icon-img" style={{ width: '18px', height: '12px' }} />
                          <span style={isLocked ? { color: 'var(--text-light)' } : {}}>{normalizeTeamCode(m.team1)}</span>
                          <span className="vs-divider text-muted font-normal">vs</span>
                          <img src={getFlagImgUrl(m.team2)} alt={m.team2} className="flag-icon-img" style={{ width: '18px', height: '12px' }} />
                          <span style={isLocked ? { color: 'var(--text-light)' } : {}}>{normalizeTeamCode(m.team2)}</span>
                        </span>
                        {(m.date || m.time || m.kickoffAtUtc) && (
                          <span title={getOriginalMatchDateTime(m)} style={{ color: 'var(--text-light)', fontSize: '0.72rem', marginLeft: 'auto' }}>
                            📅 {formatMatchLocalDateTime(m, lang)}
                          </span>
                        )}
                        {locked6h && (
                          <span style={{ color: 'var(--error)', fontWeight: 'bold', fontSize: '0.75rem' }}>
                            🔒 {lang === 'es' ? 'Bloqueado' : 'Locked'}
                          </span>
                        )}
                        {pts > 0 && (
                          <span className="pts-badge font-bold">+{pts} pts</span>
                        )}
                      </div>

                      <div className="detail-match-scores flex justify-between items-center" style={{ fontSize: '0.9rem' }}>
                        {isEditing ? (
                          (() => {
                            const [s1, s2] = parseScore(pred);
                            return (
                              <div className="match-score-selectors" style={{ width: '100px' }}>
                                <select 
                                  value={s1} 
                                  onChange={e => handleScoreChange(m.id, 1, e.target.value)}
                                  className="score-select"
                                  disabled={isLocked}
                                  style={isLocked ? { backgroundColor: 'var(--bg)', color: 'var(--text-light)', cursor: 'not-allowed', border: '1px solid var(--border)', padding: '0.2rem 0.1rem', fontSize: '0.85rem' } : { padding: '0.2rem 0.1rem', fontSize: '0.85rem' }}
                                >
                                  {SCORE_OPTIONS.map(opt => (
                                    <option key={opt} value={opt}>{opt === '' ? '-' : opt}</option>
                                  ))}
                                </select>
                                <span className="score-divider" style={{ fontSize: '0.9rem' }}>-</span>
                                <select 
                                  value={s2} 
                                  onChange={e => handleScoreChange(m.id, 2, e.target.value)}
                                  className="score-select"
                                  disabled={isLocked}
                                  style={isLocked ? { backgroundColor: 'var(--bg)', color: 'var(--text-light)', cursor: 'not-allowed', border: '1px solid var(--border)', padding: '0.2rem 0.1rem', fontSize: '0.85rem' } : { padding: '0.2rem 0.1rem', fontSize: '0.85rem' }}
                                >
                                  {SCORE_OPTIONS.map(opt => (
                                    <option key={opt} value={opt}>{opt === '' ? '-' : opt}</option>
                                  ))}
                                </select>
                              </div>
                            );
                          })()
                        ) : (
                          <span className="match-pred">
                            Pred: <strong>{pred || '-'}</strong>
                          </span>
                        )}
                        <span className="match-real text-muted" style={isLocked ? { color: 'var(--text)', fontWeight: 600 } : {}}>
                          {t.pdRealResult} <strong>{real || '-'}</strong>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
