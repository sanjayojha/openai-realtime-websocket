class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.bufferSize = 4800; // 200ms (at 24kHz sample rate)
        this.buffer = new Float32Array(this.bufferSize);
        this.bufferIndex = 0;
        this.isMuted = false;

        this.port.onmessage = (event) => {
            if (event.data && event.data.type === "toggleMute") {
                this.isMuted = event.data.value;
                if (this.isMuted) {
                    // clear the buffer when muting
                    this.bufferIndex = 0;
                }
            }
        };
    }

    process(inputs, outputs, parameters) {
        if (this.isMuted) return true; // skip processing when muted
        const input = inputs[0];
        if (input.length > 0) {
            const channelData = input[0];
            for (let i = 0; i < channelData.length; i++) {
                this.buffer[this.bufferIndex++] = channelData[i];
                if (this.bufferIndex >= this.bufferSize) {
                    this.port.postMessage({
                        audio: this.buffer.slice(0),
                    });
                    this.bufferIndex = 0;
                }
            }
        }
        return true; // Keep the processor alive
    }
}

registerProcessor("audio-processor", AudioProcessor);
