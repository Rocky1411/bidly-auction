import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js';
import {
  getDatabase,
  onChildAdded,
  onValue,
  push,
  ref,
  runTransaction,
  update
} from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-database.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAxTIdPMluh6bZn1qv_vLvDVynrfN1bUb4',
  authDomain: 'bidly-auction-b340e.firebaseapp.com',
  databaseURL: 'https://bidly-auction-b340e-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'bidly-auction-b340e',
  storageBucket: 'bidly-auction-b340e.firebasestorage.app',
  messagingSenderId: '152998996104',
  appId: '1:152998996104:web:d78504f13e4ea99ce0173d',
  measurementId: 'G-7E3HE2P9TF'
};

const firebaseApp = initializeApp(firebaseConfig);
const database = getDatabase(firebaseApp);
const chatReference = ref(database, 'auctionRoom/chat');
const auctionReference = ref(database, 'auctionRoom/currentAuction');
const setupReference = ref(database, 'auctionRoom/setup');

const startingCredits = 1000;
const maximumPlayers = 30;
const hostCount = 2;
const basePrice = 10;
const bidIncrement = 2;
const bidDuration = 7;
const roomLimits = { host: 3, auctioneer: 5 };
const roomStorageVersion = 'room-reset-2026-10-27';
if (localStorage.getItem('bidly-room-storage-version') !== roomStorageVersion) {
  localStorage.removeItem('bidly-room-members');
  localStorage.setItem('bidly-room-storage-version', roomStorageVersion);
}
const roomMembers = JSON.parse(localStorage.getItem('bidly-room-members') || '{"host":[],"auctioneer":[]}');
let memberSession = JSON.parse(sessionStorage.getItem('bidly-member') || '{"name":"Guest","role":"auctioneer"}');
let currentRole = memberSession.role;
let selectedRole = '';
let currentBid = basePrice;
let secondsRemaining = bidDuration;
let isPaused = false;
let auctionStarted = false;
let lastBidder = '';
let auctionId = '';
let purse = startingCredits;

const entryScreen = document.querySelector('#entry-screen');
const appShell = document.querySelector('#app-shell');
const joinForm = document.querySelector('#join-form');
const memberName = document.querySelector('#member-name');
const joinError = document.querySelector('#join-error');
const selectedRoleLabel = document.querySelector('#selected-role');
const hostRooms = document.querySelector('#host-rooms');
const auctioneerRooms = document.querySelector('#auctioneer-rooms');
const currentMemberLabel = document.querySelector('#current-member');
const playerCountSelect = document.querySelector('#auction-player-count');
const playerSetupHelp = document.querySelector('#auction-player-help');

if (memberSession.name === 'Guest' || !memberSession.role) {
  window.location.href = 'index.html';
}

function updateRoomCounts() {
  hostRooms.textContent = `${roomMembers.host.length}/${roomLimits.host} hosts`;
  auctioneerRooms.textContent = `${roomMembers.auctioneer.length}/${roomLimits.auctioneer} auctioneers`;
}

const hasActiveMember = memberSession.name !== 'Guest'
  && (memberSession.role === 'host' || memberSession.role === 'auctioneer');
if (hasActiveMember) {
  entryScreen.hidden = true;
  appShell.hidden = false;
}

function updateMemberIdentity() {
  const roleLabel = memberSession.role === 'host' ? 'host' : 'player';
  currentMemberLabel.textContent = memberSession.name === 'Guest'
    ? ''
    : `You are joining as ${memberSession.name} (${roleLabel})`;
}

for (let playerNumber = 1; playerNumber <= maximumPlayers; playerNumber += 1) {
  const option = document.createElement('option');
  option.value = playerNumber;
  option.textContent = `${playerNumber} player${playerNumber === 1 ? '' : 's'}`;
  playerCountSelect.appendChild(option);
}

let setupOwnerName = '';
function updatePlayerSetup(setup) {
  const playerCount = Math.min(maximumPlayers, Math.max(1, Number(setup?.playerCount) || 1));
  setupOwnerName = setup?.ownerName || '';
  playerCountSelect.value = String(playerCount);
  const canEdit = currentRole === 'host' && setupOwnerName === memberSession.name;
  playerCountSelect.disabled = !canEdit;
  playerSetupHelp.textContent = canEdit
    ? 'You are the first host · maximum 30'
    : setupOwnerName
      ? `Set by first host · ${playerCount} players`
      : 'Waiting for the first host · maximum 30';
}

