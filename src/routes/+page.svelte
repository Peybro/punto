<script lang="ts">
	import { db } from '$lib/firebase';
	import { get, off, onDisconnect, onValue, push, ref, set, update } from 'firebase/database';
	import toast from 'svelte-french-toast';
	import Board from '$lib/components/Board.svelte';
	import {
		gameState,
		host,
		infoVisible,
		languageId,
		lobbyCode,
		lobbyConnected,
		neutralColor,
		oldGame,
		player,
		players,
		playersOnline,
		renameInProgress,
		resetApp,
		roundHasStarted,
		winnerWithThrees
	} from '$lib/store';
	import Face from '$lib/components/dice/Face.svelte';
	import { colors, type Card, type Color, type Player } from '$lib/types';
	import { duplicate, fourInARow, getBeautifulColors, getMostThrees, shuffle } from '$lib/utils';
	import PlayerList from '$lib/components/PlayerList.svelte';
	import LobbyInfo from '$lib/components/LobbyInfo.svelte';
	import Heading from '$lib/components/Heading.svelte';
	import { translations } from '$lib/translations';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { fly } from 'svelte/transition';
	import { onMount } from 'svelte';
	import InfoBoard from '$lib/components/InfoBoard.svelte';

	$: selectedLanguage = translations[$languageId];
	$: isHost = $host.uuid === $player.uuid;
	$: currentPlayer = $players[$gameState.currentPlayerIndex];

	onMount(() => {
		const tempLobbyCode = $page.url.searchParams.get('code') || '';

		if (tempLobbyCode.length === 6) {
			if ($player.name === '') $player.name = 'Player ' + $player.uuid.substring(0, 4);

			get(ref(db, `${tempLobbyCode}/`)).then((snap) => {
				if (snap.val() === null) {
					toast.error(selectedLanguage.toasts.noMatchingRoom);
				} else {
					$lobbyCode = tempLobbyCode;
					joinLobby();
				}
			});
		}
	});

	/**
	 * Listens to the lobby with the given code and updates the store accordingly
	 * @param code The lobby code to listen to
	 */
	function listenToLobby(code: string) {
		const callback = async (snap: { val: () => any }) => {
			const data = snap.val();

			if (data === null) {
				toast.error(selectedLanguage.toasts.roomNotFound);
				await leaveLobby();
			} else {
				// save old game state to rejoin if disconnected
				$oldGame = data;

				if (
					$players.some((p: Player) => p.uuid === $player.uuid) &&
					!data.players.some((p: Player) => p.uuid === $player.uuid)
				) {
					toast.error(selectedLanguage.toasts.kick);
					await leaveLobby();
				}

				if (data.roundHasStarted) {
					$renameInProgress = false;
					$player.name = data.players.find((p: Player) => p.uuid === $player.uuid)?.name;
				}

				// TODO: toasts for renamed players
				// toast if someone left or joined
				if (data.presence !== undefined) {
					// check if someone left
					const playerWhoLeft: Player | undefined = $players.filter(
						(player) => !Object.keys(data.presence).includes(player.uuid)
					)[0];

					// TODO: runs multiple times when someone leaves
					if (playerWhoLeft !== undefined && playerWhoLeft.name !== '') {
						toast.error(`${playerWhoLeft.name} ${selectedLanguage.toasts.playerLeft}`);
					}

					// give host to someone else if host left
					if (playerWhoLeft !== undefined && playerWhoLeft.uuid === $host.uuid) {
						const newHost = $players.filter((p) => p.uuid !== playerWhoLeft.uuid)[0];
						await update(ref(db, `${$lobbyCode}/host`), {
							name: newHost.name,
							uuid: newHost.uuid
						});
					}
				}

				// update local state with data from database
				$host = data.host;
				$players = data.players;
				$gameState = data.gameState;
				$roundHasStarted = data.roundHasStarted;
				$infoVisible = !data.roundHasStarted;
				$neutralColor = data.neutralColor;

				$playersOnline = [];
				if (data.presence !== undefined) {
					Object.keys(data.presence).forEach((p) => {
						if (data.presence[p].connections !== undefined) {
							$playersOnline = [...$playersOnline, p];
						}
					});
				}

				// update url with lobby code
				$page.url.searchParams.set('code', data.lobbyCode);
				await goto(`?${$page.url.searchParams.toString()}`);
				// TODO: should be better with SvelteKit but does not work...
				// pushState("", `?${$page.url.searchParams.toString()}`);

				// check if someone won
				if ($roundHasStarted && fourInARow($gameState.board, $neutralColor)) {
					// turn off listener to prevent multiple updates
					off(ref(db, `${$lobbyCode}/`));
					// reset currentPlayerIndex to prevent future errors
					await set(ref(db, `${$lobbyCode}/gameState/currentPlayerIndex`), 0);

					toast(`${currentPlayer.name} ${selectedLanguage.toasts.win}`, { icon: '🎉' });
					await set(
						ref(db, `${$lobbyCode}/players/${$gameState.currentPlayerIndex}/wins`),
						currentPlayer.wins + 1
					);
					await set(ref(db, `${$lobbyCode}/roundHasStarted`), false);

					// turn on listener again
					onValue(ref(db, `${$lobbyCode}/`), callback);
				}

				// no more cards left
				if ($roundHasStarted && $players.every((p) => p.deck === undefined)) {
					// turn off listener to prevent multiple updates
					off(ref(db, `${$lobbyCode}/`));
					// reset currentPlayerIndex to prevent future errors
					await set(ref(db, `${$lobbyCode}/gameState/currentPlayerIndex`), 0);

					const mostThrees = (threeCountObj: {
						red: number;
						blue: number;
						green: number;
						yellow: number;
					}) =>
						Object.entries(threeCountObj).reduce(
							(max, color) => (color[1] > max[1] ? color : max),
							Object.entries(threeCountObj)[0]
						);
					const winner: [string, number] = mostThrees(getMostThrees($gameState.board));
					const winnerIndex = $players.findIndex((p) => p.color === winner[0]);
					$winnerWithThrees = [$players[winnerIndex].name, winner[1]];

					toast(
						`${selectedLanguage.toasts.winnerWhenNoCards} (${$players[winnerIndex].name}: ${winner[1]})`
					);

					await set(
						ref(db, `${$lobbyCode}/players/${winnerIndex}/wins`),
						$players[winnerIndex].wins + 1
					);
					await set(ref(db, `${$lobbyCode}/roundHasStarted`), false);

					// turn on listener again
					onValue(ref(db, `${$lobbyCode}/`), callback);
				}
			}
		};

		// listen to updates from database
		onValue(ref(db, `${code}/`), callback);
	}

	function getpresence(code: string) {
		const connectedRef = ref(db, '.info/connected');
		off(connectedRef);

		const callback = async (snap: { val: () => any }) => {
			if (snap.val()) {
				const con = push(ref(db, `${code}/presence/${$player.uuid}/connections`));

				await onDisconnect(con).remove();
				await set(con, true);
			}
		};

		onValue(connectedRef, callback);
	}

	/**
	 * Starts the round by resetting the lobby and shuffling the players
	 */
	async function startRound() {
		await resetLobby();

		// TODO: implement team play with 4 players: each team 2 decks shuffled,
		// team turns after each other, win with 5 cards in a row of one color

		function colorsInUse(playerArr: Player[]): Color[] {
			return playerArr.map((p) => p.color);
		}

		function colorsNotInUse(playerArr: Player[]): Color[] {
			return colors.filter((color) => !colorsInUse(playerArr).includes(color as Color)) as Color[];
		}

		// two player round
		if ($players.length === 2) {
			colorsNotInUse($players).forEach((color, i) => {
				$players[i].deck = shuffle([
					...$players[i].deck,
					...duplicate(
						Array.from({ length: 9 }, (_, j) => ({ value: j + 1, color: color }) as Card)
					)
				]);
			});

			await set(ref(db, `${$lobbyCode}/players/`), $players);

			// three player round
		} else if ($players.length === 3) {
			const lastDeck = shuffle(
				duplicate(
					Array.from(
						{ length: 9 },
						(_, i) => ({ value: i + 1, color: colorsNotInUse($players)[0] }) as Card
					)
				)
			);

			// set neutral color and add split remaining cards to players
			await set(ref(db, `${$lobbyCode}/neutralColor`), colorsNotInUse($players)[0]);
			await set(
				ref(db, `${$lobbyCode}/players/`),
				$players.map((player) => {
					return {
						...player,
						deck: shuffle([...player.deck, ...lastDeck.splice(0, 6)])
					} as Player;
				})
			);
		}

		// one and four player rounds
		await update(ref(db, `${$lobbyCode}/`), { players: shuffle($players), roundHasStarted: true });
	}

	/**
	 * Stops listening to the current lobby
	 */
	async function stopListeningToLobby() {
		off(ref(db, '.info/connected'));
		off(ref(db, `${$lobbyCode}/`));
	}

	/**
	 * Closes the lobby and resets the app
	 */
	function closeLobby() {
		stopListeningToLobby();
		set(ref(db, `${$lobbyCode}/`), null);
		resetApp();
	}

	/**
	 * Current client leaves the lobby and resets the app for itself
	 */
	async function leaveLobby() {
		await stopListeningToLobby();
		if ($players.length === 1) {
			closeLobby();
			return;
		}
		// indicate that the player left
		await set(ref(db, `${$lobbyCode}/presence/${$player.uuid}/connections`), null);
		await update(ref(db, `${$lobbyCode}/`), {
			players: $players.filter((p) => p.uuid !== $player.uuid)
		});
		if (isHost) {
			const newHost = $players.filter((p) => p.uuid !== $player.uuid)[0];
			await update(ref(db, `${$lobbyCode}/host`), {
				name: newHost.name,
				uuid: newHost.uuid
			});
		}
		resetApp();
	}

	/**
	 * Resets the lobby to its initial state
	 */
	export async function resetLobby() {
		await set(ref(db, `${$lobbyCode}/roundHasStarted`), false);

		await set(
			ref(db, `${$lobbyCode}/players/`),
			$players.map((player) => {
				return {
					...player,
					deck: shuffle(
						duplicate(
							Array.from({ length: 9 }, (_, i) => ({ value: i + 1, color: player.color }) as Card)
						)
					)
				} as Player;
			})
		);

		await set(ref(db, `${$lobbyCode}/gameState`), {
			board: Array(11).fill(Array(11).fill({ value: 0, color: null })),
			turn: 0,
			currentPlayerIndex: 0
		});

		await set(ref(db, `${$lobbyCode}/neutralColor`), '');

		$infoVisible = true;
	}

	/**
	 * Creates a new lobby with a random code and sets the current client as host
	 */
	async function createLobby() {
		if ($player.name === '') {
			toast.error(selectedLanguage.toasts.nameMissing);
			return;
		}

		let newLobbyCode = '';

		let lobbyCodeAlreadyExists = false;
		await get(ref(db, `${$lobbyCode}/`)).then((snap) => {
			if (snap.val() !== null) {
				lobbyCodeAlreadyExists = true;
			}
		});

		if ($lobbyCode.length === 6 && !lobbyCodeAlreadyExists) {
			newLobbyCode = $lobbyCode;
		} else {
			newLobbyCode = Math.random().toString(36).substring(2, 8).toUpperCase();
			$lobbyCode = newLobbyCode;
		}

		const randomColor = colors[Math.floor(Math.random() * colors.length)];

		await set(ref(db, `${newLobbyCode}/`), {
			lobbyCode: newLobbyCode,
			host: { name: $player.name, uuid: $player.uuid },
			players: [
				{
					name: $player.name,
					uuid: $player.uuid,
					color: randomColor,
					deck: shuffle(
						duplicate(
							Array.from({ length: 9 }, (_, i) => ({ value: i + 1, color: randomColor }) as Card)
						)
					),
					wins: 0
				}
			] as Player[],
			gameState: {
				board: Array(11).fill(Array(11).fill({ value: 0, color: null } as Card)) as Card[][],
				turn: 0,
				currentPlayerIndex: 0
			},
			neutralColor: ''
		});

		$lobbyConnected = true;
		getpresence(newLobbyCode);
		listenToLobby(newLobbyCode);
	}

	/**
	 * Joins a lobby with the given code and sets the current client as player
	 */
	async function joinLobby() {
		let playersOnline: Player[] | [] = [];
		await get(ref(db, `${$lobbyCode}/players`)).then((snap) => {
			if (snap.val()) playersOnline = snap.val();
		});

		let validToJoin = true;
		const playerWasHereBefore = playersOnline.some(
			(p: Player) => p.name === $player.name && p.uuid === $player.uuid
		);

		if (!playerWasHereBefore) {
			if ($player.name === '') {
				toast.error(selectedLanguage.toasts.nameMissing);
				$lobbyConnected = false;
				validToJoin = false;
			}

			if ($lobbyCode.length !== 6) {
				toast.error(selectedLanguage.toasts.roomCodeNotValid);
				$lobbyConnected = false;
				validToJoin = false;
			}

			await get(ref(db, `${$lobbyCode}/`)).then((snap) => {
				if (snap.val() === null) {
					toast.error(selectedLanguage.toasts.noMatchingRoom);
					$lobbyConnected = false;
					validToJoin = false;
				}
			});

			if (playersOnline.length === 4) {
				toast.error(selectedLanguage.toasts.roomFull);
				$lobbyConnected = false;
				validToJoin = false;
			}

			if (playersOnline.some((p: Player) => p.uuid === $player.uuid)) {
				toast.error(selectedLanguage.toasts.nameAlreadyTaken);
				$lobbyConnected = false;
				validToJoin = false;
			}

			let roundInProgress = false;
			await get(ref(db, `${$lobbyCode}/roundHasStarted`)).then((snap) => {
				if (snap.val()) roundInProgress = snap.val();
			});
			if (roundInProgress) {
				toast.error(selectedLanguage.toasts.roundStarted);
				$lobbyConnected = false;
				validToJoin = false;
			}
		}

		// if any of the above checks failed, return
		if (!validToJoin) return;

		// else register new player and start listening to lobby changes
		await update(ref(db, `${$lobbyCode}/`), {
			players: playerWasHereBefore
				? playersOnline
				: [
						...playersOnline,
						{
							name: $player.name,
							uuid: $player.uuid,
							color: colors.filter(
								(color) => !playersOnline.some((p) => p.color === color)
							)[0] as Color,
							deck: shuffle(
								duplicate(
									Array.from(
										{ length: 9 },
										(_, i) =>
											({
												value: i + 1,
												color: colors.filter(
													(color) => !playersOnline.some((p) => p.color === color)
												)[0] as Color
											}) as Card
									)
								)
							),
							wins: 0
						}
					]
		});

		$lobbyConnected = true;
		getpresence($lobbyCode);
		listenToLobby($lobbyCode);
	}

	/**
	 * Rejoin a running game if the player was disconnected.
	 */
	async function handleRejoin() {
		$lobbyCode = $oldGame.lobbyCode;
		$player.name = $oldGame.players.find((p: Player) => p.uuid === $player.uuid)?.name;
		$oldGame = {};
		await joinLobby();
	}
