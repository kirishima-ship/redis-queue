import { createVoiceChannelJoinPayload } from '@kirishima/core';
import { WebsocketOpEnum } from 'lavalink-api-types';
import { ConnectionState } from '../Types';
import type { KirishimaPlayer } from './KirishimaPlayer';

export class KirishimaVoiceConnection {
	public state = ConnectionState.Disconnected;
	public constructor(public player: KirishimaPlayer) {}

	public get region() {
		return this.player.voiceServer?.endpoint?.split('.').shift()?.replace(/[0-9]/g, '') ?? null;
	}

	public get channelId() {
		return this.player.options.channelId;
	}

	public get shardId() {
		return this.player.options.shardId;
	}

	public get textChannelId() {
		return this.player.options.textChannelId;
	}

	public get guildId() {
		return this.player.options.guildId;
	}

	public get isSelfDeaf() {
		return (this.player.options.selfDeaf ??= false);
	}

	public async setSelfDeaf(deaf: boolean) {
		await this.player.kirishima.options.send(
			this.player.options,
			createVoiceChannelJoinPayload(
				{
					...this.player.options,
					selfDeaf: deaf
				},
				false
			)
		);
		return this;
	}

	public async setSelfMute(mute: boolean) {
		await this.player.kirishima.options.send(
			this.player.options,
			createVoiceChannelJoinPayload(
				{
					...this.player.options,
					selfMute: mute
				},
				false
			)
		);
		return this;
	}

	public get isSelfMute() {
		return (this.player.options.selfMute ??= false);
	}

	public async destroy() {
		this.state = ConnectionState.Destroying;
		await this.player.node.ws.send({
			op: WebsocketOpEnum.DESTROY,
			guildId: this.guildId
		});
		await this.player.queue.clear();
		this.state = ConnectionState.Destroyed;
	}
}
