let currentProcessor: AudioWorkletNode | null = null;

type AudioConstraints = {
    sampleRate?: number;
    channelCount?: number;
    echoCancellation?: boolean;
    noiseSuppression?: boolean;
};

type AudioProcessorParams = {
    stream: MediaStream | null;
    onAudioData: (base64Audio: string) => void | null;
};

export type AudioProcessorNode = {
    audioContext: AudioContext;
    processor: AudioWorkletNode;
    source: MediaStreamAudioSourceNode;
};

export const DEFAULT_AUDIO_CONSTRAINTS = {
    sampleRate: 24000,
    channelCount: 1, // Mono audio for OpenAI Realtime API
    echoCancellation: true,
    noiseSuppression: true,
} as const;

export const getMediaStream = async (audioConstraints?: AudioConstraints): Promise<MediaStream | null> => {
    if (!navigator.mediaDevices?.getUserMedia) {
        console.error("MediaDevices API or getUserMedia is not supported in this browser.");
        return null;
    }
    const constraints: MediaStreamConstraints = {
        audio: { ...DEFAULT_AUDIO_CONSTRAINTS, ...audioConstraints },
        video: false,
    };

    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        return stream;
    } catch (error) {
        console.error("Error accessing media devices:", error);
        return null;
    }
};

export const muteAudioStream = (stream: MediaStream | null) => {
    if (!stream) return;
    stream.getAudioTracks().forEach((track) => {
        track.enabled = false;
    });
    currentProcessor?.port.postMessage({ type: "toggleMute", value: true });
    console.log("Audio stream muted.");
};

export const unmuteAudioStream = (stream: MediaStream | null) => {
    if (!stream) return;
    stream.getAudioTracks().forEach((track) => {
        track.enabled = true;
    });
    currentProcessor?.port.postMessage({ type: "toggleMute", value: false });
    console.log("Audio stream unmuted.");
};

export const createAudioProcessor = async (processorParams: AudioProcessorParams): Promise<AudioProcessorNode | null> => {
    const { stream, onAudioData } = processorParams;
    if (!stream) {
        console.error("No media stream provided for audio processing.");
        return null;
    }
    const audioContext = new AudioContext({ sampleRate: DEFAULT_AUDIO_CONSTRAINTS.sampleRate });
    await audioContext.audioWorklet.addModule("/scripts/audioProcessor.js");
    const source = audioContext.createMediaStreamSource(stream);
    const processor = new AudioWorkletNode(audioContext, "audio-processor");
    currentProcessor = processor;
    source.connect(processor);
    processor.port.onmessage = (event) => {
        const float32Array = event.data.audio;
        if (float32Array.length > 0) {
            const base64Audio = base64EncodeAudio(float32Array);
            if (onAudioData) {
                onAudioData(base64Audio);
            }
        }
    };
    return { audioContext, processor, source };
};

// Converts Float32Array of audio data to PCM16 ArrayBuffer
const floatTo16BitPCM = (float32Array: Float32Array): ArrayBuffer => {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    let offset = 0;
    for (let i = 0; i < float32Array.length; i++, offset += 2) {
        let s = Math.max(-1, Math.min(1, float32Array[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buffer;
};

// Converts a Float32Array to base64-encoded PCM16 data
const base64EncodeAudio = (float32Array: Float32Array): string => {
    const arrayBuffer = floatTo16BitPCM(float32Array);
    let binary = "";
    const bytes = new Uint8Array(arrayBuffer);
    const chunkSize = 0x8000; // 32KB chunk size
    for (let i = 0; i < bytes.length; i += chunkSize) {
        let chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    return btoa(binary);
};

export const closeStream = (stream: MediaStream, audioProcessorNode?: AudioProcessorNode) => {
    if (audioProcessorNode) {
        audioProcessorNode.processor.disconnect();
        audioProcessorNode.source.disconnect();
        audioProcessorNode.audioContext.close();
    }
    if (stream) {
        stream.getTracks().forEach((track) => {
            track.stop();
        });
    }
};
