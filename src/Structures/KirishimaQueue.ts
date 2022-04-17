import { isPartialTrack, Kirishima, KirishimaNode, KirishimaPlayerOptions, KirishimaPlugin, Structure } from '@kirishima/core';
import type { Gateway } from '@kirishima/ws';
import Redis from 'ioredis';
import {
	TrackEndEventPayload,
	TrackExceptionEventPayload,
	TrackStartEventPayload,
	TrackStuckEventPayload,
	WebSocketTypeEnum
} from 'lavalink-api-types';
import { QueueOptions, NodeTrackRawMessage, LoopType } from '../Types';
import { KirishimaPlayer } from './KirishimaPlayer';

export class KirishimaQueue extends KirishimaPlugin {
	private redisInstance: Redis;
	private kirishima!: Kirishima;
	public constructor(public options: QueueOptions = { name: 'KirishimaQueue' }) {
		super({
			name: options.name
		});
		this.redisInstance = options.redis instanceof Redis ? options.redis : new Redis(options.redis!);
	}

	public load(kirishima: Kirishima) {
		Structure.extend('KirishimaPlayer', () => KirishimaPlayer);
		kirishima.options.fetchPlayer = this.defaultFetchPlayerHandler.bind(this);
		kirishima.options.spawnPlayer = this.defaultSpawnPlayerHandler.bind(this);
		kirishima.redisInstance = this.redisInstance;
		kirishima.on('nodeRaw', (node: KirishimaNode, gateway: Gateway, message: NodeTrackRawMessage) =>
			this.handleNodeRaw(node, gateway, message, kirishima)
		);

		this.kirishima = kirishima;
	}

	private handleNodeRaw(_node: KirishimaNode, _gateway: Gateway, message: NodeTrackRawMessage, kirishima: Kirishima) {
		const player = kirishima.options.fetchPlayer!(message.guildId) as KirishimaPlayer | null;
		if (!player) return;

		if (message.type === WebSocketTypeEnum.TrackEndEvent) {
			void this.trackEnd(player, message, kirishima);
		}

		if (message.type === WebSocketTypeEnum.TrackExceptionEvent) {
			this.trackException(player, message, kirishima);
		}

		if (message.type === WebSocketTypeEnum.TrackStuckEvent) {
			this.trackStuck(player, message, kirishima);
		}

		if (message.type === WebSocketTypeEnum.TrackStartEvent) {
			this.trackStart(player, message, kirishima);
		}
	}

	private async trackEnd(player: KirishimaPlayer, message: TrackEndEventPayload, kirishima: Kirishima) {
		if (message.reason === 'REPLACED') return;
		try {
			player.playing = false;
			if (player.loopType === LoopType.Track) {
				if (isPartialTrack(player.queue.current) && player.queue.current) {
					const track = await player.resolvePartialTrack(player.queue.current);
					if (track.tracks.length) {
						await player.playTrack(track.tracks[0].track);
						return;
					}
					await player.stopTrack();
					return;
				}

				await player.kirishima.redisInstance.hset(
					`kirishimaQueue:${player.connection.guildId}`,
					'track',
					JSON.stringify({ current: player.queue.current, previous: player.queue.previous })
				);

				if (player.queue.current) {
					await player.playTrack(player.queue.current);
					return;
				}
			}

			if (player.queue.current && player.loopType === LoopType.Queue) {
				await player.queue.add(player.queue.current);
				player.queue.previous = player.queue.current;
				player.queue.current = await player.queue.shiftTrack();

				await player.kirishima.redisInstance.hset(
					`kirishimaQueue:${player.connection.guildId}`,
					'track',
					JSON.stringify({ current: player.queue.current, previous: player.queue.previous })
				);

				if (player.queue.current) {
					if (isPartialTrack(player.queue.current)) {
						const track = await player.resolvePartialTrack(player.queue.current);
						if (track.tracks.length) {
							await player.playTrack(track.tracks[0].track);
							return;
						}
						await player.stopTrack();
						return;
					}

					await player.playTrack(player.queue.current!);
					return;
				}
				kirishima.emit('queueEnd', player, player);
			}

			player.queue.previous = player.queue.current;
			player.queue.current = await player.queue.shiftTrack();

			await player.kirishima.redisInstance.hset(
				`kirishimaQueue:${player.connection.guildId}`,
				'track',
				JSON.stringify({ current: player.queue.current, previous: player.queue.previous })
			);

			if (player.queue.current) {
				if (isPartialTrack(player.queue.current)) {
					const track = await player.resolvePartialTrack(player.queue.current);
					if (track.tracks.length) {
						await player.playTrack(track.tracks[0].track);
						return;
					}
					await player.stopTrack();
					return;
				}

				await player.playTrack(player.queue.current!);
				return;
			}
			kirishima.emit('queueEnd', player, player);
		} catch (e) {
			kirishima.emit('playerError', player, e);
		}
	}

	private trackException(player: KirishimaPlayer, message: TrackExceptionEventPayload, kirishima: Kirishima) {
		kirishima.emit('trackException', player, player.queue.current, message);
	}

	private trackStuck(player: KirishimaPlayer, message: TrackStuckEventPayload, kirishima: Kirishima) {
		kirishima.emit('trackStuck', player, player.queue.current, message);
	}

	private trackStart(player: KirishimaPlayer, message: TrackStartEventPayload, kirishima: Kirishima) {
		player.playing = true;
		kirishima.emit('trackStart', player, player.queue.current, message);
	}

	private async defaultFetchPlayerHandler(guildId: string) {
		const playerOptionsCache = await this.redisInstance.hget(`kirishimaQueue:${guildId}`, 'player');
		const playerTrackCache = await this.redisInstance.hget(`kirishimaQueue:${guildId}`, 'track');
		const playerTracksCache = await this.redisInstance.lrange(`kirishimaQueueTracks:${guildId}`, 0, -1);
		const player = playerOptionsCache ? (JSON.parse(playerOptionsCache) as KirishimaPlayerOptions) : null;
		const playerTrack = playerTrackCache ? JSON.parse(playerTrackCache) : null;
		if (!player) return null;
		player.tracks!.items = playerTracksCache.map((track) => JSON.parse(track)) ?? [];
		player.tracks!.current = playerTrack.current;
		player.tracks!.previous = playerTrack.previous;
		return new KirishimaPlayer(player, this.kirishima, this.kirishima.resolveNode(player!.node)!);
	}

	private async defaultSpawnPlayerHandler(guildId: string, options: KirishimaPlayerOptions, node: KirishimaNode) {
		const player = await this.kirishima.options.fetchPlayer!(guildId);
		if (player) return player;
		const kirishimaPlayer = new (Structure.get('KirishimaPlayer'))(options, this.kirishima, node);
		await this.redisInstance.hset(
			`kirishimaQueue:${guildId}`,
			'player',
			JSON.stringify({ node: node.options.identifier, voiceState: undefined, current: null, previous: null, ...options })
		);
		return kirishimaPlayer;
	}
}
