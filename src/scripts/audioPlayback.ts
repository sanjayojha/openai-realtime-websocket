// Audio playback module using AudioContext

import { DEFAULT_AUDIO_CONSTRAINTS } from "./mediaStream";

let audioContext: AudioContext | null = null;
let nextStartTime = 0;
let isPlaying = false;
let audioPlayingIndicator: HTMLElement | null = null;
let lastSource: AudioBufferSourceNode | null = null;
let serverDoneSending = false;
let activeSources: Set<AudioBufferSourceNode> = new Set(); // required to handle stopping playback when sources are already scheduled to play

export const initializeAudioContext = async () => {
    if (!audioPlayingIndicator) {
        audioPlayingIndicator = document.getElementById("audioPlayingIndicator");
    }
    if (!audioContext) {
        audioContext = new AudioContext({ sampleRate: DEFAULT_AUDIO_CONSTRAINTS.sampleRate });
    }

    if (audioContext.state === "suspended") {
        await audioContext.resume();
    }

    return audioContext;
};

// Convert base64 PCM16 to Float32Array
const base64ToFloat32Array = (base64: string) => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    const dataView = new DataView(bytes.buffer);
    const float32Array = new Float32Array(bytes.length / 2);

    for (let i = 0; i < float32Array.length; i++) {
        const int16 = dataView.getInt16(i * 2, true);
        float32Array[i] = int16 / (int16 < 0 ? 0x8000 : 0x7fff);
    }

    return float32Array;
};

// Play audio chunk
export const playAudioChunk = async (base64Audio: string) => {
    if (!base64Audio) return;
    await initializeAudioContext();

    const float32Array = base64ToFloat32Array(base64Audio);
    if (!audioContext) {
        console.error("AudioContext is not initialized.");
        return;
    }
    const audioBuffer = audioContext.createBuffer(
        1, // mono
        float32Array.length,
        24000, // sample rate
    );

    audioBuffer.getChannelData(0).set(float32Array);

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);

    const currentTime = audioContext.currentTime;
    const startTime = Math.max(currentTime, nextStartTime);

    source.start(startTime);
    nextStartTime = startTime + audioBuffer.duration;
    isPlaying = true;
    lastSource = source;
    activeSources.add(source);

    source.onended = () => {
        activeSources.delete(source);
        // Check if this was the last chunk
        if (source === lastSource && serverDoneSending) {
            isPlaying = false;
            hideAudioPlayingIndicator();
        }
    };
};

export const markServerDoneSending = () => {
    serverDoneSending = true;
    if (!isPlaying && lastSource) {
        hideAudioPlayingIndicator();
    }
};

export const stopAudioPlayback = () => {
    activeSources.forEach((source) => {
        try {
            source.stop();
        } catch (err) {
            // ignore
        }
    });
    activeSources.clear();
    nextStartTime = 0;
    isPlaying = false;
    lastSource = null;
    serverDoneSending = false;
    hideAudioPlayingIndicator();
    // Note: Can't stop already scheduled sources, but reset timing
};

export const closePlaybackAudioContext = async () => {
    if (audioContext && audioContext.state !== "closed") {
        stopAudioPlayback(); // Stop all sources before closing
        await audioContext.close();
        audioContext = null;
    }
};

export const getAudioPlaybackState = () => {
    return { isPlaying, nextStartTime };
};

export const showAudioPlayingIndicator = () => {
    audioPlayingIndicator?.classList.remove("d-none");
};

export const hideAudioPlayingIndicator = () => {
    audioPlayingIndicator?.classList.add("d-none");
};
