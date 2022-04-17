import type { LoadTrackResponse, KirishimaPartialTrack, KirishimaTrack } from '@kirishima/core';
import type Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';
import type {
	TrackStartEventPayload,
	TrackEndEventPayload,
	TrackExceptionEventPayload,
	TrackStuckEventPayload,
	WebSocketClosedEventPayload
} from 'lavalink-api-types';
import type { GatewayVoiceServerUpdateDispatchData } from 'discord-api-types/gateway/v9';
import type { KirishimaQueueTracks } from '../Structures/KirishimaQueueTracks';
import type { KirishimaVoiceConnection } from '../Structures/KirishimaVoiceConnection';

export type NodeTrackRawMessage =
	| TrackStartEventPayload
	| TrackEndEventPayload
	| TrackExceptionEventPayload
	| TrackStuckEventPayload
	| WebSocketClosedEventPayload;

export interface QueueOptions {
	redis?: Redis | RedisOptions;
	name: string;
}

export enum LoopType {
	None = 0,
	Track,
	Queue
}

export enum ConnectionState {
	Disconnected = 0,
	Connecting,
	Connected,
	Destroyed
}

declare module '@kirishima/core' {
	export interface Kirishima {
		redisInstance: Redis;
	}

	export interface KirishimaPlayer {
		connection: KirishimaVoiceConnection;
		paused: boolean;
		playing: boolean;
		queue: KirishimaQueueTracks;
		loopType: LoopType;
		setLoop(type: LoopType): this;
		resolvePartialTrack(track: KirishimaPartialTrack): Promise<LoadTrackResponse>;
		setPaused(paused: boolean): Promise<this>;
		seekTo(position: number): Promise<this>;
		playTrack(track?: KirishimaTrack | KirishimaPartialTrack | string): Promise<this>;
		get connected(): boolean;
	}

	export interface KirishimaPlayerOptions {
		voiceState?: GatewayVoiceServerUpdateDispatchData | undefined;
		tracks?: {
			items: (KirishimaPartialTrack | KirishimaTrack)[];
			current: KirishimaPartialTrack | KirishimaTrack | null;
			previous: KirishimaPartialTrack | KirishimaTrack | null;
		};
		node?: string;
	}
}
