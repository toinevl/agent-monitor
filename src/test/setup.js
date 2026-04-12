import '@testing-library/jest-dom';

// Chart.js needs a canvas — stub it for jsdom
HTMLCanvasElement.prototype.getContext = () => null;

// Suppress ReactFlow's ResizeObserver warning in tests
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
