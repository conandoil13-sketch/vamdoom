import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Music, Sword, Shield, Zap, Heart, Star,
  Play, Pause, Gift, Trophy, Skull,
  Users, X, Keyboard
} from 'lucide-react';

// --- Constants & Game Data ---

const RARITIES = {
  NORMAL: { name: 'Normal', color: 'text-gray-400', border: 'border-gray-600', bg: 'bg-gray-800', multiplier: 1.0, prob: 0.5 },
  RARE: { name: 'Rare', color: 'text-blue-400', border: 'border-blue-500', bg: 'bg-blue-900', multiplier: 1.2, prob: 0.3 },
  SUPER_RARE: { name: 'Super Rare', color: 'text-purple-400', border: 'border-purple-500', bg: 'bg-purple-900', multiplier: 1.5, prob: 0.15 },
  ULTRA_RARE: { name: 'Ultra Rare', color: 'text-orange-400', border: 'border-orange-500', bg: 'bg-orange-900', multiplier: 2.0, prob: 0.04 },
  HYPER_RARE: { name: 'Hyper Rare', color: 'text-red-500', border: 'border-red-600', bg: 'bg-red-950', multiplier: 3.0, prob: 0.009 },
  SECRET: { name: 'Secret', color: 'text-rose-200', border: 'border-rose-400', bg: 'bg-rose-950', multiplier: 5.0, prob: 0.001 },
};

const ELEMENTS = {
  BRASS: { name: '금관', icon: '🎺', weakTo: 'PERCUSSION', strongAgainst: 'WOODWIND' },
  WOODWIND: { name: '목관', icon: '🎋', weakTo: 'BRASS', strongAgainst: 'STRINGS' },
  STRINGS: { name: '현악', icon: '🎻', weakTo: 'WOODWIND', strongAgainst: 'PERCUSSION' },
  PERCUSSION: { name: '타악', icon: '🥁', weakTo: 'STRINGS', strongAgainst: 'BRASS' },
  ELECTRONIC: { name: '전자', icon: '🎹', weakTo: 'VOCAL', strongAgainst: 'VOCAL' },
  VOCAL: { name: '성악', icon: '🎤', weakTo: 'ELECTRONIC', strongAgainst: 'ELECTRONIC' },
};

const INSTRUMENTS = {
  BRASS: ['트럼펫', '트롬본', '튜바', '호른'],
  WOODWIND: ['플루트', '클라리넷', '오보에', '바순'],
  STRINGS: ['바이올린', '비올라', '첼로', '하프'],
  PERCUSSION: ['팀파니', '스네어', '심벌즈', '마림바'],
  ELECTRONIC: ['신디사이저', '일렉기타', '베이스', '런치패드'],
  VOCAL: ['소프라노', '테너', '바리톤', '알토'],
};

// --- Helper Functions ---

const generateCharacter = (fixedRarity = null) => {
  const rand = Math.random();
  let rarityKey = 'NORMAL';

  if (fixedRarity) {
    rarityKey = fixedRarity;
  } else {
    let cumulative = 0;
    for (const key in RARITIES) {
      cumulative += RARITIES[key].prob;
      if (rand <= cumulative) {
        rarityKey = key;
        break;
      }
    }
  }

  const elemKeys = Object.keys(ELEMENTS);
  const elementKey = elemKeys[Math.floor(Math.random() * elemKeys.length)];
  const instrumentList = INSTRUMENTS[elementKey];
  const name = instrumentList[Math.floor(Math.random() * instrumentList.length)];
  const rarity = RARITIES[rarityKey];

  const baseAtk = Math.floor((10 + Math.random() * 10) * rarity.multiplier);
  const baseHp = Math.floor((100 + Math.random() * 50) * rarity.multiplier);
  const interval = Math.floor(Math.random() * 3) + 2;

  return {
    id: Math.random().toString(36).substr(2, 9),
    name,
    element: elementKey,
    rarity: rarityKey,
    atk: baseAtk,
    maxHp: baseHp,
    hp: baseHp,
    interval: interval,
    skillCooldown: 0,
    maxCooldown: 8,
    isDead: false,
  };
};