</script>

<div class="container mb-4">
	<Heading />

	{#if $oldGame.roundHasStarted !== undefined && $oldGame.roundHasStarted && $players.length === 0}
		<h5 class="mt-4">{selectedLanguage.reconnect.title}</h5>
		<div class="d-flex mb-4">
			<button class="btn btn-danger w-50" on:click={() => ($oldGame = {})}
				>{selectedLanguage.reconnect.dismiss}</button
			>
			<button class="btn btn-warning w-50 ms-1" on:click={handleRejoin}
				>{selectedLanguage.reconnect.reconnect}</button
			>
		</div>
	{/if}

	{#if $infoVisible}
		<LobbyInfo
			on:createLobby={createLobby}
			on:joinLobby={joinLobby}
			on:leaveLobby={leaveLobby}
			on:closeLobby={closeLobby}
		/>
	{/if}

	{#if $lobbyConnected}
		<!-- {#if $infoVisible}
			<div class="d-flex justify-content-between">
				<h4 class="text-start mt-4">
					{$roundHasStarted ? selectedLanguage.order : selectedLanguage.players}
				</h4>
			</div>
			<PlayerList />
		{/if}

		{#if !$roundHasStarted}
			<h4>
				{isHost
					? selectedLanguage.waitingForPlayers.self
					: selectedLanguage.waitingForPlayers.others}
			</h4>
		{/if}

		{#if isHost}
			<button
				class="btn btn{$player.uuid !== $host.uuid || $roundHasStarted ? '-outline' : ''}-primary"
				on:click={startRound}
				disabled={$player.uuid !== $host.uuid || $roundHasStarted}
				>{!$roundHasStarted && $gameState.board.flat().some((cell) => cell.value > 0)
					? selectedLanguage.startGame.again
					: selectedLanguage.startGame.new}</button
			>
			<button
				class="btn btn-outline-warning"
				on:click={resetLobby}
				disabled={$player.uuid !== $host.uuid || !$roundHasStarted}
				>{selectedLanguage.endRound}</button
			>
		{/if} -->

		{#if $roundHasStarted || $gameState.turn > 0}
			<div transition:fly={{ y: 200, duration: 1000 }}>
				{#if $players.length > 0 && $gameState.currentPlayerIndex >= 0}
					{#if $roundHasStarted}
						<p class="mt-1">
							{#if $players.length === 1}
								{selectedLanguage.gameTypes.one}
							{:else if $players.length === 2}
								{selectedLanguage.gameTypes.two}
							{:else if $players.length === 3}
								{selectedLanguage.gameTypes.three[0]}

								<span class={`p-1 rounded bg-${getBeautifulColors($neutralColor)?.bootstrap}`}
									>{selectedLanguage.gameTypes.three[1]}
								</span>
								{selectedLanguage.gameTypes.three[2]}
							{:else if $players.length === 4}
								{selectedLanguage.gameTypes.four}
							{/if}
						</p>
					{/if}
					<div class="d-flex mb-2">
						{#if currentPlayer.deck !== undefined}
							{#if $roundHasStarted}
								<div class="d-flex flex-column">
									<h4 class="">
										{selectedLanguage.turn} #{$gameState.turn + 1}:
										{#if currentPlayer.uuid === $player.uuid}
											{selectedLanguage.yourTurn}
										{:else}
											<span
												class={`p-1 rounded bg-${
													getBeautifulColors(currentPlayer?.color)?.bootstrap
												}`}
												>{currentPlayer.name}
											</span>
										{/if}
									</h4>

									<h6 class="next pt-1 text-secondary">
										Next: {$gameState.currentPlayerIndex === $players.length - 1
											? $players[0].name
											: $players[$gameState.currentPlayerIndex + 1].name}
									</h6>
								</div>

								<div class="cell ms-2 p-0 border rounded bg-dark">
									<Face value={currentPlayer.deck[0].value} color={currentPlayer.deck[0].color} />
								</div>
							{/if}
						{:else}
							<div class="mt-2">
								<h5>{selectedLanguage.noMoreCards}</h5>
								<h4>
									{$winnerWithThrees[0]}
									{selectedLanguage.winsWithThrees[0]}
									{$winnerWithThrees[1]}
									{selectedLanguage.winsWithThrees[1]}.
								</h4>
							</div>
						{/if}
					</div>

					<Board />
				{/if}
			</div>
		{/if}
	{:else}
		<h1 class="mt-5">{selectedLanguage.notConnected}</h1>
	{/if}
</div>

{#if $lobbyConnected}
	<InfoBoard on:start={startRound} on:reset={resetLobby} />
{/if}

<style scoped>
	.next {
		margin-top: -10px;
	}

	.cell {
		margin-top: 2px;
		width: 45px;
		height: 45px;
	}
</style>
