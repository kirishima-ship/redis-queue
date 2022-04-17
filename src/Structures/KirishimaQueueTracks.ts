import { isPartialTrack, isTrack, KirishimaPartialTrack, KirishimaTrack } from '@kirishima/core';
import type { KirishimaPlayer } from './KirishimaPlayer';

export class KirishimaQueueTracks extends Array<KirishimaPartialTrack | KirishimaTrack> {
	public current: KirishimaPartialTrack | KirishimaTrack | null = null;
	public previous: KirishimaPartialTrack | KirishimaTrack | null = null;

	public constructor(public kirishimaPlayer: KirishimaPlayer, ...items: (KirishimaPartialTrack | KirishimaTrack)[]) {
		super(...items);
	}

	public async add(trackOrTracks: KirishimaPartialTrack | KirishimaTrack | (KirishimaPartialTrack | KirishimaTrack)[]) {
		if (!ValidateValidTracks(trackOrTracks)) throw new Error('Track(s) must be a "KirishimaPartialTrack" or "KirishimaTrack".');
		if (!this.current) {
			if (!Array.isArray(trackOrTracks)) {
				this.current = trackOrTracks;
				await this.kirishimaPlayer.kirishima.redisInstance.hset(
					`kirishimaQueue:${this.kirishimaPlayer.connection.guildId}`,
					'track',
					JSON.stringify({ current: this.current, previous: this.previous })
				);
				return;
			}
			this.current = (trackOrTracks = [...trackOrTracks]).shift()!;
			await this.kirishimaPlayer.kirishima.redisInstance.hset(
				`kirishimaQueue:${this.kirishimaPlayer.connection.guildId}`,
				'track',
				JSON.stringify({ current: this.current, previous: this.previous })
			);
		}

		if (Array.isArray(trackOrTracks)) {
			this.push(...trackOrTracks);
			for (const track of trackOrTracks) {
				await this.kirishimaPlayer.kirishima.redisInstance.rpush(
					`kirishimaQueueTracks:${this.kirishimaPlayer.connection.guildId}`,
					JSON.stringify(track)
				);
			}
		} else {
			await this.kirishimaPlayer.kirishima.redisInstance.rpush(
				`kirishimaQueueTracks:${this.kirishimaPlayer.connection.guildId}`,
				JSON.stringify(trackOrTracks)
			);
			this.push(trackOrTracks);
		}
	}

	public get totalSize() {
		return this.length + (this.current ? 1 : 0);
	}

	public get size() {
		return this.length;
	}

	public async clear(clearPlayer = true) {
		this.splice(0);
		await this.kirishimaPlayer.kirishima.redisInstance.del(`kirishimaQueueTracks:${this.kirishimaPlayer.connection.guildId}`);
		if (clearPlayer) await this.kirishimaPlayer.kirishima.redisInstance.del(`kirishimaQueue`, this.kirishimaPlayer.connection.guildId);
	}

	public async shuffle() {
		const list = await this.kirishimaPlayer.kirishima.redisInstance.lrange(
			`kirishimaQueueTracks:${this.kirishimaPlayer.connection.guildId}`,
			0,
			-1
		);
		for (let i = list.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[list[i], list[j]] = [list[j], list[i]];
		}
		await this.clear(false);
		for (const track of list) {
			await this.kirishimaPlayer.kirishima.redisInstance.rpush(`kirishimaQueueTracks:${this.kirishimaPlayer.connection.guildId}`, track);
		}
	}
}

export function ValidateValidTracks(tracks: KirishimaPartialTrack | KirishimaTrack | (KirishimaPartialTrack | KirishimaTrack)[]) {
	if (Array.isArray(tracks)) {
		for (const track of tracks) {
			if (!(isTrack(track) || isPartialTrack(track))) return false;
		}
		return true;
	}

	return isTrack(tracks) || isPartialTrack(tracks);
}
