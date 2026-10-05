(function (global) {
    function createFaceDescriptorFromImageData(imageData, width = 64, height = 64) {
        if (!imageData || !imageData.data) {
            throw new Error('ImageData inválido para gerar descritor facial.');
        }

        const { data } = imageData;
        const descriptor = new Float32Array(64);
        const blockSize = Math.max(1, Math.floor(Math.min(width, height) / 8));

        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                let sum = 0;
                let count = 0;
                const startY = y * blockSize;
                const endY = Math.min(height, startY + blockSize);
                const startX = x * blockSize;
                const endX = Math.min(width, startX + blockSize);

                for (let py = startY; py < endY; py++) {
                    for (let px = startX; px < endX; px++) {
                        const offset = (py * width + px) * 4;
                        sum += (data[offset] + data[offset + 1] + data[offset + 2]) / 3;
                        count += 1;
                    }
                }

                descriptor[y * 8 + x] = count ? sum / count / 255 : 0;
            }
        }

        return descriptor;
    }

    function compareFaceDescriptors(left, right) {
        if (!left || !right || left.length !== right.length) {
            return 0;
        }

        let dot = 0;
        let normLeft = 0;
        let normRight = 0;

        for (let i = 0; i < left.length; i++) {
            const a = left[i];
            const b = right[i];
            dot += a * b;
            normLeft += a * a;
            normRight += b * b;
        }

        const denominator = Math.sqrt(normLeft) * Math.sqrt(normRight);
        return denominator > 1e-6 ? dot / denominator : 0;
    }

    const api = {
        createFaceDescriptorFromImageData,
        compareFaceDescriptors
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    global.FaceFallback = api;
})(typeof window !== 'undefined' ? window : globalThis);
