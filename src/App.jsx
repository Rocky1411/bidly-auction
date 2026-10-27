import { useEffect, useMemo, useState } from 'react';
import { initializeApp } from 'firebase/app';
import {
  get,
  getDatabase,
  limitToLast,
  onValue,
  orderByChild,
  push,
  query,
  ref,
  remove,
  runTransaction,
  set
} from 'firebase/database';
import { useLocation, useNavigate } from 'react-router-dom';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};
const database = Object.values(firebaseConfig).every(Boolean)
  ? getDatabase(initializeApp(firebaseConfig))
  : null;
const MAX_CHAT_MESSAGES = 16;
const BID_WINDOW_MS = 7000;
const getMember = () => JSON.parse(sessionStorage.getItem('bidly-member') || 'null');

function Logo() {
  return <a className="brand" href="/"><span className="brand-mark">B</span>bidly</a>;
}

function RoleEntry() {
  const navigate = useNavigate();
  const [role, setRole] = useState('');
  const [name, setName] = useState('');
  function submit(event) {
    event.preventDefault();
    if (!role || !name.trim()) return;
    sessionStorage.setItem('bidly-member', JSON.stringify({ name: name.trim(), role }));
    navigate(role === 'host' ? '/host-setup' : '/auction');
  }
  return <main className="screen"><section className="card"><Logo /><p className="eyebrow">WELCOME TO THE LIVE AUCTION</p><h1>Choose how you<br /><span>want to join.</span></h1><p className="muted">Register your name before entering the room.</p><div className="role-grid">{['host', 'auctioneer'].map((option) => <button className={`role-card ${role === option ? 'active' : ''}`} key={option} onClick={() => setRole(option)}><strong>{option === 'host' ? 'Host' : 'Auctioneer'}</strong><small>{option === 'host' ? 'Control the auction room' : 'Bid with 1,000 credits'}</small></button>)}</div>{role && <form className="form" onSubmit={submit}><label htmlFor="member-name">Register your name</label><input id="member-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter your name" autoFocus required /><button className="button" type="submit">Continue <span>→</span></button></form>}</section></main>;
}

function HostSetup() {
  const navigate = useNavigate();
  const member = getMember();
  const [count, setCount] = useState(sessionStorage.getItem('bidly-player-count') || '20');
  useEffect(() => { if (!member || member.role !== 'host') navigate('/'); }, [member, navigate]);
  function submit(event) {
    event.preventDefault();
    sessionStorage.setItem('bidly-player-count', count);
    if (database) {
      const nextPlayerCount = Number(count);
      set(ref(database, 'auctionRoom/setup'), { ownerName: member.name, playerCount: nextPlayerCount });
      set(ref(database, 'auctionRoom/currentAuction'), {
        status: 'paused',
        currentBid: 10,
        player: 'Player 1',
        playerNumber: 1,
        lastBidder: '',
        timerEndsAt: 0,
        auctionId: `player-1-${Date.now()}`
      });
      remove(ref(database, 'auctionRoom/chat'));
      remove(ref(database, 'auctionRoom/sales'));
    }
    navigate('/auction');
  }
  return <main className="screen"><section className="card"><Logo /><p className="eyebrow">HOST SETUP</p><h1>Prepare the<br /><span>auction room.</span></h1><p className="muted">Choose between 1 and 30 players. The first host controls this setting.</p><form className="form" onSubmit={submit}><label htmlFor="player-count">Number of players</label><select id="player-count" value={count} onChange={(event) => setCount(event.target.value)}>{Array.from({ length: 30 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value} player{value === 1 ? '' : 's'}</option>)}</select><button className="button" type="submit">Enter auction <span>→</span></button></form></section></main>;
}

