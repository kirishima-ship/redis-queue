/* eslint-disable @typescript-eslint/no-extraneous-class */
import { KirishimaPartialTrack, KirishimaTrack } from '@kirishima/core';
import type { LavalinkTrack } from 'lavalink-api-types';

export class Util {
	public static toValidTrack(track: string | null) {
		try {
			if (!track) return null;
			const parsedTrack = JSON.parse(track) as KirishimaPartialTrack | KirishimaTrack;

			if (parsedTrack.track) {
				return new KirishimaTrack(parsedTrack as LavalinkTrack);
			}

			return new KirishimaPartialTrack(parsedTrack);
		} catch {
			return null;
		}
	}
}
