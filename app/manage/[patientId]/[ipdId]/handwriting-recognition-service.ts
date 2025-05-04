// This is a simulated handwriting recognition service
// In a real implementation, you would integrate with a handwriting recognition API
// such as Google Cloud Vision API, Microsoft Azure Cognitive Services, or a specialized service

// Simple handwriting analysis simulation
// Analyzes the darkness/density of the image to determine how much text was written
export async function recognizeHandwriting(imageData: string): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        // Create an image from the data URL
        const img = new Image()
        img.crossOrigin = "anonymous" // Prevent CORS issues
  
        img.onload = () => {
          // Create a canvas to analyze the image
          const canvas = document.createElement("canvas")
          const ctx = canvas.getContext("2d")
  
          if (!ctx) {
            reject(new Error("Could not create canvas context"))
            return
          }
  
          // Set canvas dimensions to match image
          canvas.width = img.width
          canvas.height = img.height
  
          // Draw the image onto the canvas
          ctx.drawImage(img, 0, 0)
  
          // Get image data for analysis
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const data = imageData.data
  
          // Analyze pixel data to determine text density and patterns
          // This is a simplified simulation - real OCR is much more complex
  
          // Count non-white pixels to estimate text density
          let nonWhitePixels = 0
          const totalPixels = data.length / 4 // RGBA values
  
          for (let i = 0; i < data.length; i += 4) {
            // If pixel is not white (allowing some tolerance)
            if (data[i] < 240 || data[i + 1] < 240 || data[i + 2] < 240) {
              nonWhitePixels++
            }
          }
  
          // Calculate density percentage
          const density = (nonWhitePixels / totalPixels) * 100
  
          // Generate simulated text based on density
          let recognizedText = ""
  
          if (density < 0.5) {
            recognizedText = "No text detected. Please write more clearly."
          } else {
            // Simulate different text lengths based on drawing density
            const textOptions = [
              "Patient reports severe headache for the past 3 days.",
              "Complains of chest pain and shortness of breath.",
              "Experiencing nausea and vomiting since yesterday.",
              "Reports joint pain in knees and ankles.",
              "Patient has fever of 101°F and general weakness.",
              "Complains of lower back pain radiating to left leg.",
              "Patient reports dizziness when standing up quickly.",
              "Experiencing persistent dry cough for two weeks.",
              "Reports difficulty sleeping due to pain.",
              "Patient has rash on arms and torso.",
            ]
  
            // Select text based on density (more density = longer text)
            const textIndex = Math.min(Math.floor(density / 2), textOptions.length - 1)
  
            recognizedText = textOptions[textIndex]
          }
  
          // Add a delay to simulate processing time
          setTimeout(() => {
            resolve(recognizedText)
          }, 1500)
        }
  
        img.onerror = () => {
          reject(new Error("Failed to load image for analysis"))
        }
  
        // Set the source to the data URL
        img.src = imageData
      } catch (error) {
        reject(error)
      }
    })
  }
  
  // Function to convert canvas to image data URL
  export function canvasToImageData(canvas: HTMLCanvasElement): string {
    return canvas.toDataURL("image/png")
  }
  