const getElementEffectiveness = (atkElem, defElem) => {
  const attacker = ELEMENTS[atkElem];
  if (attacker.strongAgainst === defElem) return 1.5;
  if (attacker.weakTo === defElem) return 0.5;
  if ((atkElem === 'ELECTRONIC' && defElem === 'VOCAL') || (atkElem === 'VOCAL' && defElem === 'ELECTRONIC')) return 2.0;
  return 1.0;
};

const findTargetIndex = (myIndex, targetTeam) => {
  if (targetTeam[myIndex] && !targetTeam[myIndex].isDead) return myIndex;
  for (let offset = 1; offset < 5; offset++) {
    const right = myIndex + offset;
    const left = myIndex - offset;
    if (right < 5 && targetTeam[right] && !targetTeam[right].isDead) return right;
    if (left >= 0 && targetTeam[left] && !targetTeam[left].isDead) return left;
  }
  return null;
};

// --- Main Component ---

export default function SymphonyOfClashesRhythm() {
  const [view, setView] = useState('MENU');
  const [currency, setCurrency] = useState(2000);
  const [inventory, setInventory] = useState(() => Array(5).fill(null).map(() => generateCharacter('NORMAL')));
  const [formation, setFormation] = useState([0, 1, 2, 3, 4]);
  const [currentStage, setCurrentStage] = useState(1);
  const [gachaResult, setGachaResult] = useState(null);

  // Combat State
  const [combatState, setCombatState] = useState(null);
  const [beat, setBeat] = useState(0);

  // Rhythm Engine
  const combatRef = useRef(null); // To access state in event listeners
  const timerRef = useRef(null);
  const lastBeatTimeRef = useRef(0);
  const BPM = 100;
  const BEAT_MS = (60 / BPM) * 1000;

  // Rhythm Feedback
  const [rhythmFeedback, setRhythmFeedback] = useState({ text: "", color: "", scale: 1, combo: 0 });
  const [conductorBonus, setConductorBonus] = useState(1.0); // Default 1.0, ranges 0.5 ~ 2.0

  // Keep combatRef updated for Event Listeners
  useEffect(() => {
    combatRef.current = combatState;
  }, [combatState]);

  // --- Combat Logic ---

  const startCombat = (stageNum) => {
    const playerTeam = formation.map(idx => {
      if (idx === null || !inventory[idx]) return null;
      const char = inventory[idx];
      // Explicitly ensure hp is a number
      const safeMaxHp = typeof char.maxHp === 'number' ? char.maxHp : 100;
      return { ...char, hp: safeMaxHp, skillCooldown: 0, isDead: false, maxHp: safeMaxHp };
    });

    const isBoss = stageNum % 10 === 0;

    // Difficulty Scaling Logic
    // 1. Base Linear Scaling: 5% per level
    // 2. Decade Step Scaling: Extra 20% every 10 levels
    const baseScale = 1 + (stageNum * 0.05);
    const decadeBonus = Math.floor((stageNum - 1) / 10) * 0.2;
    const finalScale = baseScale + decadeBonus;

    const enemyTeam = Array(5).fill(null).map((_, i) => {
      // Higher density in higher stages
      const spawnProb = 0.6 + (stageNum * 0.003);
      if (Math.random() > Math.min(0.9, spawnProb) && !isBoss) return null;

      // Boss Setup
      if (isBoss && i !== 2) return Math.random() > 0.5 ? generateCharacter('NORMAL') : null;
      const rarity = isBoss && i === 2 ? 'ULTRA_RARE' : 'NORMAL';

      const enemy = generateCharacter(rarity);
      const eMaxHp = Math.floor(enemy.maxHp * finalScale * (isBoss ? 3 : 1));
      enemy.maxHp = eMaxHp;
      enemy.hp = eMaxHp;
      enemy.atk = Math.floor(enemy.atk * finalScale);
      enemy.name = isBoss ? `MAESTRO ${enemy.name}` : enemy.name;
      return enemy;
    });

    if (enemyTeam.every(e => e === null)) enemyTeam[2] = generateCharacter('NORMAL');

    setCombatState({
      playerTeam,
      enemyTeam,
      stage: stageNum,
      logs: [],
      measure: 1,
      isPlaying: true,
      result: null,
    });
    setBeat(0);
    setConductorBonus(1.0);
    setRhythmFeedback({ text: "READY", color: "text-white", scale: 1, combo: 0 });
    lastBeatTimeRef.current = Date.now();
    setView('COMBAT');
  };

  // Game Loop
  useEffect(() => {
    if (view !== 'COMBAT' || !combatState?.isPlaying) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      const now = Date.now();
      lastBeatTimeRef.current = now; // Mark the exact time of the beat
      setBeat(prev => prev + 1);
    }, BEAT_MS);

    return () => clearInterval(timerRef.current);
  }, [view, combatState?.isPlaying]);

  // Resolve Turn Logic (Triggered by Beat)
  useEffect(() => {
    if (beat === 0 || !combatState?.isPlaying) return;

    setCombatState(prev => {
      if (!prev) return null;

      const newPlayerTeam = [...prev.playerTeam];
      const newEnemyTeam = [...prev.enemyTeam];
      const logs = [...prev.logs];
      const currentMeasure = Math.floor((beat - 1) / 4) + 1;

      // Cooldown Reduction
      if ((beat - 1) % 4 === 0) {
        newPlayerTeam.forEach(p => { if (p && p.skillCooldown > 0) p.skillCooldown--; });
      }

      // Auto Attack Logic
      // IMPORTANT: Apply Conductor Bonus Here
      const currentBonus = conductorBonus;

      const playerActions = [];
      const enemyActions = [];

      newPlayerTeam.forEach((p, idx) => {
        if (p && !p.isDead && beat % p.interval === 0) {
          const targetIdx = findTargetIndex(idx, newEnemyTeam);
          if (targetIdx !== null) playerActions.push({ sourceIdx: idx, targetIdx });
        }
      });

      newEnemyTeam.forEach((e, idx) => {
        if (e && !e.isDead && beat % e.interval === 0) {
          const targetIdx = findTargetIndex(idx, newPlayerTeam);
          if (targetIdx !== null) enemyActions.push({ sourceIdx: idx, targetIdx });
        }
      });

      const handledPlayers = new Set();
      const handledEnemies = new Set();

      // Resolve Clashes
      playerActions.forEach(pAct => {
        const eAct = enemyActions.find(e => e.sourceIdx === pAct.targetIdx && e.targetIdx === pAct.sourceIdx);

        if (eAct) {
          const p = newPlayerTeam[pAct.sourceIdx];
          const e = newEnemyTeam[eAct.sourceIdx];

          // Apply Conductor Bonus to Player ATK
          const pAtkFinal = Math.floor(p.atk * currentBonus);

          const pDmg = Math.floor(pAtkFinal * getElementEffectiveness(p.element, e.element));
          const eDmg = Math.floor(e.atk * getElementEffectiveness(e.element, p.element));

          if (pDmg >= eDmg) {
            const diff = Math.max(1, pDmg - eDmg);
            e.hp -= diff;
            logs.unshift(`⚔️ WIN! ${p.name} (-${diff})`);
          } else {
            const diff = Math.max(1, eDmg - pDmg);
            p.hp -= diff;
            logs.unshift(`💥 LOSE! ${p.name} (-${diff})`);
          }
          handledPlayers.add(pAct.sourceIdx);
          handledEnemies.add(eAct.sourceIdx);
        }
      });

      // Unclashed Attacks
      playerActions.forEach(pAct => {
        if (handledPlayers.has(pAct.sourceIdx)) return;
        const p = newPlayerTeam[pAct.sourceIdx];
        const e = newEnemyTeam[pAct.targetIdx];

        // Apply Bonus
        const pAtkFinal = Math.floor(p.atk * currentBonus);
        const dmg = Math.floor(pAtkFinal * getElementEffectiveness(p.element, e.element));

        e.hp -= dmg;
      });

      enemyActions.forEach(eAct => {
        if (handledEnemies.has(eAct.sourceIdx)) return;
        const e = newEnemyTeam[eAct.sourceIdx];
        const p = newPlayerTeam[eAct.targetIdx];
        const dmg = Math.floor(e.atk * getElementEffectiveness(e.element, p.element));
        p.hp -= dmg;
      });

      // Death Check & Win Cond
      newPlayerTeam.forEach(p => { if (p && p.hp <= 0) { p.hp = 0; p.isDead = true; } });
      newEnemyTeam.forEach(e => { if (e && e.hp <= 0) { e.hp = 0; e.isDead = true; } });

      const pAlive = newPlayerTeam.some(p => p && !p.isDead);
      const eAlive = newEnemyTeam.some(e => e && !e.isDead);
      let result = null;
      let isPlaying = true;

      if (!pAlive) { result = 'LOSE'; isPlaying = false; }
      else if (!eAlive) { result = 'WIN'; isPlaying = false; }

      return { ...prev, playerTeam: newPlayerTeam, enemyTeam: newEnemyTeam, logs: logs.slice(0, 3), measure: currentMeasure, result, isPlaying };
    });
  }, [beat]);

  // --- Keyboard Input Handling ---

  const handleRhythmInput = useCallback(() => {
    if (!combatRef.current?.isPlaying) return;

    const now = Date.now();
    const timeSinceLast = now - lastBeatTimeRef.current;
    const timeToNext = BEAT_MS - timeSinceLast;
    const diff = Math.min(timeSinceLast, timeToNext);

    let grade = "MISS";
    let multiplier = 0.5;
    let color = "text-gray-500";
    let scale = 0.8;

    if (diff < 100) {
      grade = "PERFECT";
      multiplier = 1.5;
      color = "text-amber-400";
      scale = 1.5;
    } else if (diff < 200) {
      grade = "GREAT";
      multiplier = 1.2;
      color = "text-blue-400";
      scale = 1.2;
    } else if (diff < 300) {
      grade = "GOOD";
      multiplier = 1.0;
      color = "text-green-400";
      scale = 1.0;
    } else {
      grade = "MISS";
      multiplier = 0.7;
      color = "text-red-500";
      scale = 0.9;
    }

    setConductorBonus(prev => multiplier);

    setRhythmFeedback(prev => ({
      text: grade,
      color: color,
      scale: scale,
      combo: grade === "MISS" ? 0 : prev.combo + 1
    }));

    setTimeout(() => setRhythmFeedback(prev => ({ ...prev, scale: 1 })), 100);

  }, [BEAT_MS]);

  const handleSkillInput = useCallback((laneIdx) => {
    if (!combatRef.current?.isPlaying) return;

    setCombatState(prev => {
      const pTeam = [...prev.playerTeam];
      const eTeam = [...prev.enemyTeam];
      const p = pTeam[laneIdx];

      if (!p || p.isDead || p.skillCooldown > 0) return prev;

      const bonus = conductorBonus;
      p.skillCooldown = p.maxCooldown;

      const logs = [...prev.logs];
      logs.unshift(`✨ ${p.name} Solo! (x${bonus})`);

      const targetIdx = findTargetIndex(laneIdx, eTeam);
      if (targetIdx !== null) {
        const e = eTeam[targetIdx];
        const dmg = Math.floor(p.atk * 3.0 * bonus);
        e.hp -= dmg;
        if (e.hp <= 0) { e.hp = 0; e.isDead = true; }
      }

      p.hp = Math.min(p.maxHp, p.hp + Math.floor(p.maxHp * 0.3 * bonus));

      return { ...prev, playerTeam: pTeam, enemyTeam: eTeam, logs };
    });
  }, [conductorBonus]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!combatRef.current?.isPlaying) return;

      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        handleRhythmInput();
      }

      if (['1', '2', '3', '4', '5'].includes(e.key)) {
        handleSkillInput(parseInt(e.key) - 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleRhythmInput, handleSkillInput]);

  // --- UI Components ---

  const CharacterCard = ({ char, isSelected, showHp = false, idx }) => {
    if (!char) return <div className="w-full h-full border-2 border-dashed border-gray-700 rounded-lg flex items-center justify-center text-gray-700 bg-gray-900/50">Empty</div>;

    // Strict Safe Width Calculation
    const getSafeWidth = () => {
      if (!char || typeof char.hp !== 'number' || typeof char.maxHp !== 'number' || char.maxHp <= 0) return '0%';
      const pct = (char.hp / char.maxHp) * 100;
      if (!Number.isFinite(pct) || Number.isNaN(pct)) return '0%';
      return `${Math.max(0, Math.min(100, pct))}%`;
    };

    const isDead = showHp && char.hp <= 0;
    // For color calculation only
    const safeHp = typeof char.hp === 'number' ? char.hp : 0;
    const safeMaxHp = typeof char.maxHp === 'number' ? char.maxHp : 1;
    const hpPctNum = (safeHp / safeMaxHp) * 100;

    return (
      <div
        className={`relative w-full h-full rounded-lg p-2 flex flex-col border-2 transition-all overflow-hidden
        ${RARITIES[char.rarity].bg} ${isSelected ? 'ring-2 ring-amber-400 z-10' : RARITIES[char.rarity].border}
        ${isDead ? 'grayscale opacity-40' : ''}
        `}
      >
        {showHp && (
          <div className="w-full h-2 bg-gray-900 rounded-full mb-2 border border-gray-600">
            <div
              className={`h-full rounded-full transition-all duration-300 ${hpPctNum < 30 ? 'bg-red-500' : 'bg-green-500'}`}
              style={{ width: getSafeWidth() }}
            ></div>
          </div>
        )}

        <div className="flex justify-between items-start mb-1">
          <span className="text-xl drop-shadow-md">{ELEMENTS[char.element].icon}</span>
          <span className={`text-[9px] px-1 rounded bg-black/60 font-bold ${RARITIES[char.rarity].color}`}>{RARITIES[char.rarity].name}</span>
        </div>

        <div className="flex-1 flex flex-col justify-center items-center text-center">
          <div className="font-bold text-xs truncate w-full text-white leading-tight drop-shadow-sm">{char.name}</div>
        </div>

        <div className="text-[10px] flex justify-between text-gray-300 bg-black/30 rounded px-1 py-0.5 mt-auto">
          <span>⚔️{char.atk}</span>
          <span>⏱️{char.interval}</span>
        </div>

        {/* Only show keybind hint if idx is valid number (for Player cards) */}
        {showHp && typeof idx === 'number' && (
          <div className="absolute bottom-0 right-0 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded-tl border-l border-t border-gray-600 font-mono">
            {idx + 1}
          </div>
        )}
      </div>
    );
  };

  const renderCombat = () => {
    if (!combatState) return null;
    const { playerTeam, enemyTeam, measure, logs, result } = combatState;

    return (
      <div className="min-h-screen bg-black text-amber-50 flex flex-col relative overflow-hidden font-sans select-none">
        <div className="absolute inset-0 bg-gradient-to-b from-red-950/20 via-black to-blue-950/20"></div>

        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-40 text-center flex flex-col items-center">
          <div className={`text-6xl font-black italic tracking-tighter drop-shadow-[0_0_15px_rgba(0,0,0,0.8)] transition-transform duration-75 ${rhythmFeedback.color}`} style={{ transform: `scale(${rhythmFeedback.scale})` }}>
            {rhythmFeedback.text}
          </div>
          {rhythmFeedback.combo > 1 && (
            <div className="text-2xl font-bold text-amber-200 mt-2 animate-bounce">
              {rhythmFeedback.combo} COMBO!
            </div>
          )}
          <div className="mt-4 text-xs text-gray-400 bg-black/50 px-2 py-1 rounded">
            Multiplier: x{conductorBonus.toFixed(1)}
          </div>
        </div>

        <div className="relative z-10 bg-black/80 border-b border-gray-800 p-3 flex justify-between items-center h-16">
          <div className="flex flex-col">
            <span className="text-xl font-serif text-amber-500">Act {combatState.stage}</span>
            <span className="text-xs text-gray-400">Measure: {measure}</span>
          </div>

          <div className="flex flex-col items-center gap-1">
            <div className="flex gap-2 items-center">
              <div className={`w-3 h-3 rounded-full ${beat % 4 === 0 ? 'bg-amber-400 shadow-[0_0_10px_orange]' : 'bg-gray-700'}`}></div>
              <div className={`w-2 h-2 rounded-full ${beat % 4 === 1 ? 'bg-amber-400' : 'bg-gray-800'}`}></div>
              <div className={`w-2 h-2 rounded-full ${beat % 4 === 2 ? 'bg-amber-400' : 'bg-gray-800'}`}></div>
              <div className={`w-2 h-2 rounded-full ${beat % 4 === 3 ? 'bg-amber-400' : 'bg-gray-800'}`}></div>
            </div>
            <div className="text-[10px] text-gray-500 animate-pulse">Press SPACE on Beat!</div>
          </div>

          <button onClick={() => setView('MENU')} className="text-xs text-gray-500 border border-gray-700 px-3 py-1 rounded hover:bg-white/10">Give Up</button>
        </div>

        <div className="flex-1 relative z-10 flex flex-col justify-center max-w-5xl mx-auto w-full px-2 py-4">

          <div className="flex-1 flex items-end pb-4">
            <div className="grid grid-cols-5 gap-3 w-full">
              {enemyTeam.map((char, i) => {
                if (!char) return <div key={i} className="opacity-10 bg-gray-800/20 rounded-lg h-32"></div>;
                const isActive = beat % char.interval === 0 && !char.isDead && combatState.isPlaying;
                return (
                  <div key={i} className={`relative transition-all duration-150 h-36 ${isActive ? 'translate-y-4 z-20' : 'z-10'}`}>
                    {isActive && <div className="absolute inset-0 bg-red-500/20 blur-md rounded-lg"></div>}
                    <CharacterCard char={char} showHp={true} />
                    <div className="absolute -top-2 -right-2 w-5 h-5 bg-black border border-red-500 rounded-full flex items-center justify-center text-[10px] font-bold text-red-500 z-30 shadow-sm">
                      {char.interval}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="h-12 flex items-center justify-center relative my-2">
            <div className="absolute w-full h-px bg-gradient-to-r from-transparent via-amber-700/50 to-transparent"></div>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              {logs[0] && (
                <div key={beat} className="bg-black/80 border border-amber-900/50 px-6 py-1.5 rounded-full text-sm text-amber-100 shadow-lg animate-in slide-in-from-bottom-2 fade-in zoom-in duration-200">
                  {logs[0]}
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 flex items-start pt-4">
            <div className="grid grid-cols-5 gap-3 w-full">
              {playerTeam.map((char, i) => {
                return (
                  <div key={i} className="flex flex-col gap-2 h-full">
                    <div className={`relative transition-all duration-150 h-36 w-full ${(!char || char.isDead) ? 'opacity-50' : ''} ${(char && beat % char.interval === 0 && !char.isDead) ? '-translate-y-4 z-20' : 'z-10'}`}>
                      {char && beat % char.interval === 0 && !char.isDead && <div className="absolute inset-0 bg-blue-500/20 blur-md rounded-lg"></div>}
                      <CharacterCard char={char} showHp={true} idx={i} />
                      {char && (
                        <div className="absolute -top-2 -right-2 w-5 h-5 bg-black border border-blue-500 rounded-full flex items-center justify-center text-[10px] font-bold text-blue-500 z-30 shadow-sm">
                          {char.interval}
                        </div>
                      )}
                    </div>

                    {char && !char.isDead ? (
                      <div
                        className={`
                              w-full py-2 rounded font-bold text-[10px] uppercase tracking-wider text-center border
                              ${char.skillCooldown === 0
                            ? 'bg-amber-600 text-white border-amber-400 shadow-[0_0_10px_orange]'
                            : 'bg-gray-800 text-gray-500 border-gray-700'}
                            `}
                      >
                        <span className="bg-black/50 px-1 rounded mr-1 text-xs text-white border border-gray-600">{i + 1}</span>
                        {char.skillCooldown === 0 ? "Ready!" : `${char.skillCooldown} M`}
                      </div>
                    ) : (
                      <div className="h-8"></div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {result && (
          <div className="absolute inset-0 z-50 bg-black/90 flex flex-col items-center justify-center animate-in fade-in duration-500">
            <div className="text-6xl mb-4">{result === 'WIN' ? '🏆' : '🎻'}</div>
            <h1 className={`text-5xl font-serif mb-4 ${result === 'WIN' ? 'text-amber-400' : 'text-gray-500'}`}>
              {result === 'WIN' ? 'Curtain Call' : 'Performance Failed'}
            </h1>
            <div className="text-xl mb-8 text-gray-300">
              Max Combo: <span className="text-amber-400 font-bold">{rhythmFeedback.combo}</span>
            </div>
            <button onClick={() => {
              if (result === 'WIN') {
                setCurrency(c => c + 300);
                if (combatState.stage === currentStage) setCurrentStage(s => s + 1);
              }
              setView('STAGE');
              setCombatState(null);
            }} className="px-8 py-3 bg-white text-black font-bold rounded hover:scale-105 transition-transform">
              {result === 'WIN' ? 'Backstage' : 'Return to Menu'}
            </button>
          </div>
        )}
      </div>
    );
  };

  if (view === 'MENU') {
    return (
      <div className="min-h-screen bg-[#0c0505] text-amber-100 font-serif flex flex-col items-center justify-center relative">
        <div className="z-10 text-center space-y-8 p-12 bg-gradient-to-b from-black/80 to-transparent border-t-2 border-amber-900 w-full">
          <div>
            <h1 className="text-7xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-amber-500 to-yellow-800 mb-2">
              Symphony: Rhythm Edition
            </h1>
            <p className="text-amber-700 uppercase tracking-[0.5em] text-sm">Conduct the Battlefield</p>
          </div>
          <div className="flex flex-col gap-3 w-72 mx-auto">
            <button onClick={() => setView('STAGE')} className="px-6 py-4 bg-[#2a1a1a] border border-amber-800 hover:border-amber-500 transition-all flex items-center justify-center gap-2"><Play size={18} /> World Tour</button>
            <button onClick={() => setView('FORMATION')} className="px-6 py-4 bg-[#1a1a1a] border border-amber-900 hover:border-amber-500 transition-all flex items-center justify-center gap-2"><Users size={18} /> Formation</button>
            <button onClick={() => setView('GACHA')} className="px-6 py-4 bg-[#1a1a1a] border border-amber-900 hover:border-amber-500 transition-all flex items-center justify-center gap-2"><Gift size={18} /> Recruit</button>
          </div>
          <div className="mt-8 text-gray-500 text-xs bg-black/50 p-4 rounded inline-block">
            <div className="font-bold mb-2 flex items-center justify-center gap-2"><Keyboard size={14} /> Controls</div>
            <div>SPACE / ENTER : Conduct (Rhythm)</div>
            <div>1 ~ 5 : Use Skills</div>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'GACHA') {
    const doGacha = () => { if (currency >= 100) { setCurrency(c => c - 100); const char = generateCharacter(); setGachaResult(char); setInventory(p => [...p, char]); } };
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-black/80 p-8 rounded border border-amber-700 max-w-md w-full text-center relative">
          <button onClick={() => setView('MENU')} className="absolute top-2 right-2 text-gray-500 hover:text-white"><X /></button>
          {!gachaResult ? (
            <>
              <Music size={48} className="mx-auto text-amber-500 mb-4 animate-bounce" />
              <h2 className="text-2xl text-amber-100 mb-4">Recruit New Musician</h2>
              <div className="text-amber-400 mb-6 font-mono">{currency} G</div>
              <button onClick={doGacha} disabled={currency < 100} className="w-full py-3 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white font-bold rounded">Summon (100G)</button>
            </>
          ) : (
            <div className="animate-in zoom-in duration-300">
              <h3 className="text-xl text-white mb-2">New Arrival!</h3>
              <div className="flex justify-center mb-4 transform scale-125 h-48 w-32 mx-auto"><CharacterCard char={gachaResult} /></div>
              <button onClick={() => setGachaResult(null)} className="w-full py-2 border border-gray-600 text-gray-300 hover:bg-white/10 rounded">OK</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (view === 'FORMATION') {
    return (
      <div className="min-h-screen bg-[#120a0a] text-amber-50 p-6 flex flex-col">
        <header className="flex justify-between items-center mb-6 border-b border-amber-900/50 pb-4">
          <h2 className="text-3xl font-serif text-amber-500">Orchestra Formation</h2>
          <button onClick={() => setView('MENU')} className="px-4 py-2 bg-gray-800 rounded hover:bg-gray-700">Back</button>
        </header>
        <div className="flex-1 flex flex-col md:flex-row gap-8">
          <div className="flex-1 bg-amber-950/20 rounded-xl p-8 border border-amber-800/50 flex items-center justify-center">
            <div className="grid grid-cols-5 gap-3 w-full max-w-4xl">
              {formation.map((charIdx, slotId) => (
                <div key={slotId} className="flex flex-col items-center gap-2">
                  <div className="text-amber-600 font-bold text-xs uppercase tracking-widest">Lane {slotId + 1}</div>
                  <button onClick={() => { const newF = [...formation]; newF[slotId] = null; setFormation(newF); }} className="w-full aspect-[3/4] hover:scale-105 transition-transform">
                    <CharacterCard char={charIdx !== null ? inventory[charIdx] : null} />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="w-full md:w-1/3 bg-gray-900/80 p-4 rounded-xl overflow-y-auto max-h-[600px]">
            <div className="grid grid-cols-3 gap-2">
              {inventory.map((char, idx) => (
                <div key={char.id} className={`aspect-[3/4] cursor-pointer hover:ring-2 hover:ring-amber-500 rounded-lg ${formation.includes(idx) ? 'opacity-40' : ''}`}
                  onClick={() => { if (!formation.includes(idx)) { const empty = formation.indexOf(null); const f = [...formation]; f[empty !== -1 ? empty : 0] = idx; setFormation(f); } }}>
                  <CharacterCard char={char} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'STAGE') {
    return (
      <div className="min-h-screen bg-[#111] text-amber-50 p-8">
        <div className="flex justify-between items-center mb-8 border-b border-gray-800 pb-4">
          <h2 className="text-2xl font-serif text-amber-500">Select Concert Hall</h2>
          <button onClick={() => setView('MENU')} className="text-gray-400 hover:text-white">Back</button>
        </div>
        {/* Updated to display 100 stages */}
        <div className="grid grid-cols-5 md:grid-cols-8 lg:grid-cols-10 gap-3">
          {Array.from({ length: 100 }, (_, i) => i + 1).map(num => (
            <button key={num} disabled={num > currentStage} onClick={() => startCombat(num)} className={`aspect-square border flex flex-col items-center justify-center relative rounded text-sm ${num > currentStage ? 'bg-gray-900 text-gray-700' : 'bg-amber-950/20 hover:bg-amber-900/40 text-amber-100 border-amber-800'} ${num % 10 === 0 ? 'border-red-900 bg-red-950/20' : ''}`}>
              <span className="font-bold">{num}</span>
              {num % 10 === 0 && <Skull className="absolute bottom-1 right-1 text-red-500 opacity-50" size={12} />}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (view === 'COMBAT') return renderCombat();

  return <div className="text-white">Loading...</div>;
}