function claimFirstHostSetup() {
  if (currentRole !== 'host') return;
  runTransaction(setupReference, (setup) => setup || {
    ownerName: memberSession.name,
    playerCount: 1
  });
}

playerCountSelect.addEventListener('change', () => {
  if (currentRole === 'host' && setupOwnerName === memberSession.name) {
    update(setupReference, { playerCount: Number(playerCountSelect.value) });
  }
});

onValue(setupReference, (snapshot) => updatePlayerSetup(snapshot.val()));

document.querySelectorAll('.role-card').forEach((roleCard) => {
  roleCard.addEventListener('click', () => {
    selectedRole = roleCard.dataset.role;
    document.querySelectorAll('.role-card').forEach((card) => {
      card.classList.toggle('selected', card === roleCard);
    });
    joinForm.hidden = false;
    selectedRoleLabel.textContent = `Joining as ${selectedRole}`;
    joinError.textContent = '';
    memberName.focus();
  });
});

joinForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = memberName.value.trim();
  if (!selectedRole || !name) return;
  if (roomMembers[selectedRole].length >= roomLimits[selectedRole]) {
    joinError.textContent = `The ${selectedRole} room is full.`;
    return;
  }
  roomMembers[selectedRole].push(name);
  localStorage.setItem('bidly-room-members', JSON.stringify(roomMembers));
  memberSession = { name, role: selectedRole };
  currentRole = selectedRole;
  sessionStorage.setItem('bidly-member', JSON.stringify(memberSession));
  loadPurse();
  updateMemberIdentity();
  claimFirstHostSetup();
  entryScreen.hidden = true;
  appShell.hidden = false;
  updateRoomCounts();
  claimFirstHostSetup();
  claimFirstHostSetup();
  applyRolePermissions();
});

updateRoomCounts();

document.querySelector('#credit-balance').textContent =
  startingCredits.toLocaleString('en-US');
function updatePurseDisplay() {
  document.querySelector('#credit-balance').textContent =
    purse.toLocaleString('en-US');
}

function loadPurse() {
  const savedPurse = Number(localStorage.getItem(`bidly-purse-${memberSession.name}`));
  purse = Number.isFinite(savedPurse) && savedPurse >= 0 ? savedPurse : startingCredits;
  updatePurseDisplay();
}

loadPurse();

const participantCount = document.querySelector('#participant-count');
const captainCount = document.querySelector('#captain-count');
const playerList = document.querySelector('#player-list');
const playerCountLabel = document.querySelector('#player-count-label');
const eligibleCount = document.querySelector('#eligible-count');
const playersPerCaptain = document.querySelector('#players-per-captain');
const unsoldCount = document.querySelector('#unsold-count');
const activePlayer = document.querySelector('#active-player');
const activePlayerName = document.querySelector('#active-player-name');
const timerElement = document.querySelector('#bid-timer');
const bidElement = document.querySelector('#current-bid');
const bidOneButton = document.querySelector('#bid-one-button');
const bidTwoButton = document.querySelector('#bid-two-button');
const bidButtons = [bidOneButton, bidTwoButton];
const stateElement = document.querySelector('#auction-state');
const pauseLabels = document.querySelectorAll('.pause-action');
const reauctionButton = document.querySelector('#reauction-button');
const soldButton = document.querySelector('#sold-button');
const soldPanel = document.querySelector('#sold-panel');
const livePanel = document.querySelector('.live-panel');
const auctionMode = document.querySelector('#auction-mode');
const hostControls = document.querySelector('.host-bar');
const chatForm = document.querySelector('#chat-form');
const chatInput = document.querySelector('#chat-input');
const chatMessages = document.querySelector('#chat-messages');

for (let memberNumber = hostCount + 1; memberNumber <= maximumPlayers; memberNumber += 1) {
  const option = document.createElement('option');
  option.value = memberNumber;
  option.textContent = `${memberNumber} members`;
  participantCount.appendChild(option);
}