function Auction() {
  const navigate = useNavigate();
  const member = getMember();
  const isHost = member?.role === 'host';
  const [purse, setPurse] = useState(() => Number(localStorage.getItem(`bidly-purse-${member?.name}`)) || 1000);
  const [playerCount, setPlayerCount] = useState(() => Number(sessionStorage.getItem('bidly-player-count')) || 20);
  const [auction, setAuction] = useState({
    status: 'paused',
    currentBid: 10,
    player: 'Player 1',
    playerNumber: 1,
    lastBidder: '',
    timerEndsAt: 0,
    auctionId: 'player-1'
  });
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const chatReference = useMemo(() => database && ref(database, 'auctionRoom/chat'), []);
  const auctionReference = useMemo(() => database && ref(database, 'auctionRoom/currentAuction'), []);

  useEffect(() => { if (!member) navigate('/'); }, [member, navigate]);
  useEffect(() => {
    if (!database) return undefined;
    return onValue(ref(database, 'auctionRoom/setup'), (snapshot) => {
      const setup = snapshot.val();
      if (setup?.playerCount) {
        setPlayerCount(Number(setup.playerCount));
        sessionStorage.setItem('bidly-player-count', String(setup.playerCount));
      }
    });
  }, []);
  useEffect(() => {
    if (!auctionReference) return undefined;
    return onValue(auctionReference, (snapshot) => {
      if (snapshot.exists()) setAuction(snapshot.val());
    });
  }, [auctionReference]);
  useEffect(() => chatReference && onValue(
    query(chatReference, orderByChild('sentAt'), limitToLast(MAX_CHAT_MESSAGES)),
    (snapshot) => setMessages(Object.values(snapshot.val() || {}))
  ), [chatReference]);
  useEffect(() => {
    if (!isHost || !auctionReference) return;
    runTransaction(auctionReference, (value) => value || {
      status: 'paused',
      currentBid: 10,
      player: 'Player 1',
      playerNumber: 1,
      lastBidder: '',
      timerEndsAt: 0,
      auctionId: `player-1-${Date.now()}`
    });
    runTransaction(auctionReference, (value) => value?.status === 'complete' || (
      value?.status === 'sold' && !Number.isInteger(value.playerNumber)
    ) ? {
      status: 'paused',
      currentBid: 10,
      player: 'Player 1',
      playerNumber: 1,
      lastBidder: '',
      timerEndsAt: 0,
      auctionId: `player-1-${Date.now()}`
    } : value);
  }, [auctionReference, isHost]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const remaining = auction.status === 'bidding'
        ? Math.max(0, Math.ceil((auction.timerEndsAt - Date.now()) / 1000))
        : 0;
      setSecondsRemaining(remaining);
      if (remaining === 0 && auction.status === 'bidding' && auctionReference) {
        runTransaction(auctionReference, (value) => (
          value?.status === 'bidding' && value.timerEndsAt <= Date.now()
            ? { ...value, status: value.lastBidder ? 'sold' : 'unsold', outcome: value.lastBidder ? 'sold' : 'unsold', timerEndsAt: 0 }
            : value
        ));
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [auction, auctionReference]);
  useEffect(() => {
    if (!['sold', 'unsold'].includes(auction.status) || !database || !auction.auctionId) return;
    const saleReference = ref(database, `auctionRoom/sales/${auction.auctionId}`);
    const announcementKey = `bidly-announcement-${auction.auctionId}`;
    runTransaction(saleReference, (value) => value || {
      announcedBy: member.name,
      announcedAt: Date.now(),
      outcome: auction.outcome || (auction.lastBidder ? 'sold' : 'unsold')
    })
      .then(async (result) => {
        const sale = result.snapshot.val();
        if (result.committed && sale.announcedBy === member.name && !localStorage.getItem(announcementKey)) {
          localStorage.setItem(announcementKey, 'sent');
          await push(chatReference, {
            name: 'Auction bot',
            role: 'system',
            message: sale.outcome === 'sold'
              ? `${auction.player} sold to ${auction.lastBidder} for ${auction.currentBid} credits`
              : `${auction.player} unsold`,
            sentAt: Date.now()
          });
        }
        if (auction.playerNumber < playerCount) {
          await runTransaction(auctionReference, (value) => value?.auctionId === auction.auctionId && ['sold', 'unsold'].includes(value.status)
            ? {
              status: 'bidding',
              currentBid: 10,
              player: `Player ${auction.playerNumber + 1}`,
              playerNumber: auction.playerNumber + 1,
              lastBidder: '',
              timerEndsAt: Date.now() + BID_WINDOW_MS,
              auctionId: `player-${auction.playerNumber + 1}-${Date.now()}`
            }
            : value);
        } else {
          await runTransaction(auctionReference, (value) => value?.auctionId === auction.auctionId
            ? { ...value, status: 'complete', timerEndsAt: 0 }
            : value);
        }
      });
    if (!isHost && auction.lastBidder === member.name) {
      const saleKey = `bidly-sale-${auction.auctionId}`;
      if (!localStorage.getItem(saleKey)) {
        const nextPurse = Math.max(0, purse - auction.currentBid);
        localStorage.setItem(`bidly-purse-${member.name}`, String(nextPurse));
        localStorage.setItem(saleKey, 'settled');
        setPurse(nextPurse);
      }
    }
  }, [auction, auctionReference, chatReference, isHost, member?.name, playerCount, purse]);

  function updateAuction(transform) {
    if (auctionReference) runTransaction(auctionReference, transform);
  }
  function placeBid(increment) {
    if (isHost || auction.status !== 'bidding' || purse < auction.currentBid + increment) return;
    updateAuction((value) => value?.status === 'bidding' && value.timerEndsAt > Date.now()
      ? { ...value, currentBid: value.currentBid + increment, lastBidder: member.name, timerEndsAt: Date.now() + BID_WINDOW_MS }
      : value);
  }
  function resumeAuction() {
    if (isHost) updateAuction((value) => value?.status === 'paused' ? { ...value, status: 'bidding', timerEndsAt: Date.now() + BID_WINDOW_MS } : value);
  }
  function pauseAuction() {
    if (isHost) updateAuction((value) => value?.status === 'bidding' ? { ...value, status: 'paused', timerEndsAt: 0 } : value);
  }
  function reauction() {
    if (isHost) updateAuction((value) => value && ['sold', 'unsold'].includes(value.status)
      ? { ...value, status: 'paused', outcome: '', currentBid: 10, lastBidder: '', timerEndsAt: 0, auctionId: `${value.player}-${Date.now()}` }
      : value);
  }
  function sendMessage(event) {
    event.preventDefault();
    if (!message.trim()) return;
    const item = { name: member.name, role: isHost ? 'host' : 'player', message: message.trim(), sentAt: Date.now() };
    if (chatReference) {
      push(chatReference, item).then(async () => {
        const snapshot = await get(chatReference);
        const entries = Object.entries(snapshot.val() || {}).sort(([, first], [, second]) => first.sentAt - second.sentAt);
        await Promise.all(entries.slice(0, -MAX_CHAT_MESSAGES).map(([key]) => remove(ref(database, `auctionRoom/chat/${key}`))));
      });
    }
    setMessage('');
  }
  const isBidding = auction.status === 'bidding';
  const isSold = auction.status === 'sold';
  const isUnsold = auction.status === 'unsold';
  const isComplete = auction.status === 'complete';
  return <main className="auction-page"><header className="topbar"><Logo /><span className="purse">{isHost ? 'Host controls' : `${purse.toLocaleString()} credits`}</span></header><section className="auction-card"><div><span className="player-label">PLAYER · {auction.player}</span><h2 className="player-name">{auction.player}</h2><span className="muted">Player {auction.playerNumber} of {playerCount} · Base price: 10 credits</span></div><div className="timer">{secondsRemaining}<small> sec</small></div>{!isSold && !isUnsold && !isComplete && <div><strong>{auction.currentBid} Cr</strong>{!isHost && <div className="bid-actions"><button className="button" onClick={() => placeBid(1)} disabled={!isBidding}>+1</button><button className="button" onClick={() => placeBid(2)} disabled={!isBidding}>+2</button></div>}</div>}</section>{isSold && <div className="sold"><strong>SOLD!</strong>{auction.currentBid} Cr<br /><span>{auction.player} · {auction.lastBidder}</span></div>}{isUnsold && <div className="unsold"><strong>UNSOLD</strong><br /><span>{auction.player} received no bids</span></div>}{isComplete && <div className="sold"><strong>AUCTION COMPLETE</strong><br /><span>All {playerCount} players have been processed.</span></div>}{isHost && <div className="host-actions"><button onClick={isBidding ? pauseAuction : resumeAuction} disabled={isSold || isUnsold || isComplete}>{isBidding ? 'Pause' : 'Resume'}</button><button onClick={reauction} disabled={!isSold && !isUnsold}>Re-auction</button></div>}<section className="chat"><h3>Room chat</h3><div className="chat-messages">{messages.map((item, index) => <p className="message" key={`${item.sentAt}-${index}`}><strong>{item.name} ({item.role})</strong>{item.message}</p>)}</div><form className="chat-form" onSubmit={sendMessage}><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Message the room..." /><button className="button" type="submit">Send</button></form></section></main>;
}

export default function App() {
  const location = useLocation();
  if (location.pathname === '/host-setup') return <HostSetup />;
  if (location.pathname === '/auction') return <Auction />;
  return <RoleEntry />;
}
