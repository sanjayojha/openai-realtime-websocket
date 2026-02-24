import { stopAudioPlayback, closePlaybackAudioContext } from "./audioPlayback";
import { createAudioProcessor, getMediaStream, muteAudioStream, unmuteAudioStream, closeStream, type AudioProcessorNode } from "./mediaStream";
import { createSocketConnection, clearAudioBuffer, bufferAudioData, createResponse, cancelResponse, closeSocketConnection, setRealtimeCallbacks } from "./openAiRealtime";

let mediaStream: MediaStream | null = null;
let audioProcessorNode: AudioProcessorNode | null = null;
let connectionInitialized = false;
let agentResponseElement: HTMLDivElement;
let userMessageElement: HTMLDivElement;

const initializeApp = async () => {
    const initializeEl = document.getElementById("connectionStatus") as HTMLDivElement;
    initializeEl.classList.remove("d-none");
    setRealtimeCallbacks({
        onAgentText: handleAgentResponseText,
        onUserText: handleUserResponseText,
    });
    try {
        const socketConnection = await createSocketConnection();
        if (!socketConnection) {
            initializeEl.textContent = "Failed to connect to OpenAI Realtime API. Please try again.";
            return;
        }
    } catch (err) {
        console.error("Connection failed:", err);
        initializeEl.textContent = "Failed to connect to OpenAI Realtime API. Please try again.";
        return;
    }
    mediaStream = await getMediaStream();
    audioProcessorNode = await createAudioProcessor({
        stream: mediaStream,
        onAudioData: bufferAudioData,
    });
    if (mediaStream && audioProcessorNode) {
        connectionInitialized = true;
        const closeConnectionButton = document.getElementById("closeConnection") as HTMLButtonElement;
        closeConnectionButton.disabled = false;
        closeConnectionButton.addEventListener("click", () => {
            closeConnection();
        });

        initializeEl.classList.add("d-none");
    }
};

// used with openAiRealtime
export const handleAgentResponseText = (text: string, done: boolean = false) => {
    agentResponseElement.textContent += text;
    if (done) {
        agentResponseElement.textContent += "\n\n[Agent response complete]";
    }
};

// used with openAiRealtime
export const handleUserResponseText = (text: string, done: boolean = false) => {
    userMessageElement.textContent += text;
    if (done) {
        userMessageElement.textContent += "\n\n[User query complete]";
    }
};

window.addEventListener("load", async () => {
    const stopButton: HTMLButtonElement = document.getElementById("stopRecording") as HTMLButtonElement;
    const startButton: HTMLButtonElement = document.getElementById("startRecording") as HTMLButtonElement;

    agentResponseElement = document.getElementById("agentResponse") as HTMLDivElement;
    userMessageElement = document.getElementById("userQuery") as HTMLDivElement;
    const listeningIndicator = document.getElementById("listening") as HTMLDivElement;

    startButton.addEventListener("click", async () => {
        //only run at page load
        if (!connectionInitialized) {
            try {
                startButton.disabled = true;
                startButton.classList.add("d-none");
                await initializeApp();
            } catch (err) {
                console.error("Failed to initialize:", err);
                connectionInitialized = false;
                return;
            }
        }

        if (connectionInitialized) {
            agentResponseElement.textContent = "";
            userMessageElement.textContent = "";
            cancelResponse(); // cancel any ongoing response in case user starts a new recording before the previous response is complete
            stopAudioPlayback();
            clearAudioBuffer();
            unmuteAudioStream(mediaStream);
            // disable and hide start button, enable and show stop button
            startButton.disabled = true;
            startButton.classList.add("d-none");
            stopButton.disabled = false;
            stopButton.classList.remove("d-none");
            listeningIndicator.classList.remove("d-none");
        }
    });

    stopButton.addEventListener("click", async () => {
        if (!connectionInitialized) {
            console.warn("Connection not initialized. Please start recording first.");
            return;
        }
        muteAudioStream(mediaStream);
        createResponse();
        // disable and hide stop button, enable and show start button
        stopButton.disabled = true;
        stopButton.classList.add("d-none");
        startButton.disabled = false;
        startButton.classList.remove("d-none");
        listeningIndicator.classList.add("d-none");
    });
});

window.addEventListener("beforeunload", () => {
    closeConnection();
});

const closeConnection = () => {
    if (mediaStream && audioProcessorNode) {
        closeStream(mediaStream, audioProcessorNode);
    } else if (mediaStream) {
        closeStream(mediaStream);
    }
    cancelResponse();
    closePlaybackAudioContext();
    closeSocketConnection();
    connectionInitialized = false;
};