function renderCaptainOptions() {
  const totalMembers = Number(participantCount.value);
  const currentCaptainCount = Number(captainCount.value);
  captainCount.replaceChildren();

  for (let count = 1; count <= totalMembers - hostCount; count += 1) {
    const option = document.createElement('option');
    option.value = count;
    option.textContent = `${count} captain${count === 1 ? '' : 's'}`;
    captainCount.appendChild(option);
  }

  captainCount.value = String(Math.min(currentCaptainCount || 5, totalMembers - hostCount));
}

function renderPlayers() {
  const totalMembers = Number(participantCount.value);
  const captainTotal = Number(captainCount.value);
  const eligibleTotal = totalMembers - captainTotal - hostCount;
  const perCaptain = Math.floor(eligibleTotal / captainTotal);
  const unsoldTotal = eligibleTotal % captainTotal;
  playerList.replaceChildren();
  playerCountLabel.textContent = `${eligibleTotal} player${eligibleTotal === 1 ? '' : 's'}`;
  eligibleCount.textContent = eligibleTotal;
  playersPerCaptain.textContent = perCaptain;
  unsoldCount.textContent = unsoldTotal;

  for (let playerNumber = 1; playerNumber <= eligibleTotal; playerNumber += 1) {
    const playerButton = document.createElement('button');
    playerButton.className = 'player-option';
    playerButton.type = 'button';
    playerButton.textContent = `Player ${playerNumber}`;
    playerButton.dataset.player = `Player ${playerNumber}`;
    playerButton.addEventListener('click', () => {
      document.querySelectorAll('.player-option').forEach((button) => {
        button.classList.toggle('active', button === playerButton);
      });
      activePlayer.textContent = playerButton.dataset.player;
      activePlayerName.textContent = playerButton.dataset.player;
      currentBid = basePrice;
      secondsRemaining = bidDuration;
      lastBidder = '';
      auctionId = '';
      bidElement.textContent = currentBid;
      updateBidControls();
    });
    playerList.appendChild(playerButton);
  }

  playerList.firstElementChild.classList.add('active');
}

participantCount.value = '27';
captainCount.value = '5';
participantCount.addEventListener('change', () => {
  renderCaptainOptions();
  renderPlayers();
});
captainCount.addEventListener('change', renderPlayers);
renderCaptainOptions();
renderPlayers();

function updateBidControls() {
  timerElement.textContent = secondsRemaining;
  bidButtons.forEach((button) => {
    button.disabled = currentRole !== 'auctioneer' || !auctionStarted || isPaused || secondsRemaining === 0;
  });
  stateElement.textContent = isPaused
    ? 'Auction paused by host'
    : !auctionStarted
      ? 'Waiting to start'
      : secondsRemaining === 0
      ? 'Bid window closed'
      : 'Bidding is open';
  pauseLabels.forEach((label) => {
    label.textContent = isPaused ? 'Resume' : 'Pause';
  });
}

function applyRolePermissions() {
  const isHost = currentRole === 'host';
  hostControls.hidden = !isHost;
  bidButtons.forEach((button) => {
    button.disabled = isHost || !auctionStarted || isPaused || secondsRemaining === 0;
  });
}

function placeBid(increment) {
  if (currentRole !== 'auctioneer' || isPaused || secondsRemaining === 0 || purse < currentBid + increment) return;
  currentBid += increment;
  lastBidder = memberSession.name;
  secondsRemaining = bidDuration;
  bidElement.textContent = currentBid;
  update(auctionReference, {
    auctionId,
    currentBid,
    lastBidder,
    player: activePlayer.textContent,
    status: 'bidding'
  });
  updateBidControls();
}

bidOneButton.addEventListener('click', () => placeBid(1));
bidTwoButton.addEventListener('click', () => placeBid(bidIncrement));

document.querySelectorAll('.host-button').forEach((button) => {
  button.addEventListener('click', () => {
    if (currentRole !== 'host' || button.classList.contains('reauction-button')) return;
    if (!auctionStarted) {
      auctionStarted = true;
      isPaused = false;
      auctionId = `${activePlayer.textContent}-${Date.now()}`;
      auctionMode.textContent = 'Bidding now';
      update(auctionReference, {
        auctionId,
        currentBid,
        lastBidder,
        player: activePlayer.textContent,
        status: 'bidding'
      });
      updateBidControls();
      return;
    }
    isPaused = !isPaused;
    stateElement.dataset.host = button.dataset.host;
    updateBidControls();
  });
});

