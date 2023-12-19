import { writable } from 'svelte/store';
import { browser } from '$app/environment';

import type { Player, Card } from './types';

const playerName = writable<string>(browser ? localStorage.getItem('localPlayerName') || '' : '');
const lobbyCode = writable<string>('');
const lobbyConnected = writable<boolean>(false);
const host = writable<string>('');
const players = writable<Player[]>([]);
const gameState = writable<{ board: Card[][]; turn: number; currentPlayerIndex: number }>({
	board: Array(11).fill(Array(11).fill({ value: 0, color: null })),
	turn: 0,
	currentPlayerIndex: 0
});
const roundHasStarted = writable<boolean>(false);

playerName.subscribe((name) => (browser ? localStorage.setItem('localPlayerName', name) : null));

export { playerName, lobbyCode, lobbyConnected, host, players, gameState, roundHasStarted };
