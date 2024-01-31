<script lang="ts">
	import { host, player, roundHasStarted, gameState } from '$lib/store';
	import { translations } from '$lib/translations';
	import { languageId } from '$lib/store';
	import PlayerList from './PlayerList.svelte';
	import { infoVisible } from '$lib/store';
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

	export let initalHeight = 400;

	let dragging = false;
	let pageY = 0;

	let height = initalHeight;

	$: {
		if (dragging) {
			const grabButton = document.querySelector('#grab-button')!.clientHeight;
			height = window.innerHeight - pageY + grabButton / 2;
			if (pageY >= window.innerHeight - grabButton) {
				height = grabButton;
			}
		}
	}

	$: selectedLanguage = translations[$languageId];
	$: isHost = $host.uuid === $player.uuid;
</script>

<svelte:window
	on:mousemove={(e) => {
		e.preventDefault();
		({ pageY } = e);
	}}
	on:touchmove={(e) => {
		e.preventDefault();
		pageY = e.touches[0].pageY;
	}}
/>

<div
	class="offcanvas offcanvas-bottom {$infoVisible ? 'show' : ''} w-100 rounded-4"
	data-bs-backdrop="false"
	data-bs-scroll="false"
	tabindex="-1"
	id="offcanvasBottom"
	style="height: {height + 'px'}"
>
	<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
	<h1
		id="grab-button"
		class="text-center cursor-grab"
		on:mousedown={() => (dragging = true)}
		on:touchstart={() => (dragging = true)}
		on:mouseup={() => (dragging = false)}
		on:touchend={() => (dragging = false)}
	>
		<span class="grab-icon"></span>
	</h1>

	<!-- <div class="offcanvas-header">
		<h5 class="offcanvas-title" id="offcanvasBottomLabel">Offcanvas bottom</h5>
		<button type="button" class="btn-close text-reset" data-bs-dismiss="offcanvas"></button>
	</div> -->
	<div class="offcanvas-body container">
		{#if $infoVisible}
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
				on:click={() => dispatch('start')}
				disabled={$player.uuid !== $host.uuid || $roundHasStarted}
				>{!$roundHasStarted && $gameState.board.flat().some((cell) => cell.value > 0)
					? selectedLanguage.startGame.again
					: selectedLanguage.startGame.new}</button
			>
			<button
				class="btn btn-outline-warning"
				on:click={() => dispatch('reset')}
				disabled={$player.uuid !== $host.uuid || !$roundHasStarted}
				>{selectedLanguage.endRound}</button
			>
		{/if}
	</div>
</div>

<style lang="scss">
	.grab-icon {
		display: block;
		width: 7rem;
		height: 0.5rem;
		background: #999999;
		margin: 10px auto;
		border-radius: 0.5rem;
	}
</style>
