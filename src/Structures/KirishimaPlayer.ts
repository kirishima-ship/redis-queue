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
import { ConnectionState, KirishimaPlayerToJSON, LoopType } from '../Types';
import { KirishimaQueueTracks } from './KirishimaQueueTracks';
import { KirishimaVoiceConnection } from './KirishimaVoiceConnection';

export class KirishimaPlayer extends Structure.get('KirishimaPlayer') {
	public queue: KirishimaQueueTracks;
	public loopType: LoopType = LoopType.None;
	public connection = new KirishimaVoiceConnection(this);
	public position = 0;

	public constructor(public options: KirishimaPlayerOptions, kirishima: Kirishima, node: KirishimaNode) {
		super(options, kirishima, node);
		this.queue = new KirishimaQueueTracks(this, ...(options.tracks?.items ?? []));
		this.queue.current = options.tracks?.current ?? null;
		this.queue.previous = options.tracks?.previous ?? null;
	}

	public overrideCurrentPropertyFromOptions(options: KirishimaPlayerToJSON) {
		if (options.loopType) {
			this.loopType = options.loopType;
		}

		if (options.connected) {
			this.connection.state = options.connected ? ConnectionState.Connected : ConnectionState.Disconnected;
		}

		if (options.paused) {
			this.paused = options.paused;
		}

		if (options.playing) {
			this.playing = options.playing;
		}

		if (options.connection) {
			this.connection.overrideCurrentPropertyFromOptions(options.connection);
		}

		if (options.node && this.kirishima.resolveNode(options.node)) {
			this.node = this.kirishima.resolveNode(options.node)!;
		}

		if (options.position) {
			this.position = options.position;
		}

		return this;
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

		if (typeof track === 'string') {
			return super.playTrack(track);
		}

		if (typeof track === 'object' && track.track) {
			return super.playTrack(track.track);
		}

		throw new Error('No track to play, is the track invalid?');
	}

	public get connected() {
		return Boolean(this.voiceServer && this.voiceState?.channel_id && this.connection.state === ConnectionState.Connected);
	}

	public toJSON() {
		return {
			node: this.node.options.identifier,
			loopType: this.loopType,
			connected: this.connected,
			paused: this.paused,
			playing: this.playing,
			position: this.position,
			connection: this.connection.toJSON()
		};
	}
}
