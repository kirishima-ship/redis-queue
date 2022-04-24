import {
	isPartialTrack,
	Kirishima,
	KirishimaNode,
	KirishimaPartialTrack,
	KirishimaPlayerOptions,
	KirishimaPlugin,
	KirishimaTrack,
	Structure
} from '@kirishima/core';
import type { Gateway } from '@kirishima/ws';
import Redis from 'ioredis';
import { TrackEndEventPayload, WebSocketTypeEnum } from 'lavalink-api-types';
import { QueueOptions, NodeTrackRawMessage, LoopType, KirishimaPlayerToJSON } from '../Types';
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

	private async handleNodeRaw(_node: KirishimaNode, _gateway: Gateway, message: NodeTrackRawMessage, kirishima: Kirishima) {
		const player = (await kirishima.options.fetchPlayer!(message.guildId)) as KirishimaPlayer | null;
		if (!player) return;

		if (message.type === WebSocketTypeEnum.TrackEndEvent) {
			void this.trackEnd(player, message, kirishima);
		}

		if (message.type === WebSocketTypeEnum.TrackExceptionEvent) {
			kirishima.emit('trackException', player, player.queue.current, message);
		}

		if (message.type === WebSocketTypeEnum.TrackStuckEvent) {
			kirishima.emit('trackStuck', player, player.queue.current, message);
		}

		if (message.type === WebSocketTypeEnum.TrackStartEvent) {
			player.playing = true;
			await this.redisInstance.hset(`kirishimaQueue:${message.guildId}`, 'player', JSON.stringify({ ...player.toJSON() }));
			kirishima.emit('trackStart', player, player.queue.current, message);
		}
	}

	private async trackEnd(player: KirishimaPlayer, message: TrackEndEventPayload, kirishima: Kirishima) {
		if (message.reason === 'REPLACED') return;
		try {
			player.playing = false;

			await this.redisInstance.hset(`kirishimaQueue:${message.guildId}`, 'player', JSON.stringify({ ...player.toJSON() }));
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

				await player.kirishima.redisInstance.hset(
					`kirishimaQueue:${player.connection.guildId}`,
					'track',
					JSON.stringify({ current: player.queue.current, previous: player.queue.previous })
				);
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

				await player.playTrack(player.queue.current);
				return;
			}
			kirishima.emit('queueEnd', player, player);

			await player.kirishima.redisInstance.hset(
				`kirishimaQueue:${player.connection.guildId}`,
				'track',
				JSON.stringify({ current: player.queue.current, previous: player.queue.previous })
			);
		} catch (e) {
			kirishima.emit('playerError', player, e);
		}
	}

	private async defaultFetchPlayerHandler(guildId: string) {
		const playerOptionsCache = await this.redisInstance.hget(`kirishimaQueue:${guildId}`, 'player');
		const playerTrackCache = await this.redisInstance.hget(`kirishimaQueue:${guildId}`, 'track');
		const playerTracksCache = await this.redisInstance.lrange(`kirishimaQueueTracks:${guildId}`, 0, -1);
		const player = playerOptionsCache ? (JSON.parse(playerOptionsCache) as KirishimaPlayerOptions) : null;
		const playerTrack = playerTrackCache ? JSON.parse(playerTrackCache) : null;
		if (player) {
			player.tracks ??= {
				items: playerTracksCache.map((track) => JSON.parse(track)) ?? [],
				current: playerTrack?.current
					? playerTrack?.current.track
						? new KirishimaTrack(playerTrack.current)
						: new KirishimaPartialTrack(playerTrack.current)
					: null,
				previous: playerTrack?.previous
					? playerTrack?.previous.track
						? new KirishimaTrack(playerTrack.previous)
						: new KirishimaPartialTrack(playerTrack.previous)
					: null
			};
			return new KirishimaPlayer(
				player,
				this.kirishima,
				player.node ? this.kirishima.resolveNode(player!.node)! : this.kirishima.resolveNode()!
			).overrideCurrentPropertyFromOptions(player as unknown as KirishimaPlayerToJSON);
		}

		return null;
	}

	private async defaultSpawnPlayerHandler(guildId: string, options: KirishimaPlayerOptions, node: KirishimaNode | undefined) {
		const player = await this.kirishima.options.fetchPlayer!(guildId);
		if (player) return player;
		const kirishimaPlayer = new (Structure.get('KirishimaPlayer'))(options, this.kirishima, node ?? this.kirishima.resolveNode()!);
		kirishimaPlayer.overrideCurrentPropertyFromOptions(options as unknown as KirishimaPlayerToJSON);
		await this.redisInstance.hset(`kirishimaQueue:${guildId}`, 'player', JSON.stringify({ ...kirishimaPlayer.toJSON(), ...options }));
		return kirishimaPlayer;
	}
}
