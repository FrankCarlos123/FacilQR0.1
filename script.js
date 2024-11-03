let stream = null;
let countdown = null;

async function startCamera() {
    try {
        if (stream) {
            stopCamera();
            return;
        }

        stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            } 
        });

        const video = document.getElementById('camera');
        video.srcObject = stream;
        video.style.display = 'block';
        
        // Hide the captured image if it's showing
        document.getElementById('captured-image').style.display = 'none';
        
        // Wait for video to be ready
        await new Promise(resolve => video.onloadedmetadata = resolve);
        
        // Take picture after 2 seconds
        setTimeout(async () => {
            const canvas = document.getElementById('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            
            const context = canvas.getContext('2d');
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // Display the captured image
            const capturedImage = document.getElementById('captured-image');
            capturedImage.src = canvas.toDataURL('image/jpeg');
            capturedImage.style.display = 'block';
            
            // Hide video
            video.style.display = 'none';
            
            // Stop camera
            stopCamera();
            
            // Process the image
            await processImage(canvas);
        }, 2000);

    } catch (error) {
        console.error('Error accessing camera:', error);
        alert('Error al acceder a la cámara. Por favor, verifica los permisos.');
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    document.getElementById('camera').style.display = 'none';
}

function clearAll() {
    // Clear QR codes
    document.getElementById('qrcode').innerHTML = '';
    document.getElementById('qr-text').innerHTML = '';
    document.getElementById('countdown').innerHTML = '';
    
    // Clear captured image
    const capturedImage = document.getElementById('captured-image');
    capturedImage.src = '';
    capturedImage.style.display = 'none';
    
    // Stop camera if running
    stopCamera();
    
    // Clear countdown
    if (countdown) {
        clearInterval(countdown);
        countdown = null;
    }
}

function startCountdown() {
    if (countdown) {
        clearInterval(countdown);
    }

    let seconds = 30;
    const countdownElement = document.getElementById('countdown');
    
    countdown = setInterval(() => {
        countdownElement.textContent = `Actualizando en ${seconds} segundos`;
        seconds--;
        
        if (seconds < 0) {
            clearInterval(countdown);
            startCamera();
        }
    }, 1000);
}

async function processImage(canvas) {
    try {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
        const formData = new FormData();
        formData.append('image', blob);
        
        console.log("Subiendo imagen a ImgBB...");
        
        const uploadResponse = await fetch('https://api.imgbb.com/1/upload?key=52caeb3987a1d3e1407627928b18c14e', {
            method: 'POST',
            body: formData
        });
        
        const uploadResult = await uploadResponse.json();
        if (!uploadResult.success) {
            throw new Error('Error al subir la imagen');
        }

        const imageUrl = uploadResult.data.url;
        console.log("Imagen subida:", imageUrl);
        
        const ocrUrl = `https://api.ocr.space/parse/imageurl?apikey=helloworld&url=${encodeURIComponent(imageUrl)}&OCREngine=2`;
        
        console.log("Procesando OCR...");
        const ocrResponse = await fetch(ocrUrl);
        const ocrResult = await ocrResponse.json();
        
        if (!ocrResult.ParsedResults || ocrResult.ParsedResults.length === 0) {
            throw new Error('OCR no pudo extraer texto de la imagen');
        }

        const text = ocrResult.ParsedResults[0].ParsedText;
        console.log("Texto OCR detectado:", text);

        const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=AIzaSyCa362tZsWj38073XyGaMTmKC0YKc-W0I8`;
        
        const prompt = {
            "contents": [{
                "parts": [{
                    "text": `Del siguiente texto, extrae TODOS los códigos de barras numéricos (números de 12-14 dígitos). Devuelve solo los números separados por comas, sin ningún otro texto. Ejemplo de respuesta correcta: "123456789012,123456789013". Si no hay códigos válidos, devuelve una cadena vacía:\n\n${text}`
                }]
            }]
        };

        console.log("Enviando a Gemini...");
        const geminiResponse = await fetch(GEMINI_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(prompt)
        });

        const geminiResult = await geminiResponse.json();
        console.log("Respuesta de Gemini:", geminiResult);

        if (geminiResult.candidates && geminiResult.candidates[0]) {
            const detectedCodes = geminiResult.candidates[0].content.parts[0].text.trim().split(',');
            const validCodes = detectedCodes.filter(code => /^\d{12,14}$/.test(code.trim()));
            
            if (validCodes.length > 0) {
                // Limpiar contenedores anteriores
                document.getElementById('qrcode').innerHTML = '';
                document.getElementById('qr-text').innerHTML = '';
                
                // Generar QR para cada código válido
                validCodes.forEach((code, index) => {
                    // Crear contenedor para este código QR
                    const qrContainer = document.createElement('div');
                    qrContainer.className = 'qr-item';
                    
                    // Crear div para el código QR
                    const qrDiv = document.createElement('div');
                    qrDiv.id = `qrcode-${index}`;
                    qrContainer.appendChild(qrDiv);
                    
                    // Crear div para el texto
                    const textDiv = document.createElement('div');
                    textDiv.className = 'qr-text';
                    textDiv.textContent = code;
                    qrContainer.appendChild(textDiv);
                    
                    // Agregar al contenedor principal
                    document.getElementById('qrcode').appendChild(qrContainer);
                    
                    // Generar el código QR
                    new QRCode(qrDiv, {
                        text: code,
                        width: 128,
                        height: 128,
                        colorDark: "#000000",
                        colorLight: "#FFFFFF",
                        correctLevel: QRCode.CorrectLevel.H
                    });
                });
                
                startCountdown();
            } else {
                alert('No se encontraron códigos de barras válidos');
            }
        } else {
            alert('No se pudo procesar el texto');
        }

    } catch (error) {
        console.error('Error al procesar la imagen:', error);
        alert('Error al procesar la imagen. Por favor, intenta de nuevo.');
    }
}
