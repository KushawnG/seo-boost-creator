// Global type declarations for the application
declare module '*.png' {
  const value: string;
  export default value;
}

declare module '*.jpg' {
  const value: string;
  export default value;
}

declare module '*.jpeg' {
  const value: string;
  export default value;
}

declare module '*.svg' {
  const value: string;
  export default value;
}

// Extend Window interface if needed
declare global {
  interface Window {
    // Add any global window properties here if needed
  }
}

export {};