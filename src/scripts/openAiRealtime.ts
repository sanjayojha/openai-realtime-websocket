import { actions } from "astro:actions";
import { playAudioChunk, showAudioPlayingIndicator } from "./audioPlayback";
import { markServerDoneSending } from "./audioPlayback";

type RealtimeCallbacks = {
    onAgentText: (text: string, done?: boolean) => void;
    onUserText: (text: string, done?: boolean) => void;
};

type RealtimeServerEvent = {
    type: string;
    delta?: string;
    response?: {
        status?: string;
        [key: string]: unknown;
    };
    [key: string]: unknown;
};

let socketConnection: WebSocket | null = null;
let callbacks: RealtimeCallbacks | null = null;

export const setRealtimeCallbacks = (cb: RealtimeCallbacks) => {
    callbacks = cb;
};

export const createSocketConnection = async (): Promise<boolean> => {
    const { data, error } = await actions.getOpenAIToken({ expireAfter: 60 * 5 }); // Token expires after 5 minutes
    if (error) {
        console.error("Error fetching OpenAI token:", error);
        return false;
    }

    return new Promise((resolve, reject) => {
        socketConnection = new WebSocket("wss://api.openai.com/v1/realtime?model=gpt-realtime-mini", ["realtime", "openai-insecure-api-key." + data.ephemeralKey]);

        socketConnection.onopen = async () => {
            await initializeRealtime();
            console.log("WebSocket connection established with OpenAI Realtime API.");
            resolve(true);
        };

        socketConnection.onclose = (event: CloseEvent) => {
            console.log("WebSocket closed:", event.code, event.reason);
        };

        socketConnection.onerror = (event: Event) => {
            console.error("WebSocket error:", event);
            reject(new Error("WebSocket connection error"));
        };

        socketConnection.onmessage = (event: MessageEvent) => {
            const data: RealtimeServerEvent = JSON.parse(event.data);
            // handling incoming audio delta messages from OpenAI Realtime API and playing the audio chunks
            if (data.type === "response.output_audio.delta") {
                showAudioPlayingIndicator();
                const audioChunkBase64 = data.delta || "";
                playAudioChunk(audioChunkBase64);
            }

            // when output_modalities: ["audio"] is set in initializeRealtime, we get "response.output_audio_transcript.delta" and when output_modalities: ["text"] is set in initializeRealtime, we get "response.output_text.delta"
            if (data.type === "response.output_audio_transcript.delta" || data.type === "response.output_text.delta") {
                const aiTranscriptText = data.delta || "";
                callbacks?.onAgentText(aiTranscriptText);
            }

            // lets handle user audio transcript received from openAI
            if (data.type === "conversation.item.input_audio_transcription.delta") {
                const userTranscriptText = data.delta || "";
                callbacks?.onUserText(userTranscriptText);
            }

            // fired when OpenAI Realtime API has finished sending audio chunks for a response
            if (data.type === "response.output_audio.done") {
                // //stopAudioPlayback();
                // hideAudioPlayingIndicator();
                markServerDoneSending();
            }

            // fired when OpenAI Realtime API has finished sending transcript for its audio response [in [audio] modality] OR (in [text] modality) has finished sending text response
            if (data.type === "response.output_audio_transcript.done" || data.type === "response.output_text.done") {
                callbacks?.onAgentText("", true); // Mark agent response as complete
            }

            // Handle response completion
            if (data.type === "response.done" && data.response?.status === "cancelled") {
                markServerDoneSending();
            }

            if (data.type === "conversation.item.input_audio_transcription.completed") {
                callbacks?.onUserText("", true); // Mark user query as complete
            }
        };
    });
};

const initializeRealtime = async () => {
    if (!socketConnection || socketConnection.readyState !== WebSocket.OPEN) {
        console.error("WebSocket is not open. Cannot initialize realtime connection.");
        return;
    }
    const initEvent = {
        type: "session.update",
        session: {
            type: "realtime",
            instructions: "You are a helpful assistant that provides concise answers to user queries.",
            audio: {
                output: {
                    format: {
                        rate: 24000,
                        type: "audio/pcm",
                    },
                    voice: "cedar",
                },
                input: {
                    turn_detection: null, // Disabling turn detection because we are triggering manual response when streaming pause.
                    transcription: {
                        model: "gpt-4o-mini-transcribe",
                        language: "en",
                        prompt: "expect words from a user who is not a native English speaker. Its Indian accent",
                    },
                },
            },
        },
    };
    socketConnection.send(JSON.stringify(initEvent));
};

export const clearAudioBuffer = () => {
    if (!socketConnection || socketConnection.readyState !== WebSocket.OPEN) {
        return;
    }
    socketConnection.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
};

export const bufferAudioData = (base64AudioData: string) => {
    if (!socketConnection || socketConnection.readyState !== WebSocket.OPEN) {
        return;
    }
    const audioEvent = {
        type: "input_audio_buffer.append",
        audio: base64AudioData,
    };
    socketConnection.send(JSON.stringify(audioEvent));
};

export const createResponse = () => {
    if (!socketConnection || socketConnection.readyState !== WebSocket.OPEN) {
        return;
    }
    socketConnection.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
    socketConnection.send(JSON.stringify({ type: "response.create" }));
};

export const cancelResponse = () => {
    if (!socketConnection || socketConnection.readyState !== WebSocket.OPEN) {
        return;
    }
    socketConnection.send(JSON.stringify({ type: "response.cancel" }));
};

export const closeSocketConnection = () => {
    if (socketConnection) {
        socketConnection.close();
        socketConnection = null;
    }
};