function resetCurrentPlayer() {
  if (currentRole !== 'host') return;
  currentBid = basePrice;
  secondsRemaining = bidDuration;
  isPaused = false;
  auctionStarted = false;
  lastBidder = '';
  auctionId = '';
  soldPanel.hidden = true;
  livePanel.hidden = false;
  auctionMode.textContent = 'Waiting to start';
  bidElement.textContent = currentBid;
  stateElement.textContent = 'Player re-auctioned';
  updateBidControls();
}

reauctionButton.addEventListener('click', resetCurrentPlayer);

function settleWinningPurse() {
  if (currentRole !== 'auctioneer' || lastBidder !== memberSession.name || !auctionId) return;
  const saleKey = `bidly-sale-${auctionId}`;
  if (localStorage.getItem(saleKey)) return;
  purse = Math.max(0, purse - currentBid);
  localStorage.setItem(`bidly-purse-${memberSession.name}`, String(purse));
  localStorage.setItem(saleKey, 'settled');
  updatePurseDisplay();
}

soldButton.addEventListener('click', () => {
  if (currentRole !== 'host' || !auctionStarted) return;
  document.querySelector('#sold-price').textContent = currentBid;
  document.querySelector('#sold-captain').textContent = `${lastBidder || 'No auctioneer'} · Auctioneer`;
  soldPanel.hidden = false;
  livePanel.hidden = true;
  auctionStarted = false;
  isPaused = true;
  auctionMode.textContent = 'Player sold';
  settleWinningPurse();
  update(auctionReference, {
    auctionId,
    currentBid,
    lastBidder,
    player: activePlayer.textContent,
    status: 'sold'
  });
  updateBidControls();
});

onValue(auctionReference, (snapshot) => {
  const auction = snapshot.val();
  if (!auction) return;
  if (auction.player && auction.player !== activePlayer.textContent) {
    activePlayer.textContent = auction.player;
    activePlayerName.textContent = auction.player;
  }
  if (typeof auction.currentBid === 'number') {
    currentBid = auction.currentBid;
    bidElement.textContent = currentBid;
  }
  lastBidder = auction.lastBidder || '';
  auctionId = auction.auctionId || auctionId;
  if (auction.status === 'bidding') {
    auctionStarted = true;
    isPaused = false;
  }
  if (auction.status === 'sold') {
    document.querySelector('#sold-price').textContent = currentBid;
    document.querySelector('#sold-captain').textContent = `${lastBidder || 'No auctioneer'} · Auctioneer`;
    soldPanel.hidden = false;
    livePanel.hidden = true;
    auctionStarted = false;
    isPaused = true;
    settleWinningPurse();
  }
  updateBidControls();
});

function addChatMessage(name, message) {
  const messageElement = document.createElement('p');
  messageElement.className = 'chat-message';
  const nameElement = document.createElement('strong');
  nameElement.textContent = name;
  messageElement.append(nameElement, document.createTextNode(message));
  chatMessages.appendChild(messageElement);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;
  const roleLabel = memberSession.role === 'host' ? 'host' : 'player';
  push(chatReference, {
    name: memberSession.name,
    role: roleLabel,
    message,
    sentAt: Date.now()
  }).catch(() => {
    const errorMessage = document.createElement('p');
    errorMessage.className = 'system-message';
    errorMessage.textContent = 'Message could not be sent. Check the database connection.';
    chatMessages.appendChild(errorMessage);
  });
  chatInput.value = '';
});

onChildAdded(chatReference, (snapshot) => {
  const chatMessage = snapshot.val();
  if (chatMessage?.name && chatMessage?.message) {
    const roleLabel = chatMessage.role === 'host' ? 'host' : 'player';
    addChatMessage(`${chatMessage.name} (${roleLabel})`, chatMessage.message);
  }
});

if (currentRole === 'host') {
  document.querySelector('.bid-value').classList.add('host-view');
}
applyRolePermissions();
updateMemberIdentity();

setInterval(() => {
  if (!isPaused && secondsRemaining > 0) {
    secondsRemaining -= 1;
    updateBidControls();
  }
}, 1000);

updateBidControls();
