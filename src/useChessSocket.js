import { useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";

const SERVER_URL = process.env.REACT_APP_SERVER_URL || "http://localhost:3001";

const INITIAL_GAME = {
  roomId: null, myColor: null, myName: null, myRating: 1200, myPoints: 0,
  fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  turn: "white", players: [], status: "idle", message: null,
  gameOver: null, inCheck: false, lastMove: null, isSpectator: false,
  timers: { white: 600000, black: 600000 }, timeLimit: 600000,
  moveHistory: [], drawOffer: null, ratingChanges: null, escrowResult: null,
  bets: { white: 0, black: 0 },
};

export function useChessSocket() {
  const socketRef = useRef(null);
  const [gameState, setGameState] = useState(INITIAL_GAME);
  const gameStateRef = useRef(INITIAL_GAME);
  const [connected, setConnected] = useState(false);
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("chess_user")) || null; } catch { return null; }
  });
  const [authError, setAuthError] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  useEffect(() => {
    const socket = io(SERVER_URL, { autoConnect: true, reconnectionAttempts: 5 });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      const token = localStorage.getItem("chess_token");
      if (token) socket.emit("authenticate", { token });
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("authenticated", (data) => {
      setUser(data);
      localStorage.setItem("chess_user", JSON.stringify(data));
    });
    socket.on("authError", () => {
      localStorage.removeItem("chess_token");
      localStorage.removeItem("chess_user");
      setUser(null);
    });

    socket.on("joinedRoom", ({ roomId, color, playerName, playerRating, playerPoints, fen, message, timers, timeLimit, moveHistory }) => {
      setGameState((prev) => ({ ...prev, roomId, myColor: color, myName: playerName, myRating: playerRating || 1200, myPoints: playerPoints || 0, fen, status: "waiting", message, isSpectator: false, timers: timers || prev.timers, timeLimit: timeLimit || prev.timeLimit, moveHistory: moveHistory || [], ratingChanges: null, escrowResult: null }));
    });

    socket.on("joinedAsSpectator", ({ roomId, fen, message, timers, timeLimit, moveHistory }) => {
      setGameState((prev) => ({ ...prev, roomId, fen, status: "playing", message, isSpectator: true, timers: timers || prev.timers, timeLimit: timeLimit || prev.timeLimit, moveHistory: moveHistory || [] }));
    });

    socket.on("gameStart", ({ players, fen, turn, message, timers, timeLimit, moveHistory, bets }) => {
      setGameState((prev) => {
        const me = players.find((p) => p.socketId === socket.id);
        return { ...prev, players, fen, turn, status: "playing", message, gameOver: null, inCheck: false, lastMove: null, myColor: me ? me.color : prev.myColor, myRating: me ? me.rating : prev.myRating, timers: timers || prev.timers, timeLimit: timeLimit || prev.timeLimit, moveHistory: moveHistory || [], drawOffer: null, ratingChanges: null, escrowResult: null, bets: bets || { white: 0, black: 0 } };
      });
    });

    socket.on("moveMade", ({ move, fen, turn, inCheck, gameOver, movedBy, timers, moveHistory }) => {
      setGameState((prev) => ({ ...prev, fen, turn, inCheck, gameOver, lastMove: move, status: gameOver ? "finished" : "playing", timers: timers || prev.timers, moveHistory: moveHistory || prev.moveHistory, drawOffer: null,
        message: gameOver ? gameOver.type === "checkmate" ? `Checkmate! ${movedBy.name} wins! 🏆` : gameOver.type === "draw" ? "Draw! 🤝" : "Stalemate!" : inCheck ? "⚠️ Check!" : null }));
    });

    socket.on("gameOver", ({ type, winner, message, ratingChanges, escrowResult }) => {
      setGameState((prev) => ({ ...prev, status: "finished", gameOver: { type, winner }, message, ratingChanges: ratingChanges || null, escrowResult: escrowResult || null }));
      // User points шинэчлэх
      if (ratingChanges) {
        setUser((prev) => {
          if (!prev) return prev;
          const me = ratingChanges.white?.username === prev.username ? ratingChanges.white : ratingChanges.black;
          if (!me) return prev;
          return { ...prev, rating: me.newRating };
        });
      }
    });

    socket.on("timerUpdate", ({ timers }) => setGameState((prev) => ({ ...prev, timers })));
    socket.on("drawOffered", ({ by, message }) => setGameState((prev) => ({ ...prev, drawOffer: by, message })));
    socket.on("drawDeclined", ({ message }) => setGameState((prev) => ({ ...prev, drawOffer: null, message })));
    socket.on("invalidMove", ({ message }) => setGameState((prev) => ({ ...prev, message: `❌ ${message}` })));

    socket.on("gameRestarted", ({ players, fen, turn, message, timers, timeLimit, moveHistory }) => {
      setGameState((prev) => {
        const me = players.find((p) => p.socketId === socket.id);
        return { ...prev, players, fen, turn, status: "playing", message, gameOver: null, inCheck: false, lastMove: null, myColor: me ? me.color : prev.myColor, timers: timers || prev.timers, timeLimit: timeLimit || prev.timeLimit, moveHistory: moveHistory || [], drawOffer: null, ratingChanges: null, escrowResult: null, bets: { white: 0, black: 0 } };
      });
    });

    socket.on("playerDisconnected", ({ message }) => setGameState((prev) => ({ ...prev, status: "finished", message })));
    socket.on("error", ({ message }) => setGameState((prev) => ({ ...prev, message: `⚠️ ${message}` })));

    return () => { socket.disconnect(); };
  }, []);

  const register = useCallback(async (username, password, displayName, referralCode) => {
    setAuthLoading(true); setAuthError(null);
    try {
      const res = await fetch(`${SERVER_URL}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password, displayName, referralCode }) });
      const data = await res.json();
      if (!res.ok) { setAuthError(data.error); return false; }
      localStorage.setItem("chess_token", data.token);
      localStorage.setItem("chess_user", JSON.stringify(data.user));
      setUser(data.user);
      socketRef.current?.emit("authenticate", { token: data.token });
      return { success: true, bonus: data.user.points };
    } catch { setAuthError("Server error"); return false; }
    finally { setAuthLoading(false); }
  }, []);

  const login = useCallback(async (username, password) => {
    setAuthLoading(true); setAuthError(null);
    try {
      const res = await fetch(`${SERVER_URL}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
      const data = await res.json();
      if (!res.ok) { setAuthError(data.error); return false; }
      localStorage.setItem("chess_token", data.token);
      localStorage.setItem("chess_user", JSON.stringify(data.user));
      setUser(data.user);
      socketRef.current?.emit("authenticate", { token: data.token });
      return { success: true, loginBonus: data.loginBonus };
    } catch { setAuthError("Server error"); return false; }
    finally { setAuthLoading(false); }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("chess_token");
    localStorage.removeItem("chess_user");
    setUser(null);
    setGameState(INITIAL_GAME);
  }, []);

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem("chess_token");
    if (!token) return;
    try {
      const res = await fetch(`${SERVER_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (res.ok) {
        setUser(data.user);
        localStorage.setItem("chess_user", JSON.stringify(data.user));
        return data;
      }
    } catch {}
  }, []);

  const transferPoints = useCallback(async (toUsername, amount) => {
    const token = localStorage.getItem("chess_token");
    try {
      const res = await fetch(`${SERVER_URL}/points/transfer`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ toUsername, amount }) });
      const data = await res.json();
      if (res.ok) {
        setUser((prev) => prev ? { ...prev, points: data.fromPoints } : prev);
        return { success: true, ...data };
      }
      return { success: false, error: data.error };
    } catch { return { success: false, error: "Server error" }; }
  }, []);

  const joinRoom = useCallback((roomId, timeLimit, bet) => {
    socketRef.current?.emit("joinRoom", { roomId, timeLimit, bet });
    setGameState((prev) => ({ ...prev, status: "waiting", roomId }));
  }, []);

  const makeMove = useCallback((move) => {
    const { roomId, myColor, turn, status } = gameStateRef.current;
    if (status !== "playing" || myColor !== turn) return;
    socketRef.current?.emit("makeMove", { roomId, move });
  }, []);

  const resign = useCallback(() => { const { roomId } = gameStateRef.current; if (roomId) socketRef.current?.emit("resign", { roomId }); }, []);
  const restartGame = useCallback(() => { const { roomId } = gameStateRef.current; if (roomId) socketRef.current?.emit("restartGame", { roomId }); }, []);
  const offerDraw = useCallback(() => { const { roomId } = gameStateRef.current; if (roomId) socketRef.current?.emit("offerDraw", { roomId }); }, []);
  const acceptDraw = useCallback(() => { const { roomId } = gameStateRef.current; if (roomId) socketRef.current?.emit("acceptDraw", { roomId }); }, []);
  const declineDraw = useCallback(() => { const { roomId } = gameStateRef.current; if (roomId) socketRef.current?.emit("declineDraw", { roomId }); }, []);

  return { connected, user, authError, authLoading, gameState, register, login, logout, refreshUser, transferPoints, joinRoom, makeMove, resign, restartGame, offerDraw, acceptDraw, declineDraw };
}
