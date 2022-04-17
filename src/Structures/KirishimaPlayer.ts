import {
	isPartialTrack,
	isTrack,
	Kirishima,
	KirishimaNode,
	KirishimaPartialTrack,
	KirishimaPlayerOptions,
	KirishimaTrack,
	Structure
} from '@kirishima/core';
import { ConnectionState, LoopType } from '../Types';
import { KirishimaQueueTracks } from './KirishimaQueueTracks';
import { KirishimaVoiceConnection } from './KirishimaVoiceConnection';

export class KirishimaPlayer extends Structure.get('KirishimaPlayer') {
	public queue: KirishimaQueueTracks;
	public loopType: LoopType = LoopType.None;
	public connection = new KirishimaVoiceConnection(this);

	public constructor(public options: KirishimaPlayerOptions, kirishima: Kirishima, node: KirishimaNode) {
		super(options, kirishima, node);
		this.queue = new KirishimaQueueTracks(this, ...(options.tracks?.items ?? []));
		this.queue.current = options.tracks?.current ?? null;
		this.queue.previous = options.tracks?.previous ?? null;
	}

	public setLoop(type: LoopType) {
		this.loopType = type;
		return this;
	}

	public async connect() {
		this.connection.state = ConnectionState.Connecting;
		const player = await super.connect();
		this.connection.state = ConnectionState.Connected;
		return player;
	}

	public async disconnect() {
		const player = await super.disconnect();
		this.connection.state = ConnectionState.Disconnected;
		return player;
	}

	public resolvePartialTrack(track: KirishimaPartialTrack) {
		return this.kirishima.resolveTracks(`${track.info?.title} - ${track.info?.author ? track.info.author : ''}`);
	}

	public async playTrack(track?: KirishimaTrack | KirishimaPartialTrack | string) {
		if (track && isTrack(track)) {
			return super.playTrack(track);
		}

		if (this.queue.current && isTrack(this.queue.current)) {
			return super.playTrack(this.queue.current);
		}

		if (track && isPartialTrack(track)) {
			const resolved = await this.resolvePartialTrack(track);
			if (resolved.tracks.length && isTrack(resolved.tracks[0])) {
				return super.playTrack(resolved.tracks[0].track);
			}
		}

		if (this.queue.current && isPartialTrack(this.queue.current)) {
			const resolved = await this.resolvePartialTrack(this.queue.current);
			if (resolved.tracks.length && isTrack(resolved.tracks[0])) {
				return super.playTrack(resolved.tracks[0].track);
			}
		}

		throw new Error('No track to play');
	}

	public get connected() {
		return Boolean(this.voiceServer && this.voiceState?.channel_id && this.connection.state === ConnectionState.Connected);
	}
}
