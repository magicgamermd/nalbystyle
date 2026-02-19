class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.buffer = new Float32Array();
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input && input.length > 0) {
            const channelData = input[0];

            // Send audio data to main thread
            this.port.postMessage({
                event: 'audio',
                data: channelData
            });
        }
        return true;
    }
}

registerProcessor('audio-processor', AudioProcessor);
