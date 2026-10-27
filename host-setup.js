import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js';
import {
  getDatabase,
  onValue,
  ref,
  runTransaction
} from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-database.js';

const firebaseApp = initializeApp({
  apiKey: 'AIzaSyAxTIdPMluh6bZn1qv_vLvDVynrfN1bUb4',
  authDomain: 'bidly-auction-b340e.firebaseapp.com',
  databaseURL: 'https://bidly-auction-b340e-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'bidly-auction-b340e',
  storageBucket: 'bidly-auction-b340e.firebasestorage.app',
  messagingSenderId: '152998996104',
  appId: '1:152998996104:web:d78504f13e4ea99ce0173d'
});
const setupReference = ref(getDatabase(firebaseApp), 'auctionRoom/setup');
const maximumPlayers = 30;
const member = JSON.parse(sessionStorage.getItem('bidly-member') || '{}');
const playerCount = document.querySelector('#host-player-count');
const form = document.querySelector('#host-setup-form');
const error = document.querySelector('#host-setup-error');
let canEdit = false;

if (member.role !== 'host' || !member.name) {
  window.location.href = 'index.html';
} else {
  for (let count = 1; count <= maximumPlayers; count += 1) {
    const option = document.createElement('option');
    option.value = count;
    option.textContent = `${count} player${count === 1 ? '' : 's'}`;
    playerCount.appendChild(option);
  }
  playerCount.value = sessionStorage.getItem('bidly-player-count') || '20';
}

onValue(setupReference, (snapshot) => {
  const setup = snapshot.val();
  if (!setup) {
    canEdit = true;
    return;
  }
  canEdit = setup.ownerName === member.name;
  playerCount.value = String(setup.playerCount || 20);
  playerCount.disabled = !canEdit;
  error.textContent = canEdit
    ? 'You are the first host and can edit this setting.'
    : `The first host (${setup.ownerName}) already set the player count.`;
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!canEdit) return;
  runTransaction(setupReference, (setup) => setup || {
    ownerName: member.name,
    playerCount: Number(playerCount.value)
  }).then(() => {
    sessionStorage.setItem('bidly-player-count', playerCount.value);
    window.location.href = 'auction.html';
  }).catch(() => {
    error.textContent = 'Could not save the player count. Please try again.';
  });
});
