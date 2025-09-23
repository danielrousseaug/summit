// PDF.js worker configuration
import { GlobalWorkerOptions } from "pdfjs-dist";

// Use local worker file copied to public directory
if (typeof window !== "undefined" && !GlobalWorkerOptions.workerSrc) {
  GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
}

export { GlobalWorkerOptions };