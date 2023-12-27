import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import type { Card, Player } from './types';
import { translations } from './translations';
import { goto } from '$app/navigation';
import { v4 as uuidV4 } from 'uuid';

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
const codeCopied = writable<boolean>(false);
const infoVisible = writable<boolean>(true);
const languageId = writable<string>(browser ? navigator.language.split('-')[0] || 'en' : 'en');
const invitation = {
	title: 'Punto',
	text: "Let's play Punto!",
	url: 'https://punto.vercel.app'
};
const neutralColor = writable<string>('');
const uuid = writable<string>(browser ? localStorage.getItem('uuid') || uuidV4() : uuidV4());

playerName.subscribe((name: string) =>
	browser ? localStorage.setItem('localPlayerName', name) : null
);

languageId.subscribe((id: string) => {
	invitation.text = translations[id].inviteText;
});

lobbyCode.subscribe((code: string) => {
	if (typeof window === 'undefined') return;
	invitation.url = `${window.location.origin.toString()}/?code=${code}`;
});

uuid.subscribe((id: string) => {
	browser ? localStorage.setItem('uuid', id) : null;
});

/**
 * Resets the app to its initial state
 */
function resetApp() {
	playerName.set(browser ? localStorage.getItem('localPlayerName') || '' : '');
	// lobbyCode.set('');

	// reset code param in URL
	// TODO: does not work...
	// replaceState(window.location.origin, '/');
	// pushState(window.location.origin, '');
	goto(window.location.origin, { replaceState: true });

	lobbyConnected.set(false);
	host.set('');
	players.set([]);
	gameState.set({
		board: Array(11).fill(Array(11).fill({ value: 0, color: null })),
		turn: 0,
		currentPlayerIndex: 0
	});
	roundHasStarted.set(false);
	infoVisible.set(true);
	neutralColor.set('');
}

export {
	playerName,
	lobbyCode,
	lobbyConnected,
	host,
	players,
	gameState,
	roundHasStarted,
	codeCopied,
	infoVisible,
	resetApp,
	languageId,
	invitation,
	neutralColor,
	uuid
};
