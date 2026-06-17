import React, { useState, useRef, useEffect, useCallback } from "react";
import { Chessboard } from "react-chessboard";
import { useChessSocket } from "./useChessSocket";

const SERVER_URL = process.env.REACT_APP_SERVER_URL || "http://localhost:3001";

function generateRoomId() { return Math.random().toString(36).substring(2, 8).toUpperCase(); }
function formatTime(ms) {
  if (ms <= 0) return "0:00";
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s/60)}:${(s%60).toString().padStart(2,"0")}`;
}
function formatPoints(p) {
  if (p >= 1000000) return (p/1000000).toFixed(1) + "M";
  if (p >= 1000) return (p/1000).toFixed(1) + "K";
  return p?.toString() || "0";
}
function getRatingCategory(r) {
  if (r >= 2400) return { label:"Master", color:"#ffd700" };
  if (r >= 2000) return { label:"Expert", color:"#ff9f43" };
  if (r >= 1800) return { label:"Class A", color:"#ee5a24" };
  if (r >= 1600) return { label:"Class B", color:"#0abde3" };
  if (r >= 1400) return { label:"Class C", color:"#10ac84" };
  if (r >= 1200) return { label:"Class D", color:"#a0a0c0" };
  return { label:"Beginner", color:"#8080a0" };
}

// ── Auth Screen ──
function AuthScreen({ onLogin, onRegister, error, loading }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [referralCode, setReferralCode] = useState("");

  const handleSubmit = () => {
    if (mode === "login") onLogin(username, password);
    else onRegister(username, password, displayName, referralCode);
  };

  return (
    <div style={styles.lobby}>
      <h1 style={styles.title}>♟️ Online Chess</h1>
      <p style={styles.subtitle}>Real-time · Elo Rating · Points Economy</p>
      <div style={styles.card}>
        <div style={styles.tabRow}>
          <button style={{ ...styles.tab, ...(mode==="login"?styles.tabActive:{}) }} onClick={() => setMode("login")}>Login</button>
          <button style={{ ...styles.tab, ...(mode==="register"?styles.tabActive:{}) }} onClick={() => setMode("register")}>Register</button>
        </div>
        {mode === "register" && (
          <>
            <div style={styles.field}>
              <label style={styles.label}>Display name</label>
              <input style={styles.input} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Shown to others" maxLength={20} />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Referral code (optional)</label>
              <input style={styles.input} value={referralCode} onChange={(e) => setReferralCode(e.target.value.toUpperCase())} placeholder="Friend's referral code" maxLength={10} />
            </div>
          </>
        )}
        <div style={styles.field}>
          <label style={styles.label}>Username</label>
          <input style={styles.input} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" maxLength={20} onKeyDown={(e) => e.key==="Enter"&&handleSubmit()} />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Password</label>
          <input style={styles.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" onKeyDown={(e) => e.key==="Enter"&&handleSubmit()} />
        </div>
        {error && <div style={styles.errorMsg}>⚠️ {error}</div>}
        <button style={{ ...styles.btn, width:"100%", marginTop:"0.5rem", opacity:loading?0.6:1 }} onClick={handleSubmit} disabled={loading}>
          {loading ? "..." : mode==="login" ? "🔑 Login" : "📝 Register"}
        </button>
        {mode==="register" && <p style={styles.hint}>Get {(10000).toLocaleString()} points on register!</p>}
      </div>
    </div>
  );
}

// ── Leaderboard ──
function Leaderboard({ onClose }) {
  const [data, setData] = useState([]);
  useEffect(() => { fetch(`${SERVER_URL}/leaderboard`).then(r=>r.json()).then(setData).catch(()=>{}); }, []);
  return (
    <div style={styles.modalOverlay}>
      <div style={{ ...styles.modal, width:"500px", maxHeight:"80vh", overflowY:"auto" }}>
        <h3 style={{ margin:"0 0 1rem", color:"#f0d9b5" }}>🏆 Leaderboard</h3>
        <table style={styles.table}>
          <thead><tr>{["#","Name","Rating","Points","Games","W/L/D","Win%"].map(h=><th key={h} style={styles.th}>{h}</th>)}</tr></thead>
          <tbody>
            {data.map((p,i) => {
              const cat = getRatingCategory(p.rating);
              return (
                <tr key={p.username} style={{ background:i%2===0?"rgba(255,255,255,0.03)":"transparent" }}>
                  <td style={styles.td}>{i+1}</td>
                  <td style={styles.td}>{p.display_name||p.username}</td>
                  <td style={{ ...styles.td, color:cat.color, fontWeight:"bold" }}>{p.rating}</td>
                  <td style={{ ...styles.td, color:"#ffd700" }}>{formatPoints(p.points)}</td>
                  <td style={styles.td}>{p.games}</td>
                  <td style={styles.td}>{p.wins}/{p.losses}/{p.draws}</td>
                  <td style={styles.td}>{p.win_rate}%</td>
                </tr>
              );
            })}
            {!data.length && <tr><td colSpan={7} style={{ ...styles.td, textAlign:"center", opacity:0.5 }}>No games yet</td></tr>}
          </tbody>
        </table>
        <button style={{ ...styles.btn, marginTop:"1rem", width:"100%" }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

// ── Admin Panel ──
function AdminPanel({ onClose }) {
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [players, setPlayers] = useState([]);
  const [stats, setStats] = useState(null);
  const [adjustUsername, setAdjustUsername] = useState("");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [msg, setMsg] = useState("");

  const loginAdmin = async () => {
    const res = await fetch(`${SERVER_URL}/auth/admin`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({password}) });
    const data = await res.json();
    if (res.ok) { setToken(data.token); loadData(data.token); }
    else setMsg(data.error);
  };

  const loadData = async (t) => {
    const [p, s] = await Promise.all([
      fetch(`${SERVER_URL}/admin/players`, { headers:{ Authorization:`Bearer ${t}` } }).then(r=>r.json()),
      fetch(`${SERVER_URL}/admin/stats`, { headers:{ Authorization:`Bearer ${t}` } }).then(r=>r.json()),
    ]);
    setPlayers(p); setStats(s);
  };

  const adjustPoints = async () => {
    const res = await fetch(`${SERVER_URL}/admin/adjust-points`, { method:"POST", headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`}, body:JSON.stringify({ username:adjustUsername, amount:parseInt(adjustAmount), reason:adjustReason }) });
    const data = await res.json();
    setMsg(res.ok ? `✅ Done! New points: ${data.newPoints}` : `❌ ${data.error}`);
    if (res.ok) loadData(token);
  };

  return (
    <div style={styles.modalOverlay}>
      <div style={{ ...styles.modal, width:"600px", maxHeight:"85vh", overflowY:"auto" }}>
        <h3 style={{ margin:"0 0 1rem", color:"#ffd700" }}>⚙️ Admin Panel</h3>
        {!token ? (
          <>
            <input style={styles.input} type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Admin password" />
            <button style={{ ...styles.btn, width:"100%", marginTop:"0.5rem" }} onClick={loginAdmin}>Login</button>
            {msg && <p style={{ color:"#ff6060" }}>{msg}</p>}
          </>
        ) : (
          <>
            {stats && (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:"8px", marginBottom:"1rem" }}>
                {[
                  { label:"Total Players", value: stats.totalPlayers ?? stats.totalplayers },
                  { label:"Total Games", value: stats.totalGames ?? stats.totalgames },
                  { label:"Platform Fees", value: formatPoints(stats.platformFees ?? stats.platformfees) },
                  { label:"Total Points", value: formatPoints(stats.totalPoints ?? stats.totalpoints) },
                ].map(s => (
                  <div key={s.label} style={{ background:"rgba(255,255,255,0.05)", padding:"8px 12px", borderRadius:"8px" }}>
                    <div style={{ fontSize:"0.75rem", color:"#a0a0c0" }}>{s.label}</div>
                    <div style={{ fontSize:"1.2rem", fontWeight:"bold", color:"#ffd700" }}>{s.value}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ background:"rgba(255,255,255,0.05)", padding:"12px", borderRadius:"8px", marginBottom:"1rem" }}>
              <h4 style={{ margin:"0 0 8px", color:"#f0d9b5" }}>Adjust Points</h4>
              <input style={{ ...styles.input, marginBottom:"6px" }} value={adjustUsername} onChange={e=>setAdjustUsername(e.target.value)} placeholder="Username" />
              <input style={{ ...styles.input, marginBottom:"6px" }} type="number" value={adjustAmount} onChange={e=>setAdjustAmount(e.target.value)} placeholder="Amount (+/-)" />
              <input style={{ ...styles.input, marginBottom:"6px" }} value={adjustReason} onChange={e=>setAdjustReason(e.target.value)} placeholder="Reason" />
              <button style={{ ...styles.btn, width:"100%" }} onClick={adjustPoints}>Apply</button>
              {msg && <p style={{ color: msg.startsWith("✅") ? "#4cff90" : "#ff6060", margin:"4px 0 0" }}>{msg}</p>}
            </div>
            <h4 style={{ color:"#f0d9b5", margin:"0 0 8px" }}>All Players ({players.length})</h4>
            <table style={styles.table}>
              <thead><tr>{["Name","Rating","Points","Games","Joined"].map(h=><th key={h} style={styles.th}>{h}</th>)}</tr></thead>
              <tbody>
                {players.map((p,i) => (
                  <tr key={p.username} style={{ background:i%2===0?"rgba(255,255,255,0.03)":"transparent" }}>
                    <td style={styles.td}>{p.display_name||p.username}<br/><span style={{ fontSize:"0.7rem", color:"#8080a0" }}>{p.username}</span></td>
                    <td style={{ ...styles.td, color:getRatingCategory(p.rating).color }}>{p.rating}</td>
                    <td style={{ ...styles.td, color:"#ffd700" }}>{formatPoints(p.points)}</td>
                    <td style={styles.td}>{p.games}</td>
                    <td style={{ ...styles.td, fontSize:"0.75rem" }}>{new Date(p.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <button style={{ ...styles.btnOutline, width:"100%", marginTop:"1rem" }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

// ── Transfer Modal ──
function TransferModal({ user, onTransfer, onClose }) {
  const [toUsername, setToUsername] = useState("");
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState("");

  const handleTransfer = async () => {
    const res = await onTransfer(toUsername, parseInt(amount));
    if (res.success) setMsg(`✅ Sent ${parseInt(amount).toLocaleString()} points to ${toUsername}`);
    else setMsg(`❌ ${res.error}`);
  };

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modal}>
        <h3 style={{ margin:"0 0 1rem", color:"#f0d9b5" }}>💸 Transfer Points</h3>
        <p style={{ color:"#a0a0c0", marginBottom:"1rem" }}>Your balance: <strong style={{ color:"#ffd700" }}>{formatPoints(user?.points)} pts</strong></p>
        <div style={styles.field}>
          <label style={styles.label}>Recipient username</label>
          <input style={styles.input} value={toUsername} onChange={e=>setToUsername(e.target.value)} placeholder="Username" />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Amount (2% fee applies)</label>
          <input style={styles.input} type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Points to send" />
        </div>
        {msg && <p style={{ color:msg.startsWith("✅")?"#4cff90":"#ff6060" }}>{msg}</p>}
        <div style={{ display:"flex", gap:"8px", marginTop:"0.5rem" }}>
          <button style={{ ...styles.btn, flex:1 }} onClick={handleTransfer}>Send</button>
          <button style={{ ...styles.btnOutline, flex:1 }} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Rating Modal ──
function RatingModal({ ratingChanges, escrowResult, myUsername, onClose }) {
  if (!ratingChanges) return null;
  const me = ratingChanges.white?.username === myUsername ? ratingChanges.white : ratingChanges.black;
  const opp = ratingChanges.white?.username === myUsername ? ratingChanges.black : ratingChanges.white;
  if (!me) return null;
  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modal}>
        <h3 style={{ margin:"0 0 1rem", color:"#f0d9b5" }}>📊 Game Result</h3>
        {[{label:"Your rating", data:me}, {label:"Opponent", data:opp}].map(({label,data}) => data && (
          <div key={label} style={styles.ratingRow}>
            <span>{label}:</span>
            <span>
              <strong>{data.rating}</strong> → <strong>{data.newRating}</strong>
              <span style={{ color:data.change>=0?"#4cff90":"#ff6060", marginLeft:"8px" }}>{data.change>=0?"+":""}{data.change}</span>
            </span>
          </div>
        ))}
        {me.pointsChange > 0 && (
          <div style={{ ...styles.ratingRow, borderTop:"1px solid rgba(255,215,0,0.3)", marginTop:"8px", paddingTop:"8px" }}>
            <span>Points earned:</span>
            <span style={{ color:"#ffd700", fontWeight:"bold" }}>+{me.pointsChange.toLocaleString()}</span>
          </div>
        )}
        {escrowResult && (
          <div style={{ background:"rgba(255,215,0,0.1)", border:"1px solid rgba(255,215,0,0.3)", borderRadius:"8px", padding:"10px", marginTop:"10px" }}>
            <div style={{ color:"#ffd700", fontWeight:"bold", marginBottom:"4px" }}>🎰 Bet Result</div>
            <div style={{ fontSize:"0.9rem" }}>Prize: <strong style={{ color:"#4cff90" }}>{escrowResult.prize?.toLocaleString()} pts</strong></div>
            <div style={{ fontSize:"0.85rem", color:"#a0a0c0" }}>Platform fee: {escrowResult.fee?.toLocaleString()} pts (10%)</div>
          </div>
        )}
        <button style={{ ...styles.btn, marginTop:"1rem", width:"100%" }} onClick={onClose}>OK</button>
      </div>
    </div>
  );
}

// ── Move History ──
function MoveHistory({ moveHistory, currentIndex, onSelect }) {
  const pairs = [];
  for (let i = 0; i < moveHistory.length; i += 2)
    pairs.push({ num:Math.floor(i/2)+1, white:moveHistory[i], black:moveHistory[i+1] });
  return (
    <div style={styles.historyPanel}>
      <div style={styles.historyTitle}>Moves</div>
      <div style={styles.historyList}>
        {pairs.map((pair,idx) => (
          <div key={idx} style={styles.historyRow}>
            <span style={styles.historyNum}>{pair.num}.</span>
            <span style={{ ...styles.historyMove, ...(currentIndex===idx*2?styles.historyMoveActive:{}) }} onClick={() => onSelect(idx*2)}>{pair.white?.san}</span>
            <span style={{ ...styles.historyMove, ...(currentIndex===idx*2+1?styles.historyMoveActive:{}) }} onClick={() => onSelect(idx*2+1)}>{pair.black?.san||""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Lobby ──
function LobbyScreen({ user, onJoin, onLogout, onTransfer, connected, onRefresh, bonusMsg }) {
  const [roomId, setRoomId] = useState("");
  const [timeLimit, setTimeLimit] = useState(10);
  const [bet, setBet] = useState(0);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [showTx, setShowTx] = useState(false);
  const [notice, setNotice] = useState(bonusMsg || null);
  const cat = getRatingCategory(user.rating || 1200);
  const timeLimits = [{label:"5 min",value:5},{label:"10 min",value:10},{label:"15 min",value:15},{label:"30 min",value:30},{label:"60 min",value:60}];

  const loadTransactions = async () => {
    const token = localStorage.getItem("chess_token");
    const res = await fetch(`${SERVER_URL}/points/transactions`, { headers:{ Authorization:`Bearer ${token}` } });
    if (res.ok) setTransactions(await res.json());
    setShowTx(true);
  };

  return (
    <div style={styles.lobby}>
      {showLeaderboard && <Leaderboard onClose={() => setShowLeaderboard(false)} />}
      {showTransfer && <TransferModal user={user} onTransfer={onTransfer} onClose={() => { setShowTransfer(false); onRefresh(); }} />}
      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
      {showTx && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modal, width:"460px", maxHeight:"80vh", overflowY:"auto" }}>
            <h3 style={{ margin:"0 0 1rem", color:"#f0d9b5" }}>📋 Transaction History</h3>
            {transactions.map((tx, i) => (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:"1px solid rgba(255,255,255,0.08)", fontSize:"0.85rem" }}>
                <div>
                  <div style={{ color:"#f0d9b5" }}>{tx.description}</div>
                  <div style={{ color:"#8080a0", fontSize:"0.75rem" }}>{new Date(tx.created_at).toLocaleString()}</div>
                </div>
                <div style={{ color: tx.amount >= 0 ? "#4cff90" : "#ff6060", fontWeight:"bold" }}>
                  {tx.amount >= 0 ? "+" : ""}{tx.amount.toLocaleString()}
                </div>
              </div>
            ))}
            {!transactions.length && <p style={{ textAlign:"center", color:"#8080a0" }}>No transactions yet</p>}
            <button style={{ ...styles.btn, marginTop:"1rem", width:"100%" }} onClick={() => setShowTx(false)}>Close</button>
          </div>
        </div>
      )}

      <h1 style={styles.title}>♟️ Online Chess</h1>

      {notice && (
        <div style={{ background:"rgba(74,124,89,0.3)", border:"1px solid rgba(74,124,89,0.6)", borderRadius:"10px", padding:"10px 20px", marginBottom:"0.5rem", color:"#90ffb0", fontSize:"0.95rem", textAlign:"center" }}>
          {notice} <button onClick={() => setNotice(null)} style={{ background:"none", border:"none", color:"#90ffb0", cursor:"pointer", marginLeft:"8px", fontSize:"1rem" }}>✕</button>
        </div>
      )}

      {/* User info */}
      <div style={styles.userCard}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontWeight:"bold", fontSize:"1.1rem" }}>{user.displayName || user.username}</div>
            <div style={{ color:cat.color, fontSize:"0.9rem" }}>⭐ {user.rating} <span style={{ opacity:0.7 }}>({cat.label})</span></div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ color:"#ffd700", fontWeight:"bold", fontSize:"1.1rem" }}>🪙 {formatPoints(user.points)}</div>
            <div style={{ color:"#8080a0", fontSize:"0.75rem" }}>Referral: {user.referralCode}</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:"6px", marginTop:"8px", flexWrap:"wrap" }}>
          <button style={styles.smallBtn} onClick={loadTransactions}>📋 History</button>
          <button style={styles.smallBtn} onClick={() => setShowTransfer(true)}>💸 Transfer</button>
          <button style={styles.smallBtn} onClick={() => setShowLeaderboard(true)}>🏆 Leaderboard</button>
          <button style={styles.smallBtn} onClick={() => setShowAdmin(true)}>⚙️ Admin</button>
          <button style={{ ...styles.smallBtn, color:"#ff9090" }} onClick={onLogout}>🚪 Logout</button>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.field}>
          <label style={styles.label}>Room code (leave empty to create new)</label>
          <input style={styles.input} value={roomId} onChange={e=>setRoomId(e.target.value.toUpperCase())} placeholder="e.g. ABC123" maxLength={10} />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>⏱ Time limit</label>
          <div style={styles.timeGrid}>
            {timeLimits.map(t => (
              <button key={t.value} style={{ ...styles.timeBtn, ...(timeLimit===t.value?styles.timeBtnActive:{}) }} onClick={() => setTimeLimit(t.value)}>{t.label}</button>
            ))}
          </div>
        </div>
        <div style={styles.field}>
          <label style={styles.label}>🎰 Bet points (optional, 10% fee on win)</label>
          <input style={styles.input} type="number" value={bet||""} onChange={e=>setBet(parseInt(e.target.value)||0)} placeholder="0 = no bet" min={0} max={user.points} />
          {bet > 0 && <p style={{ color:"#ffd700", fontSize:"0.8rem", margin:"4px 0 0" }}>If you win: +{Math.floor(bet*1.9*0.9).toLocaleString()} pts (90% of pool)</p>}
        </div>
        <button style={{ ...styles.btn, width:"100%", marginTop:"0.5rem", ...(!connected?styles.btnDisabled:{}) }} onClick={() => onJoin(roomId.trim()||generateRoomId(), timeLimit, bet)} disabled={!connected}>
          {connected ? "🎮 Join Game" : "⏳ Connecting..."}
        </button>
        <p style={styles.hint}>💡 Share the room code with your friend!</p>
      </div>
    </div>
  );
}

// ── Waiting ──
function WaitingScreen({ roomId, myColor, myRating, myPoints, timeLimit }) {
  const minutes = timeLimit ? timeLimit/60000 : 10;
  return (
    <div style={styles.lobby}>
      <h2 style={styles.title}>Waiting for opponent...</h2>
      <div style={styles.card}>
        <p style={styles.info}>📋 Room: <strong style={styles.code}>{roomId}</strong></p>
        {myColor && <p style={styles.info}>🎨 Color: <strong>{myColor==="white"?"♔ White":"♚ Black"}</strong></p>}
        {myRating && <p style={styles.info}>⭐ Rating: <strong>{myRating}</strong></p>}
        {myPoints !== undefined && <p style={styles.info}>🪙 Points: <strong style={{ color:"#ffd700" }}>{formatPoints(myPoints)}</strong></p>}
        <p style={styles.info}>⏱ Time: <strong>{minutes} min</strong></p>
        <p style={styles.hint}>Share the code with your friend!</p>
      </div>
    </div>
  );
}

// ── Player Bar ──
function PlayerBar({ player, isActive, isMe }) {
  if (!player) return <div style={styles.playerBarEmpty}>Waiting...</div>;
  const cat = player.rating ? getRatingCategory(player.rating) : null;
  return (
    <div style={{ ...styles.playerBar, ...(isActive?styles.playerBarActive:{}) }}>
      <span style={{ width:14,height:14,borderRadius:"50%",background:player.color==="white"?"#f5f5f5":"#2a2a2a",border:"2px solid rgba(240,217,181,0.5)",flexShrink:0,display:"inline-block" }} />
      <span style={{ fontSize:"0.9rem" }}>
        {player.color==="white"?"♔":"♚"} {player.name}{isMe?" (You)":""}
        {cat && <span style={{ color:cat.color, fontSize:"0.75rem", marginLeft:"4px" }}>{player.rating}</span>}
      </span>
      {isActive && <span style={styles.turnBadge}>← Turn</span>}
    </div>
  );
}

// ── Timer ──
function TimerDisplay({ time, isActive, color }) {
  const isLow = time < 30000;
  return (
    <div style={{ ...styles.timer, background:isActive?(isLow?"rgba(200,50,50,0.4)":"rgba(74,124,89,0.4)"):"rgba(255,255,255,0.05)", border:isActive?"1px solid rgba(240,217,181,0.5)":"1px solid transparent", color:isLow?"#ff6060":"#f0d9b5" }}>
      <span style={{ fontSize:"0.8rem", opacity:0.7 }}>{color==="white"?"♔":"♚"}</span>
      <span style={{ fontSize:"1.4rem", fontWeight:"bold", fontFamily:"monospace" }}>{formatTime(time)}</span>
    </div>
  );
}

// ── Game Screen ──
function GameScreen({ gameState, user, onMove, onResign, onRestart, onOfferDraw, onAcceptDraw, onDeclineDraw, onRefresh }) {
  const { fen, myColor, myRating, myPoints, turn, players, message, gameOver, inCheck, isSpectator, roomId, timers, moveHistory, drawOffer, ratingChanges, escrowResult, bets } = gameState;
  const isMyTurn = !isSpectator && myColor === turn;
  const selectedSquareRef = useRef(null);
  const [optionSquares, setOptionSquares] = useState({});
  const [viewIndex, setViewIndex] = useState(null);
  const [showRatingModal, setShowRatingModal] = useState(false);

  useEffect(() => { if (ratingChanges) { setShowRatingModal(true); onRefresh(); } }, [ratingChanges]);

  const isLiveView = viewIndex === null;
  const displayFen = isLiveView ? fen : (moveHistory[viewIndex]?.fen || fen);
  const totalBet = (bets?.white || 0) + (bets?.black || 0);

  const onSquareClick = (sq) => {
    if (!isMyTurn || gameOver || !isLiveView) return;
    if (!selectedSquareRef.current) { selectedSquareRef.current = sq; setOptionSquares({ [sq]:{ backgroundColor:"rgba(255,255,0,0.5)" } }); }
    else {
      const from = selectedSquareRef.current; selectedSquareRef.current = null; setOptionSquares({});
      if (from !== sq) onMove({ from, to:sq, promotion:"q" });
    }
  };

  const onDrop = (src, tgt) => {
    if (!isMyTurn || gameOver || !isLiveView) return false;
    selectedSquareRef.current = null; setOptionSquares({});
    onMove({ from:src, to:tgt, promotion:"q" }); return true;
  };

  const me = players.find(p => p.color === myColor);
  const opponent = players.find(p => p.color !== myColor);
  const oppColor = opponent?.color || (myColor==="white"?"black":"white");

  return (
    <div style={styles.gameContainer}>
      {showRatingModal && <RatingModal ratingChanges={ratingChanges} escrowResult={escrowResult} myUsername={user?.username} onClose={() => { setShowRatingModal(false); onRefresh(); }} />}

      <div style={styles.header}>
        <span style={styles.roomBadge}>🏠 {roomId}</span>
        {myPoints !== undefined && <span style={{ ...styles.ratingBadge, color:"#ffd700" }}>🪙 {formatPoints(myPoints)}</span>}
        {myRating && <span style={styles.ratingBadge}>⭐ {myRating}</span>}
        {totalBet > 0 && <span style={{ ...styles.ratingBadge, color:"#ff9f43" }}>🎰 {formatPoints(totalBet)}</span>}
        {!isLiveView && <span style={styles.reviewBadge}>🔍 Review</span>}
      </div>

      <div style={styles.mainLayout}>
        <div style={styles.boardSide}>
          <div style={styles.timerRow}>
            <PlayerBar player={opponent} isActive={turn===opponent?.color} />
            <TimerDisplay time={timers[oppColor]} isActive={turn===oppColor&&isLiveView} color={oppColor} />
          </div>

          {message && <div style={{ ...styles.message, ...(inCheck?styles.checkAlert:{}) }}>{message}</div>}

          {drawOffer && (
            <div style={styles.drawBanner}>
              {drawOffer===myColor ? <span>⏳ Draw offer sent...</span> : (
                <>
                  <span>🤝 Opponent offers a draw</span>
                  <div style={styles.drawButtons}>
                    <button style={styles.drawAccept} onClick={onAcceptDraw}>Accept</button>
                    <button style={styles.drawDecline} onClick={onDeclineDraw}>Decline</button>
                  </div>
                </>
              )}
            </div>
          )}

          {!drawOffer && (
            <div style={{ ...styles.turnInfo, ...(isMyTurn&&isLiveView?styles.turnInfoActive:{}) }}>
              {!isLiveView ? "🔍 Review mode" : isMyTurn ? "✅ Your turn!" : `⏳ ${opponent?.name||"Opponent"}'s turn`}
            </div>
          )}

          <div style={styles.boardWrapper}>
            <Chessboard
              id="chess-board" position={displayFen}
              onPieceDrop={onDrop} onSquareClick={onSquareClick}
              boardOrientation={myColor==="black"?"black":"white"}
              arePiecesDraggable={isMyTurn&&!gameOver&&isLiveView}
              customSquareStyles={optionSquares}
              customBoardStyle={{ borderRadius:"8px", boxShadow:"0 8px 32px rgba(0,0,0,0.4)" }}
              customDarkSquareStyle={{ backgroundColor:"#4a7c59" }}
              customLightSquareStyle={{ backgroundColor:"#f0d9b5" }}
            />
          </div>

          <div style={styles.navButtons}>
            <button style={styles.navBtn} onClick={() => setViewIndex(0)}>⏮</button>
            <button style={styles.navBtn} onClick={() => setViewIndex(v => Math.max(0,(v??moveHistory.length)-1))}>◀</button>
            <button style={{ ...styles.navBtn, ...(isLiveView?styles.navBtnActive:{}) }} onClick={() => setViewIndex(null)}>{isLiveView?"● Live":"Live"}</button>
            <button style={styles.navBtn} onClick={() => setViewIndex(v => v===null?null:v>=moveHistory.length-1?null:v+1)}>▶</button>
            <button style={styles.navBtn} onClick={() => setViewIndex(null)}>⏭</button>
          </div>

          <div style={styles.timerRow}>
            <PlayerBar player={me} isActive={turn===me?.color} isMe />
            <TimerDisplay time={timers[myColor||"white"]} isActive={turn===myColor&&isLiveView} color={myColor||"white"} />
          </div>

          {!isSpectator && (
            <div style={styles.actions}>
              {!gameOver && <>
                <button style={{ ...styles.btn,...styles.btnDanger }} onClick={onResign}>🏳 Resign</button>
                {!drawOffer && <button style={{ ...styles.btn,...styles.btnDraw }} onClick={onOfferDraw}>🤝 Draw</button>}
              </>}
              {gameOver && <>
                <button style={styles.btn} onClick={onRestart}>🔄 Play Again</button>
                {ratingChanges && <button style={{ ...styles.btn,...styles.btnDraw }} onClick={() => setShowRatingModal(true)}>📊 Result</button>}
              </>}
            </div>
          )}
        </div>

        <MoveHistory moveHistory={moveHistory} currentIndex={viewIndex} onSelect={idx => setViewIndex(idx)} />
      </div>
    </div>
  );
}

// ── Main ──
export default function ChessGame() {
  const { connected, user, authError, authLoading, gameState, register, login, logout, refreshUser, transferPoints, joinRoom, makeMove, resign, restartGame, offerDraw, acceptDraw, declineDraw } = useChessSocket();
  const [bonusMsg, setBonusMsg] = React.useState(null);

  const handleRegister = async (username, password, displayName, referralCode) => {
    const res = await register(username, password, displayName, referralCode);
    if (res && res.success) setBonusMsg(`🎉 Бүртгэлийн бонус: +${(10000).toLocaleString()} оноо авлаа!`);
    return res;
  };

  const handleLogin = async (username, password) => {
    const res = await login(username, password);
    if (res && res.loginBonus && res.loginBonus.claimed) setBonusMsg(`🌟 Өдрийн бонус: +${res.loginBonus.bonus.toLocaleString()} оноо авлаа!`);
    return res;
  };

  if (!user) return <AuthScreen onLogin={handleLogin} onRegister={handleRegister} error={authError} loading={authLoading} />;
  if (gameState.status === "idle") return <LobbyScreen user={user} onJoin={joinRoom} onLogout={logout} onTransfer={transferPoints} connected={connected} onRefresh={refreshUser} bonusMsg={bonusMsg} />;
  if (gameState.status === "waiting") return <WaitingScreen roomId={gameState.roomId} myColor={gameState.myColor} myRating={gameState.myRating} myPoints={gameState.myPoints} timeLimit={gameState.timeLimit} />;
  if (!gameState.myColor) return <WaitingScreen roomId={gameState.roomId} myColor={null} myRating={gameState.myRating} myPoints={gameState.myPoints} timeLimit={gameState.timeLimit} />;
  return <GameScreen gameState={gameState} user={user} onMove={makeMove} onResign={resign} onRestart={restartGame} onOfferDraw={offerDraw} onAcceptDraw={acceptDraw} onDeclineDraw={declineDraw} onRefresh={refreshUser} />;
}

const styles = {
  lobby: { minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%)",fontFamily:"'Georgia',serif",color:"#f0d9b5",padding:"1rem" },
  title: { fontSize:"2.5rem",margin:"0 0 0.5rem",letterSpacing:"2px" },
  subtitle: { color:"#a0a0c0",marginBottom:"1rem",fontSize:"0.9rem" },
  userCard: { background:"rgba(255,255,255,0.07)",border:"1px solid rgba(240,217,181,0.2)",borderRadius:"16px",padding:"1rem 1.2rem",width:"360px",marginBottom:"1rem",backdropFilter:"blur(10px)" },
  card: { background:"rgba(255,255,255,0.05)",border:"1px solid rgba(240,217,181,0.2)",borderRadius:"16px",padding:"2rem",width:"360px",backdropFilter:"blur(10px)" },
  tabRow: { display:"flex",gap:"8px",marginBottom:"1.2rem" },
  tab: { flex:1,padding:"8px",borderRadius:"8px",border:"1px solid rgba(240,217,181,0.2)",background:"transparent",color:"#a0a0c0",cursor:"pointer",fontSize:"0.95rem" },
  tabActive: { background:"rgba(74,124,89,0.4)",color:"#f0d9b5",border:"1px solid rgba(74,124,89,0.6)" },
  field: { marginBottom:"1rem" },
  label: { display:"block",marginBottom:"0.4rem",color:"#c0b090",fontSize:"0.85rem" },
  input: { width:"100%",padding:"0.7rem 1rem",borderRadius:"8px",border:"1px solid rgba(240,217,181,0.3)",background:"rgba(255,255,255,0.08)",color:"#f0d9b5",fontSize:"1rem",outline:"none",boxSizing:"border-box" },
  errorMsg: { background:"rgba(200,50,50,0.2)",border:"1px solid rgba(255,100,100,0.3)",padding:"8px 12px",borderRadius:"8px",fontSize:"0.9rem",color:"#ff9090",marginBottom:"0.5rem" },
  timeGrid: { display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"8px",marginTop:"4px" },
  timeBtn: { padding:"8px 4px",borderRadius:"8px",border:"1px solid rgba(240,217,181,0.2)",background:"rgba(255,255,255,0.05)",color:"#f0d9b5",fontSize:"0.85rem",cursor:"pointer" },
  timeBtnActive: { background:"rgba(74,124,89,0.5)",border:"1px solid rgba(74,124,89,0.8)",fontWeight:"bold" },
  btn: { flex:1,padding:"0.75rem",borderRadius:"8px",border:"none",background:"linear-gradient(135deg,#4a7c59,#2d5a3d)",color:"#fff",fontSize:"0.95rem",cursor:"pointer",fontFamily:"inherit" },
  btnOutline: { padding:"0.75rem",borderRadius:"8px",border:"1px solid rgba(240,217,181,0.3)",background:"transparent",color:"#f0d9b5",fontSize:"0.95rem",cursor:"pointer",fontFamily:"inherit" },
  btnDisabled: { opacity:0.5,cursor:"not-allowed" },
  btnDanger: { background:"linear-gradient(135deg,#8b3a3a,#5a1a1a)" },
  btnDraw: { background:"linear-gradient(135deg,#5a5a2a,#3a3a1a)" },
  smallBtn: { padding:"4px 10px",borderRadius:"12px",border:"1px solid rgba(240,217,181,0.2)",background:"rgba(255,255,255,0.05)",color:"#f0d9b5",fontSize:"0.8rem",cursor:"pointer" },
  hint: { textAlign:"center",color:"#8080a0",fontSize:"0.8rem",marginTop:"0.5rem" },
  info: { textAlign:"center",margin:"0.4rem 0" },
  code: { display:"inline-block",background:"rgba(240,217,181,0.15)",padding:"2px 10px",borderRadius:"6px",letterSpacing:"3px",fontSize:"1.1rem" },
  gameContainer: { minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%)",fontFamily:"'Georgia',serif",color:"#f0d9b5",padding:"1rem" },
  mainLayout: { display:"flex",gap:"1rem",alignItems:"flex-start",width:"100%",maxWidth:"800px" },
  boardSide: { display:"flex",flexDirection:"column",gap:"0.5rem",flex:"0 0 auto" },
  header: { display:"flex",gap:"0.5rem",alignItems:"center",marginBottom:"0.5rem",flexWrap:"wrap" },
  roomBadge: { background:"rgba(255,255,255,0.1)",padding:"4px 12px",borderRadius:"20px",fontSize:"0.85rem" },
  ratingBadge: { background:"rgba(255,200,0,0.15)",color:"#ffd700",padding:"4px 12px",borderRadius:"20px",fontSize:"0.85rem" },
  reviewBadge: { background:"rgba(100,150,255,0.2)",color:"#90b0ff",padding:"4px 12px",borderRadius:"20px",fontSize:"0.85rem" },
  timerRow: { display:"flex",alignItems:"center",gap:"0.5rem",width:"480px",maxWidth:"90vw" },
  timer: { display:"flex",alignItems:"center",gap:"8px",padding:"6px 12px",borderRadius:"8px",minWidth:"90px",justifyContent:"center",flexShrink:0 },
  playerBar: { display:"flex",alignItems:"center",gap:"0.5rem",background:"rgba(255,255,255,0.05)",padding:"8px 16px",borderRadius:"8px",flex:1,border:"1px solid transparent" },
  playerBarActive: { border:"1px solid rgba(240,217,181,0.4)",background:"rgba(255,255,255,0.1)" },
  playerBarEmpty: { color:"#8080a0",fontSize:"0.9rem",padding:"8px",flex:1 },
  turnBadge: { marginLeft:"auto",fontSize:"0.8rem",color:"#f0d9b5" },
  turnInfo: { padding:"6px 20px",borderRadius:"8px",fontSize:"0.9rem",background:"rgba(255,255,255,0.05)",color:"#a0a0c0",width:"480px",maxWidth:"90vw",textAlign:"center" },
  turnInfoActive: { background:"rgba(74,124,89,0.3)",color:"#90ffb0",fontWeight:"bold" },
  message: { background:"rgba(255,255,255,0.08)",padding:"8px 20px",borderRadius:"8px",fontSize:"0.95rem",textAlign:"center",maxWidth:"480px" },
  checkAlert: { background:"rgba(200,50,50,0.3)",border:"1px solid rgba(255,100,100,0.4)" },
  drawBanner: { background:"rgba(90,90,30,0.4)",border:"1px solid rgba(200,200,50,0.4)",padding:"10px 16px",borderRadius:"8px",textAlign:"center",width:"480px",maxWidth:"90vw",boxSizing:"border-box" },
  drawButtons: { display:"flex",gap:"8px",justifyContent:"center",marginTop:"8px" },
  drawAccept: { padding:"6px 20px",borderRadius:"6px",border:"none",background:"rgba(74,124,89,0.8)",color:"#fff",cursor:"pointer" },
  drawDecline: { padding:"6px 20px",borderRadius:"6px",border:"none",background:"rgba(139,58,58,0.8)",color:"#fff",cursor:"pointer" },
  boardWrapper: { width:"480px",maxWidth:"90vw" },
  navButtons: { display:"flex",gap:"6px",justifyContent:"center",width:"480px",maxWidth:"90vw" },
  navBtn: { flex:1,padding:"8px",borderRadius:"6px",border:"1px solid rgba(240,217,181,0.2)",background:"rgba(255,255,255,0.05)",color:"#f0d9b5",cursor:"pointer",fontSize:"0.9rem" },
  navBtnActive: { background:"rgba(74,124,89,0.4)",border:"1px solid rgba(74,124,89,0.6)" },
  actions: { display:"flex",gap:"8px",width:"480px",maxWidth:"90vw" },
  historyPanel: { background:"rgba(255,255,255,0.05)",border:"1px solid rgba(240,217,181,0.15)",borderRadius:"12px",width:"160px",maxHeight:"520px",display:"flex",flexDirection:"column",flexShrink:0 },
  historyTitle: { padding:"10px 12px",borderBottom:"1px solid rgba(240,217,181,0.15)",fontSize:"0.85rem",color:"#c0b090",fontWeight:"bold" },
  historyList: { overflowY:"auto",flex:1,padding:"6px" },
  historyRow: { display:"grid",gridTemplateColumns:"24px 1fr 1fr",gap:"2px",marginBottom:"2px" },
  historyNum: { color:"#8080a0",fontSize:"0.8rem",padding:"4px 2px",textAlign:"right" },
  historyMove: { padding:"4px 6px",borderRadius:"4px",fontSize:"0.85rem",cursor:"pointer",textAlign:"center",color:"#f0d9b5" },
  historyMoveActive: { background:"rgba(74,124,89,0.5)",fontWeight:"bold" },
  modalOverlay: { position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000 },
  modal: { background:"#16213e",border:"1px solid rgba(240,217,181,0.2)",borderRadius:"16px",padding:"2rem",width:"340px",color:"#f0d9b5" },
  ratingRow: { display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.1)",fontSize:"0.95rem" },
  table: { width:"100%",borderCollapse:"collapse",fontSize:"0.85rem" },
  th: { padding:"8px 6px",textAlign:"left",color:"#c0b090",borderBottom:"1px solid rgba(240,217,181,0.2)" },
  td: { padding:"6px",color:"#f0d9b5" },
};
